"""track last re-engagement email send per user

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column("last_reengagement_email_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_progress", "last_reengagement_email_at")
