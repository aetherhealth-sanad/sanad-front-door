from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class ConsentGrant(Base):
    """Current state of one scope for one case. Every change is also an audit entry."""

    __tablename__ = "consent_grants"
    __table_args__ = (UniqueConstraint("case_id", "scope"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    scope: Mapped[str] = mapped_column(String(32))
    granted: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_version: Mapped[str | None] = mapped_column(String(32))
    captured_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
