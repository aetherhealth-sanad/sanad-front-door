from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class Case(Base):
    __tablename__ = "cases"

    case_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Written only by cases.state_machine.transition, apart from the initial DRAFT.
    state: Mapped[str] = mapped_column(String(40))
    case_version: Mapped[int] = mapped_column(Integer, default=1)
    # The start reference only. No profile data is applied before consent (AC-02.2).
    start_mode: Mapped[str | None] = mapped_column(String(16))
    fixture_id: Mapped[str | None] = mapped_column(String(32))
    profile_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    current_draft_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)


class CaseTransition(Base):
    """Every state change, with its event and actor, so a case can be reconstructed (NFR-03)."""

    __tablename__ = "case_transitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    from_state: Mapped[str] = mapped_column(String(40))
    to_state: Mapped[str] = mapped_column(String(40))
    event: Mapped[str] = mapped_column(String(40))
    actor: Mapped[str] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
