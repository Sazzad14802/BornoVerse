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
    destination: str = Field(min_length=5, max_length=150)

class ProfileInput(Input):
    full_name: str = Field(min_length=1, max_length=150)

class HeartbeatInput(Input):
    position: int = Field(ge=0)

class AdjustmentInput(Input):
    order_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    kind: Literal["refund", "adjustment"]
    reason: str = Field(min_length=10, max_length=2000)
    reference: str = Field(min_length=8, max_length=100)
