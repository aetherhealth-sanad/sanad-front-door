from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class Fact(Base):
    """One SemanticFact. Rows are append-only: a correction supersedes, it never edits."""

    __tablename__ = "facts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fact_id: Mapped[str] = mapped_column(String(32), unique=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    concept_code: Mapped[str] = mapped_column(String(64))
    value_json: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(16))
    polarity: Mapped[str | None] = mapped_column(String(16))
    temporal_status: Mapped[str | None] = mapped_column(String(16))
    unit: Mapped[str | None] = mapped_column(String(16))
    source_type: Mapped[str] = mapped_column(String(24))
    verification_status: Mapped[str] = mapped_column(String(16))
    raw_response_id: Mapped[str | None] = mapped_column(String(32))
    observation_id: Mapped[str | None] = mapped_column(String(32))
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)
    superseded_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class EvidenceSelection(Base):
    """The user's per-item choice (AC-16.1). Separate from field state, which it never changes."""

    __tablename__ = "evidence_selections"
    __table_args__ = (UniqueConstraint("case_id", "item_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    use: Mapped[bool] = mapped_column(Boolean)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
