"""Profile and channel pictures; the user's app language (for notifications)."""
from alembic import op
import sqlalchemy as sa

revision = "m20261105_avatars_language"
down_revision = "l20261104_email_verification"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.add_column("users", sa.Column("language", sa.String(5), nullable=False, server_default="bn"))
    op.add_column("channels", sa.Column("avatar_url", sa.String(512), nullable=True))


def downgrade():
    op.drop_column("channels", "avatar_url")
    op.drop_column("users", "language")
    op.drop_column("users", "avatar_url")
