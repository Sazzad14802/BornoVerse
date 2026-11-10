"""Readable serial numbers for channels, payments and audit entries; payment method;
daily listens and daily publisher earnings.

- channels.serial (C-0001), payment_orders.serial (P-0001), audit_history.serial (A-000001):
  existing rows are numbered in creation order, new rows take the next sequence value.
- payment_orders.method: how the buyer paid (e.g. "BKASH-BKash", "VISA-Dutch Bangla").
- daily_listens: one eligible Premium listen per listener, audiobook and day (Asia/Dhaka).
- daily_earnings: the closed record of one day's publisher pool.
"""
from alembic import op
import sqlalchemy as sa

revision = "o20261110_serials_daily_earnings"
down_revision = "n20261106_payouts_reminders"
branch_labels = None
depends_on = None

SERIALS = [("channels", "created_at"), ("payment_orders", "created_at"), ("audit_history", "created_at")]


def upgrade():
    for table, order in SERIALS:
        sequence = f"{table}_serial_seq"
        op.execute(f"CREATE SEQUENCE IF NOT EXISTS {sequence}")
        op.add_column(table, sa.Column("serial", sa.Integer(), nullable=True))
        op.execute(f"""
            UPDATE {table} SET serial = numbered.n
            FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY {order}, id) AS n FROM {table}) AS numbered
            WHERE {table}.id = numbered.id
        """)
        op.execute(f"SELECT setval('{sequence}', COALESCE((SELECT MAX(serial) FROM {table}), 0) + 1, false)")
        op.alter_column(table, "serial", nullable=False, server_default=sa.text(f"nextval('{sequence}')"))
        op.execute(f"ALTER SEQUENCE {sequence} OWNED BY {table}.serial")
        op.create_unique_constraint(f"uq_{table}_serial", table, ["serial"])

    op.add_column("payment_orders", sa.Column("method", sa.String(60), nullable=False, server_default=""))

    op.create_table(
        "daily_listens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("audiobook_id", sa.Uuid(), sa.ForeignKey("audiobooks.id"), nullable=False),
        sa.Column("publisher_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("day", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "audiobook_id", "day", name="uq_daily_listen"),
    )
    op.create_index("ix_daily_listens_day", "daily_listens", ["day"])
    op.create_index("ix_daily_listens_publisher_id", "daily_listens", ["publisher_id"])

    op.create_table(
        "daily_earnings",
        sa.Column("day", sa.String(10), primary_key=True),
        sa.Column("revenue", sa.Numeric(14, 2), nullable=False),
        sa.Column("publisher_pool", sa.Numeric(14, 2), nullable=False),
        sa.Column("allocated", sa.Numeric(14, 2), nullable=False),
        sa.Column("listens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("daily_earnings")
    op.drop_index("ix_daily_listens_publisher_id", "daily_listens")
    op.drop_index("ix_daily_listens_day", "daily_listens")
    op.drop_table("daily_listens")
    op.drop_column("payment_orders", "method")
    for table, _ in reversed(SERIALS):
        op.drop_constraint(f"uq_{table}_serial", table, type_="unique")
        op.drop_column(table, "serial")
        op.execute(f"DROP SEQUENCE IF EXISTS {table}_serial_seq")
