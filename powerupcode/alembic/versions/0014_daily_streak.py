"""add daily_streak_days + last_daily_solved_date to user_progress

Revision ID: 0014
Revises: 0013
Create Date: 2026-04-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column(
            "daily_streak_days",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "user_progress",
        sa.Column("last_daily_solved_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_progress", "last_daily_solved_date")
    op.drop_column("user_progress", "daily_streak_days")
