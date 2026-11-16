"""Turns the text read for one field into a value, a unit, a parse score and flags (S6).

Nothing here corrects text. A value is returned only when the text holds exactly one clean
number (or one date) and the reading is unambiguous; otherwise the value is None and a flag says
why, so the user is asked instead of the system guessing (T-60 requirement 6).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from sanad_api.document_import.fields import FieldDef
from sanad_api.document_import.model import Flag

# Parse scores. They are design constants: 1 for a clean reading, lower for one that needed a
# rule to read, 0 for one that could not be read. TECH_TBD.
CLEAN = 1.0
NORMALISED = 0.5
UNREAD = 0.0

_NUMBER_TOKEN = re.compile(r"^[0-9][0-9.,]*$")
_CLEAN = re.compile(r"^\d+(\.\d+)?$")
_DECIMAL_COMMA = re.compile(r"^\d+,\d{1,2}$")  # "2,5": one comma, one or two digits after
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_DMY = re.compile(r"^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$")


@dataclass(frozen=True)
class Parsed:
    value: float | str | None
    unit: str | None
    parse_score: float
    plausibility: float
    flags: tuple[Flag, ...]


def parse_measurement(text: str, spec: FieldDef) -> Parsed:
    tokens = text.split()
    numbers = []
    for token in tokens:
        if _NUMBER_TOKEN.match(token):
            numbers.append(token)
        else:
            break
    unit_text = " ".join(tokens[len(numbers) :])
    flags: list[Flag] = []

    if not numbers:
        flags.append(Flag.VALUE_UNREADABLE)
        return Parsed(None, None, UNREAD, UNREAD, tuple(flags))
    if len(numbers) > 1:
        flags.append(Flag.DUPLICATE_VALUE)
        return Parsed(None, None, UNREAD, UNREAD, tuple(flags))

    value, parse_score, number_flags = _number(numbers[0])
    flags += number_flags

    unit: str | None = None
    unit_ok = True
    if spec.canonical_unit is None:
        if unit_text:
            flags.append(Flag.UNIT_UNRECOGNISED)  # a unit where the field has none
            unit_ok = False
    elif not unit_text:
        flags.append(Flag.UNIT_MISSING)
        unit_ok = False
    else:
        unit = spec.canonical(unit_text)
        if unit is None:
            flags.append(Flag.UNIT_UNRECOGNISED)
            unit_ok = False

    in_range = value is not None and spec.plausible_min <= value <= spec.plausible_max
    if value is not None and not in_range:
        flags.append(Flag.OUT_OF_RANGE)
    plausibility = 1.0 if unit_ok and in_range else 0.0
    return Parsed(value, unit, parse_score, plausibility, tuple(flags))


def _number(token: str) -> tuple[float | None, float, list[Flag]]:
    if _CLEAN.match(token):
        return float(token), CLEAN, []
    if _DECIMAL_COMMA.match(token):
        return float(token.replace(",", ".")), NORMALISED, [Flag.DECIMAL_SEPARATOR_UNCLEAR]
    if "," in token:
        # "1,250" could be a thousands separator or a decimal comma; "2,5.0" is both at once.
        return None, UNREAD, [Flag.DECIMAL_SEPARATOR_UNCLEAR]
    return None, UNREAD, [Flag.VALUE_UNREADABLE]  # "2..5", "7."


def parse_date(text: str, today: date) -> Parsed:
    """ISO dates are read as they are. Day-first or month-first dates are read only when one of
    the two numbers cannot be a month; a two-digit year is never expanded."""
    stripped = text.strip()
    iso = _ISO.match(stripped)
    if iso:
        return _date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)), today, CLEAN)
    dmy = _DMY.match(stripped)
    if dmy is None:
        return Parsed(None, None, UNREAD, UNREAD, (Flag.VALUE_UNREADABLE,))
    first, second, year = int(dmy.group(1)), int(dmy.group(2)), dmy.group(3)
    if len(year) == 2 or (first <= 12 and second <= 12):
        return Parsed(None, None, UNREAD, UNREAD, (Flag.DATE_FORMAT_AMBIGUOUS,))
    day, month = (first, second) if first > 12 else (second, first)
    return _date(int(year), month, day, today, NORMALISED)


def _date(year: int, month: int, day: int, today: date, score: float) -> Parsed:
    try:
        value = date(year, month, day)
    except ValueError:
        return Parsed(None, None, UNREAD, UNREAD, (Flag.DATE_INVALID,))
    if value > today:
        return Parsed(value.isoformat(), None, score, 0.0, (Flag.OUT_OF_RANGE,))
    return Parsed(value.isoformat(), None, score, 1.0, ())
