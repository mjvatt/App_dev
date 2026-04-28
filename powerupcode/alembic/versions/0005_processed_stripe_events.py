"""add processed_stripe_events table for webhook idempotency

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-27
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processed_stripe_events",
        sa.Column("event_id", sa.String(), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("processed_stripe_events")
