"""add time_freezes_used to interview_sessions

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-01

Tracks how many time-freeze power-ups the user has spent on a Mock
Interview session. The frontend extends the soft target by N * 5 min
where N is this counter; the backend is the source of truth so a
client cannot fabricate freezes it did not pay for.
"""
import sqlalchemy as sa

from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "time_freezes_used",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "time_freezes_used")
