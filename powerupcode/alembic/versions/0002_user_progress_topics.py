"""add topics to user_progress

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column(
            "topics",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_progress", "topics")
