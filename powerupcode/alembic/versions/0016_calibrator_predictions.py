"""add predicted_solve_rate / predicted_time_ms / prediction_model
to proposed_challenges and challenges

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_TABLES = ("proposed_challenges", "challenges")


def upgrade() -> None:
    for tbl in _TABLES:
        op.add_column(
            tbl,
            sa.Column("predicted_solve_rate", sa.Float(), nullable=True),
        )
        op.add_column(
            tbl,
            sa.Column("predicted_time_ms", sa.Integer(), nullable=True),
        )
        op.add_column(
            tbl,
            sa.Column("prediction_model", sa.String(), nullable=True),
        )


def downgrade() -> None:
    for tbl in _TABLES:
        op.drop_column(tbl, "prediction_model")
        op.drop_column(tbl, "predicted_time_ms")
        op.drop_column(tbl, "predicted_solve_rate")
