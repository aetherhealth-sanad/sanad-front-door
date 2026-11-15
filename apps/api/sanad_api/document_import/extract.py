"""`extract`: one synthetic semen analysis report in, a draft of its fields out (T-60, RF-29).

Order of work: type and size (S1), text source (S2), synthetic marker (S3), rows (S4), field
lookup by label (S5), parsing and plausibility (S6), status (S7). Each stage fails closed.

The function only reads. It writes nothing, logs nothing and keeps nothing. It never computes a
value from other values and never corrects what it read. Every field it returns is unconfirmed,
and the rules engine reads confirmed values only (T-60 requirements 4 and 5).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import date
from typing import Any

from sanad_api.document_import import layout, ocr, text_layer
from sanad_api.document_import.fields import (
    DateFieldDef,
    FieldDef,
    LabCatalogue,
    normalise,
)
from sanad_api.document_import.intake import Kind, Limits, Rejected, sniff
from sanad_api.document_import.model import (
    Box,
    FieldStatus,
    Flag,
    Fragment,
    LabDraft,
    LabField,
    Method,
    PageText,
    RejectReason,
    Scores,
    Status,
)
from sanad_api.document_import.parse import parse_date, parse_measurement

DEFAULT_CONFIDENCE_THRESHOLD = 0.90  # TECH_TBD until calibrated on the fixtures (OD-24)


@dataclass(frozen=True)
class _Found:
    """The cells read for one field on one row."""

    cells: tuple[Fragment, ...]
    page: PageText


def extract(
    document: bytes,
    catalogue: LabCatalogue,
    today: date,
    engine: ocr.OcrEngine | None = None,
    limits: Limits | None = None,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> LabDraft:
    engine = engine or ocr.DisabledOcr()
    limits = limits or Limits()
    try:
        pages = _read_pages(document, engine, limits)
    except Rejected as rejected:
        return _rejected(catalogue, rejected.reason)

    page_rows = [(page, layout.rows(page.fragments)) for page in pages]
    if not _is_synthetic(page_rows, catalogue):
        return _rejected(catalogue, RejectReason.DOCUMENT_NOT_SYNTHETIC)

    found: dict[str, list[_Found]] = defaultdict(list)
    for page, rows in page_rows:
        for row in rows:
            spec = catalogue.by_label(row[0].text)
            if spec is not None:
                found[spec.field_id].append(_Found(row[1:], page))
    if not found:
        return _rejected(catalogue, RejectReason.DOCUMENT_LAYOUT_NOT_RECOGNISED)

    fields = [_field(spec, found.get(spec.field_id, []), today) for spec in catalogue.fields]
    fields.append(_field(catalogue.date_field, found.get(catalogue.date_field.field_id, []), today))
    fields = _check_motility_sum(fields, catalogue)
    fields = [_with_status(item, confidence_threshold) for item in fields]
    used_ocr = any(page.method is Method.OCR for page in pages)
    return LabDraft(
        status=Status.EXTRACTED,
        catalogue_version=catalogue.catalogue_version,
        fields=tuple(fields),
        ocr_engine=engine.engine_id if used_ocr else None,
    )


def _rejected(catalogue: LabCatalogue, reason: RejectReason) -> LabDraft:
    return LabDraft(
        status=Status.REJECTED, catalogue_version=catalogue.catalogue_version, reason=reason
    )


# --- S2: text source -----------------------------------------------------------------------


def _read_pages(document: bytes, engine: ocr.OcrEngine, limits: Limits) -> list[PageText]:
    kind = sniff(document, limits)
    if kind is not Kind.PDF:
        if not engine.enabled:
            raise Rejected(RejectReason.OCR_UNAVAILABLE)
        image = ocr.open_image(document, limits)
        return [PageText(1, Method.OCR, tuple(engine.read(image)))]
    pages: list[PageText] = []
    for index, cells in enumerate(text_layer.read_pdf(document, limits)):
        if cells is not None:
            pages.append(PageText(index + 1, Method.TEXT_LAYER, tuple(cells)))
            continue
        if not engine.enabled:
            raise Rejected(RejectReason.OCR_UNAVAILABLE)
        image = ocr.render_pdf_page(document, index, limits)
        pages.append(PageText(index + 1, Method.OCR, tuple(engine.read(image))))
    return pages


# --- S3: synthetic marker ------------------------------------------------------------------


def _is_synthetic(
    page_rows: list[tuple[PageText, list[layout.Row]]], catalogue: LabCatalogue
) -> bool:
    """Every page carries the banner, and the report ID starts with the synthetic prefix."""
    banner = normalise(catalogue.synthetic_banner)
    for page, _ in page_rows:
        if not any(banner in normalise(fragment.text) for fragment in page.fragments):
            return False
    label = normalise(catalogue.report_id_label)
    for _, rows in page_rows:
        for row in rows:
            for cell, following in zip(row, row[1:], strict=False):
                if normalise(cell.text) == label:
                    return following.text.strip().startswith(catalogue.report_id_prefix)
    return False


# --- S6: one field -------------------------------------------------------------------------


def _field(spec: FieldDef | DateFieldDef, found: list[_Found], today: date) -> LabField:
    target = spec.target_test_code if isinstance(spec, FieldDef) else None
    if not found or not any(cell.text.strip() for cell in found[0].cells):
        return LabField(
            field_id=spec.field_id,
            value=None,
            unit=None,
            raw_text=None,
            box=None,
            scores=Scores(0.0, 0.0, 0.0),
            flags=(Flag.VALUE_MISSING,),
            status=FieldStatus.NEEDS_CONFIRMATION,
            method=found[0].page.method if found else None,
            target_test_code=target,
        )

    first = found[0]
    raw = " ".join(cell.text.strip() for cell in first.cells)
    parsed = parse_measurement(raw, spec) if isinstance(spec, FieldDef) else parse_date(raw, today)
    flags = list(parsed.flags)
    value, parse_score, plausibility = parsed.value, parsed.parse_score, parsed.plausibility
    if len(found) > 1:
        # The same field printed twice. Neither reading is chosen.
        flags.append(Flag.DUPLICATE_VALUE)
        raw = " | ".join(" ".join(c.text.strip() for c in item.cells) for item in found)
        value, parse_score = None, 0.0
    return LabField(
        field_id=spec.field_id,
        value=value,
        unit=parsed.unit,
        raw_text=raw,
        box=_box(first),
        scores=Scores(min(c.confidence for c in first.cells), parse_score, plausibility),
        flags=tuple(dict.fromkeys(flags)),
        status=FieldStatus.UNCONFIRMED,
        method=first.page.method,
        target_test_code=target,
    )


def _box(found: _Found) -> Box:
    cells = found.cells
    x0, x1 = min(c.x0 for c in cells), max(c.x1 for c in cells)
    top, bottom = min(c.top for c in cells), max(c.bottom for c in cells)
    return Box(found.page.number, x0, top, x1 - x0, bottom - top)


def _check_motility_sum(fields: list[LabField], catalogue: LabCatalogue) -> list[LabField]:
    """Flags PR, NP and IM when all three were read and they do not make the total. It only
    adds a flag; it never changes or computes a value."""
    rule = catalogue.motility_sum
    parts = [item for item in fields if item.field_id in rule.field_ids]
    values = [item.value for item in parts]
    if len(parts) != len(rule.field_ids) or not all(isinstance(v, float) for v in values):
        return fields
    total = sum(v for v in values if isinstance(v, float))
    if abs(total - rule.total) <= rule.tolerance:
        return fields
    return [
        _add_flag(item, Flag.MOTILITY_SUM_MISMATCH) if item.field_id in rule.field_ids else item
        for item in fields
    ]


def _add_flag(item: LabField, flag: Flag) -> LabField:
    scores = Scores(item.scores.ocr, item.scores.parse, 0.0)
    return replace(item, flags=(*item.flags, flag), scores=scores)


# --- S7: status ----------------------------------------------------------------------------


def _with_status(item: LabField, threshold: float) -> LabField:
    flags = list(item.flags)
    if item.raw_text is not None and item.scores.ocr < threshold:
        flags.append(Flag.OCR_CONFIDENCE_LOW)
    needs = bool(flags) or item.confidence < threshold
    status = FieldStatus.NEEDS_CONFIRMATION if needs else FieldStatus.UNCONFIRMED
    return replace(item, flags=tuple(dict.fromkeys(flags)), status=status)


def to_observation_inputs(draft: LabDraft) -> list[dict[str, Any]]:
    """The fields the lab catalogue has a code for, as `POST /observations` bodies. The client
    sends them only after the user has reviewed them on the lab-entry screen (T-33); they are
    stored as NEEDS_USER_CONFIRMATION and reach the rules only once confirmed (RF-15)."""
    collected = next((f.value for f in draft.fields if f.field_id == "collection_date"), None)
    return [
        {
            "test_code": item.target_test_code,
            "value": item.value,
            "unit": item.unit,
            "collected_on": collected if isinstance(collected, str) else None,
        }
        for item in draft.fields
        if item.target_test_code is not None
    ]
