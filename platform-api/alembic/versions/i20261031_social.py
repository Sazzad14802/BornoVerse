"""Favourites, channel follows, channel playlists, follower announcements and
6-digit password recovery codes."""
from alembic import op
import sqlalchemy as sa

revision = "i20261031_social"
down_revision = "h20261027_user_serial"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "user_interests",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("kind", sa.String(10), primary_key=True),
        sa.Column("value", sa.String(64), primary_key=True),
    )
    op.create_table(
        "channel_follows",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("channel_id", sa.Uuid(), sa.ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("notify", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_channel_follows_channel_id", "channel_follows", ["channel_id"])
    op.add_column("audiobooks", sa.Column("announced_at", sa.DateTime(timezone=True), nullable=True))
    # Books already public must not be announced again.
    op.execute("UPDATE audiobooks SET announced_at = NOW() WHERE publication_status = 'published'")
    op.add_column("playlists", sa.Column("channel_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_playlists_channel_id", "playlists", "channels", ["channel_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_playlists_channel_id", "playlists", ["channel_id"])
    op.add_column("recovery_tokens", sa.Column("kind", sa.String(10), nullable=False, server_default="reset"))
    op.add_column("recovery_tokens", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("recovery_tokens", sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade():
    op.drop_column("recovery_tokens", "created_at")
    op.drop_column("recovery_tokens", "attempts")
    op.drop_column("recovery_tokens", "kind")
    op.drop_index("ix_playlists_channel_id", "playlists")
    op.drop_constraint("fk_playlists_channel_id", "playlists", type_="foreignkey")
    op.drop_column("playlists", "channel_id")
    op.drop_column("audiobooks", "announced_at")
    op.drop_index("ix_channel_follows_channel_id", "channel_follows")
    op.drop_table("channel_follows")
    op.drop_table("user_interests")
