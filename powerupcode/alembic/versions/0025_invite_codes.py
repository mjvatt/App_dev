"""create invite_codes table

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-13

Soft-launch gate. When settings.invite_only_registration is True, the
register endpoint requires a matching invite_codes row with uses < max_uses
and atomically increments uses in the same transaction as user creation.

Codes are stored normalized to uppercase. Lookups must normalize the same
way (see services.invites.normalize_code).
"""
import sqlalchemy as sa

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invite_codes",
        sa.Column("code", sa.String(length=64), primary_key=True),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("uses", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("max_uses >= 1", name="ck_invite_codes_max_uses_positive"),
        sa.CheckConstraint("uses >= 0", name="ck_invite_codes_uses_nonnegative"),
    )


def downgrade() -> None:
    op.drop_table("invite_codes")
