"""Withdrawal payout details and records; premium expiry reminder markers."""
from alembic import op
import sqlalchemy as sa

revision = "n20261106_payouts_reminders"
down_revision = "m20261105_avatars_language"
branch_labels = None
depends_on = None

TEXT_COLUMNS = {"method": 20, "account_name": 150, "account_number": 50, "bank_name": 150, "branch": 150,
                "payout_reference": 150}


def upgrade():
    op.add_column("users", sa.Column("premium_reminder_for", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("premium_expired_for", sa.DateTime(timezone=True), nullable=True))
    for name, size in TEXT_COLUMNS.items():
        op.add_column("withdrawals", sa.Column(name, sa.String(size), nullable=False,
                                               server_default="other" if name == "method" else ""))
    op.add_column("withdrawals", sa.Column("payout_note", sa.Text(), nullable=False, server_default=""))
    op.add_column("withdrawals", sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True))
    op.add_column("withdrawals", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for name in ["paid_at", "scheduled_for", "payout_note", *TEXT_COLUMNS]:
        op.drop_column("withdrawals", name)
    op.drop_column("users", "premium_expired_for")
    op.drop_column("users", "premium_reminder_for")
