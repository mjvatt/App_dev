"""create token_gifts table

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-02

Audit trail for friend-to-friend token transfers. Independent of
user_progress so a balance write + a log write happen in the same
transaction. Indexes support the per-day-per-recipient cap query.
"""
import sqlalchemy as sa

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "token_gifts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "sender_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "recipient_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_token_gifts_sender_sent_at",
        "token_gifts",
        ["sender_id", "sent_at"],
    )
    op.create_index(
        "ix_token_gifts_recipient_sent_at",
        "token_gifts",
        ["recipient_id", "sent_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_token_gifts_recipient_sent_at", table_name="token_gifts")
    op.drop_index("ix_token_gifts_sender_sent_at", table_name="token_gifts")
    op.drop_table("token_gifts")
