"""add streak_shields to user_progress

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-01

Inventory of streak shields the user has stockpiled. One shield is
auto-consumed when _update_daily_streak detects a one-day gap, bridging
the miss and keeping the streak alive. Buy via
POST /api/progress/daily-streak/shield.
"""
import sqlalchemy as sa

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column(
            "streak_shields",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user_progress", "streak_shields")
