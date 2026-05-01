from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

EMBEDDING_DIM = 384


class Base(DeclarativeBase):
    pass


class OnetOccupation(Base):
    __tablename__ = "onet_occupations"

    soc_code: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    job_zone: Mapped[int | None] = mapped_column(Integer, nullable=True)
    job_zone_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    top_skills: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    top_knowledge: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    core_tasks: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    embedding_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    embedding_model: Mapped[str] = mapped_column(Text, nullable=False)
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
