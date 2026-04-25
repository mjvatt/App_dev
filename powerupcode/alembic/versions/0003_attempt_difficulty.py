"""add difficulty to attempts

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-25
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attempts",
        sa.Column("difficulty", sa.String(), nullable=True),
    )
    op.create_index("ix_attempts_difficulty", "attempts", ["difficulty"])


def downgrade() -> None:
    op.drop_index("ix_attempts_difficulty", table_name="attempts")
    op.drop_column("attempts", "difficulty")
