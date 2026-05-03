"""create interview_stages and add multi-stage columns to interview_sessions

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-02

A multi-stage Mock Interview run is one parent interview_sessions row plus
three interview_stages children (warmup -> main -> follow-up). Per-stage
grading + clocks live on the children; the parent retains the aggregate
score and tokens grant. Single-stage runs (legacy) skip the children
entirely; is_multi_stage is the discriminator.
"""
import sqlalchemy as sa

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "is_multi_stage",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "interview_sessions",
        sa.Column("current_stage_index", sa.Integer(), nullable=True),
    )

    op.create_table(
        "interview_stages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stage_index", sa.Integer(), nullable=False),
        sa.Column("challenge_id", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("solution", sa.String(), nullable=True),
        sa.Column("transcript", sa.String(), nullable=True),
        sa.Column("language", sa.String(), nullable=True),
        sa.Column("time_ms", sa.Integer(), nullable=True),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.String(), nullable=True),
        sa.Column("strengths", sa.String(), nullable=True),
        sa.Column("improvements", sa.String(), nullable=True),
        sa.Column(
            "time_freezes_used",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "ended_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.UniqueConstraint(
            "session_id", "stage_index", name="uq_interview_stage_session_index"
        ),
    )
    op.create_index(
        "ix_interview_stages_session", "interview_stages", ["session_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_interview_stages_session", table_name="interview_stages")
    op.drop_table("interview_stages")
    op.drop_column("interview_sessions", "current_stage_index")
    op.drop_column("interview_sessions", "is_multi_stage")
