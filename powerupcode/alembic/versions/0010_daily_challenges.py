"""add daily_challenges assignment table

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_challenges",
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("challenge_id", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("date"),
    )


def downgrade() -> None:
    op.drop_table("daily_challenges")
