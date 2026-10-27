"""Sequential member numbers for users (shown as U-0001 in the admin portal).

Existing users are numbered in sign-up order; new users take the next value
from users_serial_seq. The UUID primary key is unchanged.
"""
from alembic import op
import sqlalchemy as sa

revision = "h20261027_user_serial"
down_revision = "g20261018_unified_accounts"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE SEQUENCE IF NOT EXISTS users_serial_seq")
    op.add_column("users", sa.Column("serial", sa.Integer(), nullable=True))
    op.execute("""
        UPDATE users SET serial = numbered.n
        FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM users) AS numbered
        WHERE users.id = numbered.id
    """)
    op.execute("SELECT setval('users_serial_seq', COALESCE((SELECT MAX(serial) FROM users), 0) + 1, false)")
    op.alter_column("users", "serial", nullable=False, server_default=sa.text("nextval('users_serial_seq')"))
    op.execute("ALTER SEQUENCE users_serial_seq OWNED BY users.serial")
    op.create_unique_constraint("uq_users_serial", "users", ["serial"])


def downgrade():
    op.drop_constraint("uq_users_serial", "users", type_="unique")
    op.drop_column("users", "serial")
    op.execute("DROP SEQUENCE IF EXISTS users_serial_seq")
