"""add challenges canonical bank table

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-30
"""
import sqlalchemy as sa

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("topic", sa.String(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("constraints", sa.JSON(), nullable=False),
        sa.Column("examples", sa.JSON(), nullable=False),
        sa.Column(
            "source",
            sa.String(),
            nullable=False,
            server_default=sa.text("'seed'"),
        ),
        sa.Column("proposed_challenge_id", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_challenges_topic", "challenges", ["topic"])
    op.create_index("ix_challenges_difficulty", "challenges", ["difficulty"])
    op.create_index(
        "ix_challenges_topic_difficulty",
        "challenges",
        ["topic", "difficulty"],
    )


def downgrade() -> None:
    op.drop_index("ix_challenges_topic_difficulty", table_name="challenges")
    op.drop_index("ix_challenges_difficulty", table_name="challenges")
    op.drop_index("ix_challenges_topic", table_name="challenges")
    op.drop_table("challenges")
