"""Bounded decoding (P0) and the input guardrail (IG) for typed chat text, code only.

PRD 4.7.1 order: decode, then the emergency text check (S0b), then these checks, then the
model. Nothing here may run before S0b on the same text, because a rejection would otherwise
hide an emergency (PRD-FR-35, NFR-22). Results are reason codes; the text is never logged.
"""

from __future__ import annotations

import re
import unicodedata
from enum import StrEnum
from typing import NamedTuple

MAX_TEXT_CHARS = 500

_EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
# Seven or more digits, allowing one separator between digits: a phone or ID number.
_LONG_NUMBER = re.compile(r"\+?\d(?:[\s\-().]?\d){6,}")

# RF-27, AC-27.2: identifiers that name a person on their own are blocked, never redacted.
# ponytail: pattern rules, English only; misses are expected (AC-27.8). Add a case and a rule
# for each miss found, rather than a model.
_ID_WORD = (
    r"(?:mrn|medical\s+record(?:\s+(?:no|number))?|record\s+(?:no|number)|patient\s+id"
    r"|national\s+id|emirates\s+id|passport(?:\s+(?:no|number))?"
    r"|insurance(?:\s+(?:no|number))?|policy\s+(?:no|number)|id\s+(?:no|number))"
)
_IDENTIFIER = re.compile(rf"\b{_ID_WORD}\b\W{{0,4}}(?:is\s+)?[A-Za-z]{{0,3}}\d{{4,}}", re.I)
_STREET_WORD = r"(?:street|st|road|rd|avenue|ave|lane|boulevard|blvd|drive)"
_ADDRESS = re.compile(
    rf"\b\d{{1,5}}[A-Za-z]?\s+(?:[A-Za-z']+\s+){{1,3}}{_STREET_WORD}\b"
    r"|\b(?:apartment|apt|flat|villa|building|bldg|p\.?\s?o\.?\s+box)\s*(?:no\.?\s*)?#?\d+",
    re.I,
)

# AC-27.3: what can be replaced without losing the answer is redacted before the model call.
_DATE = re.compile(r"\b\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2})\b|\b\d{4}-\d{1,2}-\d{1,2}\b")
_CAP = r"[A-Z][A-Za-z'\-]+"
_NAMES = (
    re.compile(
        rf"(?i:\b(?:my name is|my name's|call me))\s+([A-Za-z][A-Za-z'\-]*(?:\s+{_CAP}){{0,3}})"
    ),
    re.compile(rf"(?i:\b(?:I am|I'm))\s+({_CAP}(?:\s+{_CAP})+)"),
    re.compile(rf"\b(?:Dr|Mr|Mrs|Ms)\.?\s+({_CAP})"),
)


class InputReason(StrEnum):
    TEXT_EMPTY = "TEXT_EMPTY"
    TEXT_LANGUAGE_NOT_SUPPORTED = "TEXT_LANGUAGE_NOT_SUPPORTED"
    TEXT_CONTAINS_CONTACT_DETAILS = "TEXT_CONTAINS_CONTACT_DETAILS"
    TEXT_CONTAINS_IDENTIFIER = "TEXT_CONTAINS_IDENTIFIER"


class Redaction(NamedTuple):
    text: str
    types: tuple[str, ...]  # sorted, distinct: DATE, NAME
    count: int = 0


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
    # A full date is redacted later (AC-27.3), so it must not count as a long number here.
    if _EMAIL.search(text) or _LONG_NUMBER.search(_DATE.sub(" ", text)):
        return InputReason.TEXT_CONTAINS_CONTACT_DETAILS
    if _IDENTIFIER.search(text) or _ADDRESS.search(text):
        return InputReason.TEXT_CONTAINS_IDENTIFIER
    return None


def redact(text: str) -> Redaction:
    """AC-27.3: full dates become [DATE] and names [NAME]; everything else is kept."""
    found: list[str] = []

    def mark(kind: str, match: re.Match[str], group: int = 0) -> str:
        found.append(kind)
        whole, start = match.group(0), match.start(group) - match.start(0)
        return whole[:start] + f"[{kind}]" + whole[start + len(match.group(group)) :]

    text = _DATE.sub(lambda m: mark("DATE", m), text)
    for pattern in _NAMES:
        text = pattern.sub(lambda m: mark("NAME", m, 1), text)
    return Redaction(text, tuple(sorted(set(found))), len(found))
