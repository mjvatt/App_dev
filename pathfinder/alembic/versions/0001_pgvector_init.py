"""pgvector init: enable extension + onet_occupations table

Revision ID: 0001_pgvector_init
Revises:
Create Date: 2026-04-30

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001_pgvector_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "onet_occupations",
        sa.Column("soc_code", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("job_zone", sa.Integer(), nullable=True),
        sa.Column("job_zone_summary", sa.Text(), nullable=True),
        sa.Column("top_skills", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("top_knowledge", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("core_tasks", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("embedding_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("embedding_model", sa.Text(), nullable=False),
        sa.Column(
            "indexed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_onet_occupations_embedding",
        "onet_occupations",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.create_index("ix_onet_occupations_job_zone", "onet_occupations", ["job_zone"])


def downgrade() -> None:
    op.drop_index("ix_onet_occupations_job_zone", table_name="onet_occupations")
    op.drop_index("ix_onet_occupations_embedding", table_name="onet_occupations")
    op.drop_table("onet_occupations")
