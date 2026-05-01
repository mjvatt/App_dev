"""add last_friend_digest_email_at to user_progress

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column(
            "last_friend_digest_email_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_progress", "last_friend_digest_email_at")
