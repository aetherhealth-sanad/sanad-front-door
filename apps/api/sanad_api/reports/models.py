from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from sanad_api.db import Base, UTCDateTime


class Draft(Base):
    """One draft result for one case version. A reviewer edit adds a new row."""

    __tablename__ = "drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.case_id"), index=True)
    case_version: Mapped[int] = mapped_column(Integer)
    content_json: Mapped[str] = mapped_column(Text)
    report_hash: Mapped[str] = mapped_column(String(64))
    origin: Mapped[str] = mapped_column(String(16))  # RULES or REVIEWER_EDIT
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
