"""S1: what kind of file this is and whether it is small enough to open.

The type comes from the first bytes, never from a file name or a content-type header
(AC-29.1). The limits are engineering defaults (TECH_TBD, OD-24).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from sanad_api.document_import.model import RejectReason


class Kind(StrEnum):
    PDF = "PDF"
    PNG = "PNG"
    JPEG = "JPEG"


@dataclass(frozen=True)
class Limits:
    max_bytes: int = 5 * 1024 * 1024
    max_pages: int = 5
    max_pixels: int = 40_000_000


class Rejected(Exception):
    """Carries a reason code only. It never repeats document content."""

    def __init__(self, reason: RejectReason) -> None:
        super().__init__(reason.value)
        self.reason = reason


def sniff(document: bytes, limits: Limits) -> Kind:
    if len(document) > limits.max_bytes:
        raise Rejected(RejectReason.DOCUMENT_TOO_LARGE)
    if document.startswith(b"%PDF-"):
        return Kind.PDF
    if document.startswith(b"\x89PNG\r\n\x1a\n"):
        return Kind.PNG
    if document.startswith(b"\xff\xd8\xff"):
        return Kind.JPEG
    raise Rejected(RejectReason.DOCUMENT_UNSUPPORTED_TYPE)
