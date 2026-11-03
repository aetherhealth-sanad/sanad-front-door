from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class Referral(Base):
    """A mock referral. Constructed only by referral.service.send_mock_referral (AC-12.7)."""

    __tablename__ = "referrals"

    referral_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # One referral per case. The unique constraint makes a concurrent second send lose.
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), unique=True)
    case_version: Mapped[int] = mapped_column(Integer)
    case_code: Mapped[str] = mapped_column(String(16), unique=True)
    status: Mapped[str] = mapped_column(String(16))  # always SIMULATED
    mock_status: Mapped[str] = mapped_column(String(32))
    care_type: Mapped[str] = mapped_column(String(32))
    target_mock_facility_id: Mapped[str] = mapped_column(String(32))
    snapshot_json: Mapped[str | None] = mapped_column(Text)  # cleared on withdrawal
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)


class ReferralEvent(Base):
    """Append-only lifecycle events. Every one is SIMULATED and UNVERIFIED."""

    __tablename__ = "referral_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(32), unique=True)
    referral_id: Mapped[str] = mapped_column(ForeignKey("referrals.referral_id"), index=True)
    mock_status: Mapped[str] = mapped_column(String(32))
    reason_code: Mapped[str | None] = mapped_column(String(32))
    mock_appointment_starts_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    actor: Mapped[str] = mapped_column(String(64))
    verification_source: Mapped[str] = mapped_column(String(16))
    verification_status: Mapped[str] = mapped_column(String(16))
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime)
