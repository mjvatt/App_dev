import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    challenge_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    difficulty: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    xp_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hints_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    time_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # SHA-256 of the normalized solution. Used to detect copy-paste cheating
    # without storing the raw code. Nullable for backfill compatibility.
    solution_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    # Set when this submission's hash matches a passing submission from a
    # different user on the same challenge. Internal signal only — the user
    # is not informed and the attempt still records normally.
    flagged_duplicate: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    streak_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_active: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    topics: Mapped[dict[str, int]] = mapped_column(
        JSON, nullable=False, default=dict, server_default=text("'{}'")
    )
    last_reengagement_email_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ReviewSchedule(Base):
    __tablename__ = "review_schedule"
    __table_args__ = (
        UniqueConstraint("user_id", "challenge_id", name="uq_review_user_challenge"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    challenge_id: Mapped[str] = mapped_column(String, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_quality: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
