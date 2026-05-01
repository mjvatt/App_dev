from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, Integer, Text, func
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


class BLSWage(Base):
    __tablename__ = "bls_wages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    soc_code: Mapped[str] = mapped_column(Text, nullable=False)
    area_type: Mapped[str] = mapped_column(Text, nullable=False)
    area_code: Mapped[str] = mapped_column(Text, nullable=False)
    area_name: Mapped[str] = mapped_column(Text, nullable=False)
    state_abbr: Mapped[str | None] = mapped_column(Text, nullable=True)
    employment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mean_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    median_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p10_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p25_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p75_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p90_annual: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data_year: Mapped[int] = mapped_column(Integer, nullable=False)
    indexed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
