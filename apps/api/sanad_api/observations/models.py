from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    observation_id: Mapped[str] = mapped_column(String(32), unique=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    kind: Mapped[str] = mapped_column(String(24), default="SEMEN_LAB_VALUE")
    test_code: Mapped[str] = mapped_column(String(48))
    value: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(16))
    collected_on: Mapped[str | None] = mapped_column(String(32))
    reference_source: Mapped[str | None] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(24))
    confirmation_status: Mapped[str] = mapped_column(String(32))
    issues_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime)
