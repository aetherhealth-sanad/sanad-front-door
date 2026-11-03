from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class ReviewRequest(Base):
    __tablename__ = "review_requests"

    # The integer key gives insertion order, which timestamps alone cannot when two rows share
    # a second.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_request_id: Mapped[str] = mapped_column(String(32), unique=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    case_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16))  # PENDING, DECIDED or WITHDRAWN
    requested_at: Mapped[datetime] = mapped_column(UTCDateTime)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class ReviewDecision(Base):
    """A reviewer decision. An approval is bound to one case version and one report hash, and it
    expires (HR-11). The note is stored here and never copied into the audit log (INV-03)."""

    __tablename__ = "review_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_id: Mapped[str] = mapped_column(String(32), unique=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    review_request_id: Mapped[str] = mapped_column(ForeignKey("review_requests.review_request_id"))
    case_version: Mapped[int] = mapped_column(Integer)
    decision: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str | None] = mapped_column(String(32))
    reason_code: Mapped[str | None] = mapped_column(String(48))
    note: Mapped[str | None] = mapped_column(Text)
    question_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    report_hash: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    reviewer_type: Mapped[str] = mapped_column(String(16))
    actor: Mapped[str] = mapped_column(String(64))
    decided_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ClarificationRequest(Base):
    __tablename__ = "clarification_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    question_id: Mapped[str] = mapped_column(String(32))
    review_id: Mapped[str] = mapped_column(ForeignKey("review_decisions.review_id"))
    requested_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
