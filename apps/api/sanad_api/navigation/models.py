from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class CareNavigationEpisode(Base):
    __tablename__ = "care_navigation_episodes"
    __table_args__ = (UniqueConstraint("case_id", "session_token_hash"),)

    episode_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    session_token_hash: Mapped[str] = mapped_column(ForeignKey("sessions.token_hash"), index=True)
    guidance_id: Mapped[str] = mapped_column(String(64))
    guidance_version: Mapped[str] = mapped_column(String(80))
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime)
    is_synthetic: Mapped[bool] = mapped_column(default=True)


class CareNavigationEvent(Base):
    __tablename__ = "care_navigation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("care_navigation_episodes.episode_id"), index=True
    )
    status: Mapped[str] = mapped_column(String(40))
    verification_source: Mapped[str] = mapped_column(String(24))
    verification_status: Mapped[str] = mapped_column(String(24))
    actor: Mapped[str] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)


class CareBarrierReport(Base):
    __tablename__ = "care_barrier_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("care_navigation_episodes.episode_id"), index=True
    )
    barrier_reasons_json: Mapped[str] = mapped_column(Text)
    free_text_opt_in: Mapped[bool] = mapped_column(default=False)
    prefer_not_to_say: Mapped[bool] = mapped_column(default=False)
    actor: Mapped[str] = mapped_column(String(64))
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)


class CareNavigationIdempotency(Base):
    """Deduplication keys live separately so existing event tables need no migration."""

    __tablename__ = "care_navigation_idempotency"
    __table_args__ = (UniqueConstraint("episode_id", "operation", "idempotency_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("care_navigation_episodes.episode_id"), index=True
    )
    operation: Mapped[str] = mapped_column(String(24))
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
