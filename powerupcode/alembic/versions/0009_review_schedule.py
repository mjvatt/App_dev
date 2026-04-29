"""add review_schedule for spaced repetition

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_schedule",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("challenge_id", sa.String(), nullable=False),
        sa.Column(
            "ease_factor", sa.Float(), nullable=False, server_default=sa.text("2.5")
        ),
        sa.Column(
            "interval_days", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "repetitions", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_quality", sa.Integer(), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "challenge_id", name="uq_review_user_challenge"
        ),
    )
    op.create_index(
        "ix_review_due_lookup",
        "review_schedule",
        ["user_id", "due_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_review_due_lookup", table_name="review_schedule")
    op.drop_table("review_schedule")
