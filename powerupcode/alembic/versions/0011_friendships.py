"""add friendships table

Revision ID: 0011
Revises: 0010
Create Date: 2026-04-30
"""
import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "friendships",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("friend_id", sa.String(), nullable=False),
        sa.Column(
            "status", sa.String(), nullable=False, server_default=sa.text("'pending'")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "friend_id", name="uq_friendship_pair"),
        sa.CheckConstraint("user_id != friend_id", name="ck_friendship_self"),
    )
    op.create_index("ix_friendships_user_status", "friendships", ["user_id", "status"])
    op.create_index(
        "ix_friendships_friend_status", "friendships", ["friend_id", "status"]
    )


def downgrade() -> None:
    op.drop_index("ix_friendships_friend_status", table_name="friendships")
    op.drop_index("ix_friendships_user_status", table_name="friendships")
    op.drop_table("friendships")
