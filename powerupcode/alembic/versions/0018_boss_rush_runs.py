"""add boss_rush_runs table

Revision ID: 0018
Revises: 0017
Create Date: 2026-04-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "boss_rush_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'in_progress'"),
        ),
        sa.Column("challenge_ids", sa.JSON(), nullable=False),
        sa.Column(
            "current_index",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "lives_remaining",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("3"),
        ),
        sa.Column(
            "attempts_total",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("xp_awarded", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_boss_rush_runs_user_started",
        "boss_rush_runs",
        ["user_id", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_boss_rush_runs_user_started", table_name="boss_rush_runs")
    op.drop_table("boss_rush_runs")
