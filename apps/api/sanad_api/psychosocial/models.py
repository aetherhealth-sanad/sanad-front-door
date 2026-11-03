from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class PsychosocialSelfReport(Base):
    """Latest optional, patient-reported context per question; never a triage fact."""

    __tablename__ = "psychosocial_self_reports"
    __table_args__ = (UniqueConstraint("case_id", "question_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    question_id: Mapped[str] = mapped_column(String(32))
    response_code: Mapped[str | None] = mapped_column(String(24))
    response_state: Mapped[str] = mapped_column(String(24))
    reference_period: Mapped[str] = mapped_column(String(32))
    source_type: Mapped[str | None] = mapped_column(String(24))
    verification_status: Mapped[str | None] = mapped_column(String(24))
    consent_scope: Mapped[str] = mapped_column(String(24), default="assessment")
    collected_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
