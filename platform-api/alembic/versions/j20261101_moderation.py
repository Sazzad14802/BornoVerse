"""Moderation: report categories and cases, admin actions, appeals, private
evidence, strikes and publishing restrictions."""
from alembic import op
import sqlalchemy as sa

revision = "j20261101_moderation"
down_revision = "i20261031_social"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("content_reports", sa.Column("category", sa.String(30), nullable=False, server_default="other"))
    op.add_column("content_reports", sa.Column("details", sa.Text(), nullable=False, server_default=""))
    op.add_column("content_reports", sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True))
    op.add_column("content_reports", sa.Column("violation", sa.String(30), nullable=True))
    op.add_column("content_reports", sa.Column("appeal_deadline", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_content_reports_owner_id", "content_reports", ["owner_id"])
    op.execute("UPDATE content_reports SET status = 'pending' WHERE status = 'open'")
    op.execute("UPDATE content_reports SET details = reason")
    op.execute("UPDATE content_reports r SET owner_id = a.owner_id FROM audiobooks a WHERE a.id = r.audiobook_id")
    # One report per listener per audiobook: keep the earliest of any duplicates.
    op.execute(
        "DELETE FROM content_reports r USING content_reports older "
        "WHERE r.user_id = older.user_id AND r.audiobook_id = older.audiobook_id "
        "AND (older.created_at, older.id) < (r.created_at, r.id)"
    )
    op.create_unique_constraint("uq_report_once_per_user", "content_reports", ["user_id", "audiobook_id"])
    op.add_column("users", sa.Column("publishing_restricted_until", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("report_id", sa.Uuid(), sa.ForeignKey("content_reports.id"), nullable=False),
        sa.Column("admin_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("audiobook_id", sa.Uuid(), sa.ForeignKey("audiobooks.id"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_moderation_actions_report_id", "moderation_actions", ["report_id"])
    op.create_index("ix_moderation_actions_target_user_id", "moderation_actions", ["target_user_id"])
    op.create_table(
        "content_appeals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("report_id", sa.Uuid(), sa.ForeignKey("content_reports.id"), nullable=False, unique=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=False),
        sa.Column("decided_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_content_appeals_user_id", "content_appeals", ["user_id"])
    op.create_table(
        "moderation_evidence",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("report_id", sa.Uuid(), sa.ForeignKey("content_reports.id"), nullable=True),
        sa.Column("appeal_id", sa.Uuid(), sa.ForeignKey("content_appeals.id"), nullable=True),
        sa.Column("uploaded_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_moderation_evidence_report_id", "moderation_evidence", ["report_id"])
    op.create_index("ix_moderation_evidence_appeal_id", "moderation_evidence", ["appeal_id"])
    op.create_table(
        "user_strikes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("report_id", sa.Uuid(), sa.ForeignKey("content_reports.id"), nullable=False),
        sa.Column("violation", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_strikes_user_id", "user_strikes", ["user_id"])
    op.create_table(
        "user_restrictions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("report_id", sa.Uuid(), sa.ForeignKey("content_reports.id"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lifted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_restrictions_user_id", "user_restrictions", ["user_id"])


def downgrade():
    for table in ("user_restrictions", "user_strikes", "moderation_evidence", "content_appeals", "moderation_actions"):
        op.drop_table(table)
    op.drop_column("users", "publishing_restricted_until")
    op.drop_constraint("uq_report_once_per_user", "content_reports", type_="unique")
    op.drop_index("ix_content_reports_owner_id", "content_reports")
    for column in ("appeal_deadline", "violation", "owner_id", "details", "category"):
        op.drop_column("content_reports", column)
