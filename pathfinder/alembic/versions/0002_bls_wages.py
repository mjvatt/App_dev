"""bls_wages: BLS OEWS wage snapshot

Revision ID: 0002_bls_wages
Revises: 0001_pgvector_init
Create Date: 2026-05-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_bls_wages"
down_revision: Union[str, None] = "0001_pgvector_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bls_wages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("soc_code", sa.Text(), nullable=False),
        sa.Column("area_type", sa.Text(), nullable=False),
        sa.Column("area_code", sa.Text(), nullable=False),
        sa.Column("area_name", sa.Text(), nullable=False),
        sa.Column("state_abbr", sa.Text(), nullable=True),
        sa.Column("employment", sa.Integer(), nullable=True),
        sa.Column("mean_annual", sa.Integer(), nullable=True),
        sa.Column("median_annual", sa.Integer(), nullable=True),
        sa.Column("p10_annual", sa.Integer(), nullable=True),
        sa.Column("p25_annual", sa.Integer(), nullable=True),
        sa.Column("p75_annual", sa.Integer(), nullable=True),
        sa.Column("p90_annual", sa.Integer(), nullable=True),
        sa.Column("data_year", sa.Integer(), nullable=False),
        sa.Column(
            "indexed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "soc_code", "area_type", "area_code", name="uq_bls_wages_soc_area"
        ),
        sa.CheckConstraint(
            "area_type IN ('national', 'state', 'msa')",
            name="ck_bls_wages_area_type",
        ),
    )
    op.create_index("ix_bls_wages_soc_type", "bls_wages", ["soc_code", "area_type"])
    op.create_index("ix_bls_wages_state", "bls_wages", ["state_abbr"])


def downgrade() -> None:
    op.drop_index("ix_bls_wages_state", table_name="bls_wages")
    op.drop_index("ix_bls_wages_soc_type", table_name="bls_wages")
    op.drop_table("bls_wages")
