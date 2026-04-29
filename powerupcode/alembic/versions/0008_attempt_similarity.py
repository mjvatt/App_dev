"""hash submitted solutions for duplicate detection

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-29
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attempts",
        sa.Column("solution_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "attempts",
        sa.Column(
            "flagged_duplicate",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index("ix_attempts_solution_hash", "attempts", ["solution_hash"])
    op.create_index(
        "ix_attempts_challenge_hash",
        "attempts",
        ["challenge_id", "solution_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_attempts_challenge_hash", table_name="attempts")
    op.drop_index("ix_attempts_solution_hash", table_name="attempts")
    op.drop_column("attempts", "flagged_duplicate")
    op.drop_column("attempts", "solution_hash")
