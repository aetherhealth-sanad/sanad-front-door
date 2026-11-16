"""Values that pass between the stages, and the draft the extractor returns (T-60)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

EXTRACTOR_VERSION = "lab-ocr-0.2"


class Method(StrEnum):
    TEXT_LAYER = "TEXT_LAYER"
    OCR = "OCR"


class Status(StrEnum):
    EXTRACTED = "EXTRACTED"
    REJECTED = "REJECTED"


class FieldStatus(StrEnum):
    """Both mean "not confirmed". Only the user's confirmation on the lab-entry screen (T-33)
    makes a value usable; nothing here can (T-60 requirement 4)."""

    UNCONFIRMED = "UNCONFIRMED"  # read cleanly, still waits for the user
    NEEDS_CONFIRMATION = "NEEDS_CONFIRMATION"  # low confidence or a flag: the user must look


class RejectReason(StrEnum):
    DOCUMENT_UNSUPPORTED_TYPE = "DOCUMENT_UNSUPPORTED_TYPE"
    DOCUMENT_TOO_LARGE = "DOCUMENT_TOO_LARGE"
    DOCUMENT_TOO_MANY_PAGES = "DOCUMENT_TOO_MANY_PAGES"
    DOCUMENT_UNREADABLE = "DOCUMENT_UNREADABLE"
    OCR_UNAVAILABLE = "OCR_UNAVAILABLE"
    DOCUMENT_NOT_SYNTHETIC = "DOCUMENT_NOT_SYNTHETIC"
    DOCUMENT_LAYOUT_NOT_RECOGNISED = "DOCUMENT_LAYOUT_NOT_RECOGNISED"


class Flag(StrEnum):
    # The six T-60 ambiguity flags.
    UNIT_MISSING = "UNIT_MISSING"
    DECIMAL_SEPARATOR_UNCLEAR = "DECIMAL_SEPARATOR_UNCLEAR"
    DATE_FORMAT_AMBIGUOUS = "DATE_FORMAT_AMBIGUOUS"
    DUPLICATE_VALUE = "DUPLICATE_VALUE"
    OUT_OF_RANGE = "OUT_OF_RANGE"
    OCR_CONFIDENCE_LOW = "OCR_CONFIDENCE_LOW"
    # Added for cases T-60 names in its requirements but gives no flag for.
    VALUE_MISSING = "VALUE_MISSING"  # requirement 6: blank or not found, the user is asked
    VALUE_UNREADABLE = "VALUE_UNREADABLE"  # text is there but is not one number or date
    UNIT_UNRECOGNISED = "UNIT_UNRECOGNISED"  # "25 mt", "x1076/mL"
    DATE_INVALID = "DATE_INVALID"  # "2026-13-45"
    MOTILITY_SUM_MISMATCH = "MOTILITY_SUM_MISMATCH"  # PR + NP + IM does not make the total


@dataclass(frozen=True)
class Fragment:
    """A run of text with its box, in page units, origin at the top left."""

    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    confidence: float = 1.0

    @property
    def height(self) -> float:
        return self.bottom - self.top

    @property
    def centre_y(self) -> float:
        return (self.top + self.bottom) / 2


@dataclass(frozen=True)
class PageText:
    number: int
    method: Method
    fragments: tuple[Fragment, ...]


@dataclass(frozen=True)
class Box:
    page: int
    x: float
    y: float
    width: float
    height: float

    def to_json(self) -> dict[str, Any]:
        return {
            "page": self.page,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "width": round(self.width, 1),
            "height": round(self.height, 1),
        }


@dataclass(frozen=True)
class Scores:
    ocr: float
    parse: float
    plausibility: float

    @property
    def confidence(self) -> float:
        """T-60 requirement 2: the lowest of the three."""
        return min(self.ocr, self.parse, self.plausibility)


@dataclass(frozen=True)
class LabField:
    field_id: str
    value: float | str | None  # a number, an ISO date for the date field, or None
    unit: str | None  # canonical spelling, or None
    raw_text: str | None  # what was read, before parsing; None when nothing was found
    box: Box | None
    scores: Scores
    flags: tuple[Flag, ...]
    status: FieldStatus
    method: Method | None
    target_test_code: str | None

    @property
    def confidence(self) -> float:
        return self.scores.confidence

    def to_json(self) -> dict[str, Any]:
        return {
            "field_id": self.field_id,
            "value": self.value,
            "unit": self.unit,
            "raw_text": self.raw_text,
            "bbox": self.box.to_json() if self.box else None,
            "confidence": round(self.confidence, 4),
            "scores": {
                "ocr": round(self.scores.ocr, 4),
                "parse": round(self.scores.parse, 4),
                "plausibility": round(self.scores.plausibility, 4),
            },
            "flags": [flag.value for flag in self.flags],
            "status": self.status.value,
            "method": self.method.value if self.method else None,
            "target_test_code": self.target_test_code,
        }


@dataclass(frozen=True)
class LabDraft:
    status: Status
    catalogue_version: str
    reason: RejectReason | None = None
    fields: tuple[LabField, ...] = ()
    ocr_engine: str | None = None
    extractor_version: str = EXTRACTOR_VERSION

    def field(self, field_id: str) -> LabField:
        return next(item for item in self.fields if item.field_id == field_id)

    def to_json(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "reason": self.reason.value if self.reason else None,
            "is_synthetic": self.status is Status.EXTRACTED,
            "extractor_version": self.extractor_version,
            "catalogue_version": self.catalogue_version,
            "ocr_engine": self.ocr_engine,
            "fields": [item.to_json() for item in self.fields],
        }
