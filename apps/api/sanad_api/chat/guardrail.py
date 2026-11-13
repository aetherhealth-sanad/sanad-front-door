"""Bounded decoding (P0) and the input guardrail (IG) for typed chat text, code only.

PRD 4.7.1 order: decode, then the emergency text check (S0b), then these checks, then the
model. Nothing here may run before S0b on the same text, because a rejection would otherwise
hide an emergency (PRD-FR-35, NFR-22). Results are reason codes; the text is never logged.
"""

from __future__ import annotations

import re
import unicodedata
from enum import StrEnum

MAX_TEXT_CHARS = 500

_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
# Seven or more digits, allowing one separator between digits: a phone or ID number.
_LONG_NUMBER = re.compile(r"\+?\d(?:[\s\-().]?\d){6,}")


class InputReason(StrEnum):
    TEXT_EMPTY = "TEXT_EMPTY"
    TEXT_LANGUAGE_NOT_SUPPORTED = "TEXT_LANGUAGE_NOT_SUPPORTED"
    TEXT_CONTAINS_CONTACT_DETAILS = "TEXT_CONTAINS_CONTACT_DETAILS"


def decode(text: str) -> str:
    """NFKC, control and format characters replaced by spaces, whitespace collapsed."""
    normalised = unicodedata.normalize("NFKC", text)
    cleaned = "".join(" " if unicodedata.category(ch).startswith("C") else ch for ch in normalised)
    return " ".join(cleaned.split())


def check(text: str) -> InputReason | None:
    """`None` means accepted. Text in a script the emergency check does not cover is never
    treated as clear, so it is never sent on (PRD 4.7.1, unparseable input)."""
    if not any(ch.isalnum() for ch in text):
        return InputReason.TEXT_EMPTY
    if not text.isascii():
        return InputReason.TEXT_LANGUAGE_NOT_SUPPORTED
    if _EMAIL.search(text) or _LONG_NUMBER.search(text):
        return InputReason.TEXT_CONTAINS_CONTACT_DETAILS
    return None
