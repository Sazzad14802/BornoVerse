from datetime import datetime
from typing import Literal, Optional
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, model_validator

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

class Decision(Input):
    action: Literal["approve", "reject", "suspend", "unsuspend", "restrict", "restore", "resolve", "dismiss", "complete"]
    # Only a rejection needs a reason; it is sent to the affected user.
    reason: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def reason_for_rejection(self):
        if self.action == "reject" and len(self.reason) < 3:
            raise ValueError("A reason (at least 3 characters) is required to reject")
        return self

class ChannelInput(Input):
    name: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=5000)

class PlaylistInput(Input):
    name: str = Field(min_length=1, max_length=150)
    # True: a public playlist on the publisher's channel.
    channel: bool = False

class OrderInput(Input):
    kind: Literal["subscription", "publisher_registration"]
    plan_id: UUID | None = None
    idempotency_key: str = Field(min_length=8, max_length=100)

class CallbackInput(Input):
    status: Literal["success", "failed", "cancelled"]

class PlanInput(Input):
    name: str = Field(min_length=1, max_length=100)
    months: int = Field(ge=1, le=24)
    price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    active: bool = True

class PolicyInput(Input):
    free_quota: int = Field(ge=0, le=10000)
    premium_quota: int = Field(ge=0, le=10000)
    publisher_quota: int = Field(ge=0, le=10000)
    aging_seconds: int = Field(ge=10, le=86400)
    max_attempts: int = Field(ge=1, le=10)
    lease_seconds: int = Field(ge=60, le=7200)
    publisher_fee: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    publisher_percent: int = Field(ge=0, le=100)
    valid_play_seconds: int = Field(ge=30, le=3600)
    revenue_base: Literal["gross_confirmed_subscription_receipts"]

class ReportInput(Input):
    audiobook_id: UUID
    reason: str = Field(min_length=10, max_length=5000)

class WithdrawalInput(Input):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    method: Literal["bkash", "nagad", "rocket", "bank"] = "bkash"
    account_name: str = Field(default="", max_length=150)
    account_number: str = Field(default="", max_length=50)
    bank_name: str = Field(default="", max_length=150)
    branch: str = Field(default="", max_length=150)
    # Older clients send one free-text destination.
    destination: Optional[str] = Field(default=None, max_length=150)

    @model_validator(mode="after")
    def payout_details(self):
        import re
        if self.destination and not self.account_number:
            self.account_number = self.destination[:50]
            return self
        if self.method == "bank":
            if not (self.bank_name.strip() and self.account_name.strip() and len(self.account_number.strip()) >= 6):
                raise ValueError("Bank name, account name and account number are required")
        elif not re.fullmatch(r"01[3-9]\d{8}", self.account_number.strip()):
            raise ValueError("Enter a valid 11-digit mobile wallet number (01XXXXXXXXX)")
        return self

    def destination_text(self) -> str:
        if self.destination and self.method == "bkash" and not self.account_name:
            return self.destination
        if self.method == "bank":
            return f"Bank: {self.bank_name} · {self.account_name} · {self.account_number}"[:150]
        return f"{self.method.capitalize()}: {self.account_number}"[:150]


class WithdrawalDecision(Input):
    action: Literal["approve", "reject", "complete"]
    reason: str = Field(default="", max_length=2000)
    # approve: when the money will be sent.
    scheduled_for: Optional[datetime] = None
    # complete: how and when it was sent.
    payout_reference: str = Field(default="", max_length=150)
    paid_at: Optional[datetime] = None
    payout_note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def required_fields(self):
        if self.action == "reject" and len(self.reason.strip()) < 3:
            raise ValueError("A reason is required to reject")
        if self.action == "approve" and not self.scheduled_for:
            raise ValueError("Set the date the payment will be sent")
        if self.action == "complete" and len(self.payout_reference.strip()) < 3:
            raise ValueError("Enter the transaction ID or reference of the payment")
        return self

class ProfileInput(Input):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    language: Optional[Literal["bn", "en"]] = None

class HeartbeatInput(Input):
    position: int = Field(ge=0)

class AdjustmentInput(Input):
    order_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    kind: Literal["refund", "adjustment"]
    reason: str = Field(min_length=10, max_length=2000)
    reference: str = Field(min_length=8, max_length=100)
