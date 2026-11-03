"""Admin-opened moderation cases: a report source, and one report per listener
only for listener reports."""
from alembic import op
import sqlalchemy as sa

revision = "k20261103_admin_cases"
down_revision = "j20261101_moderation"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("content_reports", sa.Column("source", sa.String(10), nullable=False, server_default="listener"))
    op.drop_constraint("uq_report_once_per_user", "content_reports", type_="unique")
    op.create_index("uq_report_once_per_listener", "content_reports", ["user_id", "audiobook_id"], unique=True,
                    postgresql_where=sa.text("source = 'listener'"))


def downgrade():
    op.drop_index("uq_report_once_per_listener", table_name="content_reports")
    op.execute("DELETE FROM content_reports WHERE source = 'admin'")
    op.create_unique_constraint("uq_report_once_per_user", "content_reports", ["user_id", "audiobook_id"])
    op.drop_column("content_reports", "source")
