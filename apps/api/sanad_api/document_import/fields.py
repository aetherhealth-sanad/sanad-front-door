"""The versioned list of fields T-60 reads, with their labels, unit spellings and plausibility
bounds. It is data, so a new field or spelling is a reviewed catalogue change, not a code change.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

CATALOGUE_FILE = "catalogue/lab-report-ocr.draft-0.1.json"


def normalise(text: str) -> str:
    return " ".join(text.split()).casefold()


def unit_key(text: str) -> str:
    """Spelling-only comparison: case, spaces and the multiplication sign. Never a conversion."""
    return "".join(text.split()).casefold().replace("×", "x")


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class FieldDef(_Frozen):
    field_id: str
    labels: tuple[str, ...]
    canonical_unit: str | None
    unit_spellings: tuple[str, ...]
    plausible_min: float
    plausible_max: float
    target_test_code: str | None

    def canonical(self, printed: str) -> str | None:
        key = unit_key(printed)
        return self.canonical_unit if key in {unit_key(s) for s in self.unit_spellings} else None


class DateFieldDef(_Frozen):
    field_id: str
    labels: tuple[str, ...]


class MotilitySum(_Frozen):
    field_ids: tuple[str, ...]
    total: float
    tolerance: float
    status: str
    note: str


class LabCatalogue(_Frozen):
    catalogue_id: Literal["lab-report-ocr"]
    catalogue_version: str
    layout_id: str
    approval_status: str
    status_note: str
    synthetic_banner: str
    report_id_label: str
    report_id_prefix: str
    date_field: DateFieldDef
    motility_sum: MotilitySum
    fields: tuple[FieldDef, ...]

    @property
    def field_ids(self) -> tuple[str, ...]:
        return (*(f.field_id for f in self.fields), self.date_field.field_id)

    def by_label(self, label: str) -> FieldDef | DateFieldDef | None:
        wanted = normalise(label)
        candidates: tuple[FieldDef | DateFieldDef, ...] = (*self.fields, self.date_field)
        for item in candidates:
            if wanted in {normalise(text) for text in item.labels}:
                return item
        return None


def load_lab_catalogue(repo_root: Path) -> LabCatalogue:
    raw = json.loads((repo_root / CATALOGUE_FILE).read_text(encoding="utf-8"))
    return LabCatalogue.model_validate(raw)
