"""
Billing: orders, payment gateways and entitlement settlement.

All amounts and entitlements are computed inside the server transaction; a client
can never choose a price or mark its own payment successful.

Gateways (Strategy pattern):
- SSLCommerzGateway: hosted checkout + server-to-server validation (sandbox or live).
- MockGateway: development-only shortcut, enabled explicitly with MOCK_PAYMENTS_ENABLED.
`settle()` is the single place a successful payment grants entitlements, so both
gateways (and the IPN) share identical, idempotent, row-locked behaviour.
"""
import calendar
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP, InvalidOperation
from abc import ABC, abstractmethod
import logging
from types import SimpleNamespace
from typing import Optional
import uuid
import httpx
from fastapi import HTTPException
from sqlalchemy import select, func
from app.core.config import settings
from app.models import User
from app.models.platform import Order, Plan, PaymentEvent, FinancialSnapshot, Ledger, EligibleView, Withdrawal
from app.models.platform import FinancialAdjustment
from app.services.policy import configuration, audit, utc, month_now
from app.services.notification_service import deliver, notify

log = logging.getLogger(__name__)


class PaymentGateway(ABC):
    name: str

    @abstractmethod
    def available(self) -> bool:
        """Whether this gateway may take new orders in the current environment."""


class MockGateway(PaymentGateway):
    name = "mock"

    def available(self) -> bool:
        return settings.ENVIRONMENT == "development" and settings.MOCK_PAYMENTS_ENABLED

    def confirm(self, outcome: str) -> str:
        if not self.available():
            raise HTTPException(503, "Development payments are disabled")
        return outcome


class SSLCommerzGateway(PaymentGateway):
    """SSLCommerz v4 hosted checkout. Docs: https://developer.sslcommerz.com/doc/v4/"""
    name = "sslcommerz"

    @property
    def base_url(self) -> str:
        if settings.SSLCOMMERZ_SANDBOX:
            return "https://sandbox.sslcommerz.com"
        return "https://securepay.sslcommerz.com"

    def available(self) -> bool:
        return bool(settings.SSLCOMMERZ_STORE_ID and settings.SSLCOMMERZ_STORE_PASSWORD)

    async def create_session(self, order: Order, user: User, callback_base: str, ipn_url: str) -> tuple[str, str]:
        """Open a hosted checkout session; returns (GatewayPageURL, sessionkey)."""
        product = "BornoVerse Premium" if order.kind == "subscription" else "BornoVerse Publisher Registration"
        payload = {
            "store_id": settings.SSLCOMMERZ_STORE_ID,
            "store_passwd": settings.SSLCOMMERZ_STORE_PASSWORD,
            "total_amount": str(order.amount),
            "currency": "BDT",
            "tran_id": str(order.id),
            "success_url": f"{callback_base}/success",
            "fail_url": f"{callback_base}/fail",
            "cancel_url": f"{callback_base}/cancel",
            "ipn_url": ipn_url,
            "cus_name": user.full_name or user.username,
            "cus_email": user.email,
            "cus_phone": "01700000000",
            "cus_add1": "Dhaka",
            "cus_city": "Dhaka",
            "cus_country": "Bangladesh",
            "shipping_method": "NO",
            "num_of_item": "1",
            "product_name": product,
            "product_category": "Digital Service",
            "product_profile": "non-physical-goods",
            "value_a": str(user.id),
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f"{self.base_url}/gwprocess/v4/api.php", data=payload)
                body = response.json()
        except Exception as exc:
            log.warning("SSLCommerz session creation failed: %s", exc)
            raise HTTPException(502, "Payment gateway is unreachable. Please try again.")
        if body.get("status") != "SUCCESS" or not body.get("GatewayPageURL"):
            log.warning("SSLCommerz rejected session: %s", body.get("failedreason"))
            raise HTTPException(502, f"Payment gateway error: {body.get('failedreason') or 'session rejected'}")
        return body["GatewayPageURL"], body.get("sessionkey", "")

    async def validate(self, val_id: str) -> dict:
        """Server-to-server validation of a payment the browser reported as successful."""
        params = {
            "val_id": val_id,
            "store_id": settings.SSLCOMMERZ_STORE_ID,
            "store_passwd": settings.SSLCOMMERZ_STORE_PASSWORD,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{self.base_url}/validator/api/validationserverAPI.php", params=params)
            return response.json()


def payment_gateway() -> PaymentGateway:
    """Prefer the real gateway; fall back to the explicit development mock."""
    for gateway in (SSLCommerzGateway(), MockGateway()):
        if gateway.available():
            return gateway
    raise HTTPException(503, "Payments are not configured. Set SSLCommerz sandbox credentials.")


def add_months(value, months):
    year, month = divmod(value.year * 12 + value.month - 1 + months, 12)
    return value.replace(year=year, month=month + 1,
                         day=min(value.day, calendar.monthrange(year, month + 1)[1]))


RENEW_WINDOW = timedelta(days=1)


def renewal_open(user) -> bool:
    """Buying is possible without Premium, or in the last day before it expires."""
    if not user.premium_until:
        return True
    return utc(user.premium_until) - datetime.now(timezone.utc) <= RENEW_WINDOW


async def current_plan(db, user):
    """The plan of the latest successful subscription while Premium is active."""
    if not user.premium_until or utc(user.premium_until) <= datetime.now(timezone.utc):
        return None
    order = await db.scalar(select(Order).where(
        Order.user_id == user.id, Order.kind == "subscription", Order.status == "success")
        .order_by(Order.updated_at.desc()).limit(1))
    if not order:
        return None
    plan = await db.get(Plan, order.plan_id) if order.plan_id else None
    # A deleted or changed plan still ranks by the months that were bought.
    return plan or SimpleNamespace(id=None, name=f"{order.months} months", months=order.months)


async def initiate(db, user, data):
    gateway = payment_gateway()
    await db.execute(select(User).where(User.id == user.id).with_for_update())
    existing = await db.scalar(select(Order).where(Order.user_id == user.id, Order.idempotency_key == data.idempotency_key))
    if existing:
        if existing.kind != data.kind or existing.plan_id != data.plan_id:
            raise HTTPException(409, "Idempotency key already used for a different order")
        return existing
    months = 0
    if data.kind == "subscription":
        if user.account_type != "user":
            raise HTTPException(403, "A user account is required")
        plan = await db.get(Plan, data.plan_id) if data.plan_id else None
        if not plan or not plan.active:
            raise HTTPException(404, "Active subscription plan not found")
        if not renewal_open(user):
            # Every plan gives the same Premium; renewing opens a day before expiry.
            raise HTTPException(409, "You already have Premium. You can renew in the last day before it expires.")
        amount, months = plan.price, plan.months
    else:
        if data.plan_id or user.account_type != "user" or user.publisher_status != "approved_pending_payment":
            raise HTTPException(403, "Publisher approval required before payment")
        amount = Decimal(str((await configuration(db))["publisher_fee"]))
    order = Order(user_id=user.id, kind=data.kind, plan_id=data.plan_id, months=months,
                  amount=amount, idempotency_key=data.idempotency_key, provider=gateway.name)
    db.add(order)
    await db.flush()
    db.add(PaymentEvent(order_id=order.id, status="pending"))
    audit(db, user, "payment.initiate", order.id, amount=str(amount), provider=gateway.name)
    await db.commit()
    return order


async def settle(db, user_id, order_id, outcome: str, **details) -> Order:
    """
    Move a pending order to a terminal state and grant its entitlement on success.
    Idempotent: repeating the same outcome returns the order unchanged; a different
    terminal outcome is a conflict. Locks account before order (same order as
    initiation) to avoid deadlocks.
    """
    account = await db.scalar(select(User).where(User.id == user_id).with_for_update()
                              .execution_options(populate_existing=True))
    order = await db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user_id).with_for_update())
    if not order or not account:
        raise HTTPException(404, "Order not found")
    if order.status != "pending":
        if order.status != outcome:
            raise HTTPException(409, "Order has already reached a different terminal state")
        return order
    notice = None
    if outcome == "success":
        if order.kind == "publisher_registration":
            if account.publisher_status != "approved_pending_payment":
                raise HTTPException(409, "Publisher is no longer eligible for activation")
            account.publisher_status = "active"
            notice = notify(db, account.id, "payment.success", "প্রকাশক অ্যাকাউন্ট চালু হয়েছে",
                            f"৳{order.amount} পরিশোধ সফল। এখন আপনি অডিওবুক প্রকাশ করতে পারবেন।",
                            en=("Publisher account activated",
                                f"Payment of BDT {order.amount} received. You can now publish audiobooks."),
                            order_id=order.id)
        else:
            now = datetime.now(timezone.utc)
            start = max(now, utc(account.premium_until)) if account.premium_until else now
            account.premium_until = add_months(start, order.months)
            account.subscription_cancelled = False
            notice = notify(db, account.id, "payment.success", "প্রিমিয়াম সক্রিয় হয়েছে",
                            f"৳{order.amount} পরিশোধ সফল। প্রিমিয়াম {account.premium_until:%d %b %Y} পর্যন্ত।",
                            en=("Premium is active",
                                f"Payment of BDT {order.amount} received. Premium until {account.premium_until:%d %b %Y}."),
                            order_id=order.id)
    order.status = outcome
    order.updated_at = datetime.now(timezone.utc)
    db.add(PaymentEvent(order_id=order.id, status=outcome))
    audit(db, account, "payment." + outcome, order.id, amount=str(order.amount), **details)
    await db.commit()
    await deliver(db, [notice])
    return order


async def confirm(db, user, order_id, outcome):
    """Development-only mock confirmation of the user's own mock order."""
    MockGateway().confirm(outcome)
    order = await db.scalar(select(Order).where(Order.id == order_id, Order.user_id == user.id))
    if order and order.provider != MockGateway.name:
        raise HTTPException(409, "This order must be paid through its payment gateway")
    return await settle(db, user.id, order_id, outcome)


async def sslcommerz_validate_and_settle(db, val_id: str) -> Optional[Order]:
    """
    Validate a transaction with SSLCommerz and settle the matching order.
    Returns the order (settled, or still pending when validation did not pass),
    or None when the transaction does not belong to one of our orders.
    """
    gateway = SSLCommerzGateway()
    if not gateway.available() or not val_id:
        return None
    try:
        result = await gateway.validate(val_id)
    except Exception as exc:
        log.warning("SSLCommerz validation request failed: %s", exc)
        return None
    try:
        order_id = uuid.UUID(str(result.get("tran_id", "")))
    except ValueError:
        return None
    order = await db.get(Order, order_id)
    if not order or order.provider != gateway.name:
        return None
    if result.get("status") not in {"VALID", "VALIDATED"}:
        log.info("SSLCommerz transaction %s not valid: %s", order_id, result.get("status"))
        return order
    try:
        paid = Decimal(str(result.get("amount")))
    except (InvalidOperation, TypeError):
        return order
    # Never trust the browser: amount and currency must match the server-priced order.
    if result.get("currency", "BDT") != "BDT" or paid != order.amount:
        log.warning("SSLCommerz amount mismatch for %s: %s %s", order_id, paid, result.get("currency"))
        return order
    if str(result.get("risk_level", "0")) == "1":
        log.warning("SSLCommerz flagged %s as risky; holding for manual review", order_id)
        return order
    try:
        return await settle(db, order.user_id, order.id, "success",
                            gateway="sslcommerz", val_id=val_id, bank_tran_id=str(result.get("bank_tran_id", "")))
    except HTTPException:
        await db.rollback()
        return await db.get(Order, order_id)

def allocate(pool, counts):
    """Largest remainder in paisa; deterministic UUID ordering breaks ties."""
    total = sum(counts.values())
    if not total:
        return {}
    cents = int(pool * 100)
    raw = {key: Decimal(cents) * count / total for key, count in counts.items()}
    result = {key: int(value.to_integral_value(rounding=ROUND_DOWN)) for key, value in raw.items()}
    remainder = cents - sum(result.values())
    for key in sorted(raw, key=lambda k: (-(raw[k] - result[k]), str(k)))[:remainder]:
        result[key] += 1
    return {key: Decimal(value) / 100 for key, value in result.items()}

async def close_month(db, actor, month):
    from zoneinfo import ZoneInfo
    import re
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month) or month >= month_now():
        raise HTTPException(400, "Only a completed calendar month can be closed")
    # Serialize closes using the existing policy row.
    from app.models.platform import Setting
    await db.execute(select(Setting).where(Setting.key == "policy").with_for_update())
    prior = await db.get(FinancialSnapshot, month)
    if prior:
        return prior
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=ZoneInfo("Asia/Dhaka"))
    end = add_months(start, 1)
    revenue = await db.scalar(select(func.coalesce(func.sum(Order.amount), 0)).where(
        Order.status == "success", Order.kind == "subscription", Order.updated_at >= start, Order.updated_at < end))
    policy = await configuration(db)
    deductions = await db.scalar(select(func.coalesce(func.sum(FinancialAdjustment.amount), 0)).join(
        Order, Order.id == FinancialAdjustment.order_id).where(
        FinancialAdjustment.month == month, Order.kind == "subscription"))
    revenue -= deductions
    pool = (revenue * Decimal(policy["publisher_percent"]) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    counts = dict((await db.execute(select(EligibleView.publisher_id, func.count()).where(
        EligibleView.month == month).group_by(EligibleView.publisher_id))).all())
    allocations = allocate(pool, counts)
    # No eligible plays: keep the pool as an unallocated liability, never platform income.
    snapshot = FinancialSnapshot(month=month, revenue=revenue, publisher_pool=pool,
        platform_share=revenue - pool, policy=policy | {"unallocated": str(pool - sum(allocations.values()))})
    db.add(snapshot)
    for publisher, amount in allocations.items():
        db.add(Ledger(publisher_id=publisher, month=month, amount=amount, kind="earning", reference=f"earning:{month}:{publisher}"))
    audit(db, actor, "finance.close_month", month, revenue=str(revenue), pool=str(pool))
    await db.commit()
    return snapshot

def previous_month(month: str) -> str:
    year, number = map(int, month.split("-"))
    return f"{year - 1}-12" if number == 1 else f"{year}-{number - 1:02d}"


async def close_due_months(db) -> list[str]:
    """Close every completed month that has listens or revenue and is not closed yet
    (runs automatically; admins can still close a month by hand)."""
    current = month_now()
    months = set((await db.scalars(select(EligibleView.month).where(EligibleView.month < current).distinct())).all())
    months.add(previous_month(current))
    closed = set((await db.scalars(select(FinancialSnapshot.month))).all())
    done = []
    for month in sorted(months - closed):
        if month >= current:
            continue
        await close_month(db, None, month)
        done.append(month)
    return done


async def month_estimate(db, publisher_id) -> dict:
    """This month so far: the same split close_month will make, with today's numbers."""
    from zoneinfo import ZoneInfo
    month = month_now()
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=ZoneInfo("Asia/Dhaka"))
    revenue = await db.scalar(select(func.coalesce(func.sum(Order.amount), 0)).where(
        Order.status == "success", Order.kind == "subscription", Order.updated_at >= start))
    policy = await configuration(db)
    pool = Decimal(revenue) * Decimal(policy["publisher_percent"]) / 100
    total = await db.scalar(select(func.count()).select_from(EligibleView).where(EligibleView.month == month)) or 0
    mine = await db.scalar(select(func.count()).select_from(EligibleView).where(
        EligibleView.month == month, EligibleView.publisher_id == publisher_id)) or 0
    estimate = (pool * mine / total).quantize(Decimal("0.01"), rounding=ROUND_DOWN) if total else Decimal("0.00")
    return {"month": month, "estimated": str(estimate), "eligible_views": mine, "all_eligible_views": total,
            "publisher_percent": policy["publisher_percent"]}


async def premium_reminders(db) -> int:
    """One "renew?" reminder a day before Premium ends, and one notice when it has ended."""
    now = datetime.now(timezone.utc)
    notices = []
    expiring = (await db.scalars(select(User).where(
        User.premium_until.is_not(None), User.premium_until > now, User.premium_until <= now + RENEW_WINDOW))).all()
    for user in expiring:
        if user.premium_reminder_for and utc(user.premium_reminder_for) == utc(user.premium_until):
            continue
        user.premium_reminder_for = user.premium_until
        when = utc(user.premium_until)
        notices.append(notify(db, user.id, "premium.expiring", "প্রিমিয়াম কাল শেষ হচ্ছে",
                              f"আপনার প্রিমিয়াম {when:%d %b %Y} তারিখে শেষ হবে। শোনা চালিয়ে যেতে এখনই রিনিউ করুন।",
                              en=("Premium ends tomorrow",
                                  f"Your Premium ends on {when:%d %b %Y}. Renew now to keep listening."),))
    expired = (await db.scalars(select(User).where(
        User.premium_until.is_not(None), User.premium_until <= now,
        User.premium_until > now - timedelta(days=7)))).all()
    for user in expired:
        if user.premium_expired_for and utc(user.premium_expired_for) == utc(user.premium_until):
            continue
        user.premium_expired_for = user.premium_until
        notices.append(notify(db, user.id, "premium.expired", "প্রিমিয়ামের মেয়াদ শেষ",
                              "পছন্দের প্ল্যান বেছে নিয়ে আবার প্রিমিয়াম চালু করুন।",
                              en=("Your Premium has ended", "Choose a plan to turn Premium on again.")))
    await db.commit()
    await deliver(db, notices)
    return len(notices)


async def balance(db, publisher_id):
    earned = await db.scalar(select(func.coalesce(func.sum(Ledger.amount), 0)).where(Ledger.publisher_id == publisher_id))
    reserved = await db.scalar(select(func.coalesce(func.sum(Withdrawal.amount), 0)).where(
        Withdrawal.publisher_id == publisher_id, Withdrawal.status.in_(["pending", "approved"])))
    return earned - reserved
