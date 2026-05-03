"""add longest_streak + longest_daily_streak to user_progress

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-02

Persistent personal-best counters for the activity streak and the
daily-challenge streak. Backfilled from the current values on existing
rows so a user's current run becomes their best-known run; we have no
history of higher-then-broken streaks to recover.
"""
import sqlalchemy as sa

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_progress",
        sa.Column(
            "longest_streak",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "user_progress",
        sa.Column(
            "longest_daily_streak",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.execute(
        "UPDATE user_progress SET longest_streak = streak_days "
        "WHERE streak_days > longest_streak"
    )
    op.execute(
        "UPDATE user_progress SET longest_daily_streak = daily_streak_days "
        "WHERE daily_streak_days > longest_daily_streak"
    )


def downgrade() -> None:
    op.drop_column("user_progress", "longest_daily_streak")
    op.drop_column("user_progress", "longest_streak")
