"""Draws synthetic semen analysis reports in one layout, with the ground truth for each (T-60).

Every report is invented: the values are test values with no clinical meaning, no value is
compared with any limit, and no report describes a real person or a real laboratory. These are
stand-ins until Đạt's fixture package (T-20, T-34) is in the repository.

The ground truth is a software oracle: this file printed the values, and an extractor must read
them back. It says nothing about clinical correctness.
"""

from __future__ import annotations

import io
import random
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas

LAYOUT_ID = "synthetic-semen-report-v1"
BANNER = (
    "SYNTHETIC DATA. Not a real person. Not a clinical record. "
    "For Sanad demo and testing only."
)
PAGE_WIDTH, PAGE_HEIGHT = A4
COLUMNS = (60.0, 280.0, 370.0)  # parameter, result, unit

# field_id, printed label, canonical unit (what a correct extractor returns), printed unit
ROWS: tuple[tuple[str, str, str | None, str], ...] = (
    ("volume", "Volume", "mL", "mL"),
    ("ph", "pH", None, ""),
    ("concentration", "Sperm concentration", "million/mL", "10^6/mL"),
    ("total_count", "Total sperm count", "million", "10^6"),
    ("progressive_motility", "Progressive motility (PR)", "%", "%"),
    ("non_progressive_motility", "Non-progressive motility (NP)", "%", "%"),
    ("immotile", "Immotile (IM)", "%", "%"),
    ("normal_forms", "Normal forms", "%", "%"),
)


@dataclass(frozen=True)
class Report:
    report_id: str = "SYN-LAB-A-001"
    collection_date: str = "2026-10-05"
    values: dict[str, str] = field(
        default_factory=lambda: {
            "volume": "2.5",
            "ph": "7.4",
            "concentration": "16",
            "total_count": "40",
            "progressive_motility": "32",
            "non_progressive_motility": "8",
            "immotile": "60",
            "normal_forms": "4",
        }
    )
    # Printed unit overrides by field_id. An empty string prints no unit.
    units: dict[str, str] = field(default_factory=dict)
    banner: bool = True
    extra_lines: tuple[str, ...] = ()

    def printed_unit(self, field_id: str, default: str) -> str:
        return self.units.get(field_id, default)


def random_report(seed: int) -> Report:
    """A clean report with invented values. The same seed always gives the same report.
    PR + NP + IM always make 100, as they do on a real report."""
    rng = random.Random(seed)
    pr = rng.randint(0, 80)
    np_ = rng.randint(0, 100 - pr)
    day = date(2026, 1, 1) + timedelta(days=rng.randint(0, 280))
    volume = f"{rng.randint(0, 7)}.{rng.randint(0, 9)}"
    concentration = rng.choice(
        [str(rng.randint(0, 180)), f"{rng.randint(0, 90)}.{rng.randint(1, 9)}"]
    )
    total = f"{float(volume) * float(concentration):.1f}"  # synthetic fixture only
    return Report(
        report_id=f"SYN-LAB-G-{seed:04d}",
        collection_date=day.isoformat(),
        values={
            "volume": volume,
            "ph": f"{rng.randint(6, 8)}.{rng.randint(0, 9)}",
            "concentration": concentration,
            "total_count": total,
            "progressive_motility": str(pr),
            "non_progressive_motility": str(np_),
            "immotile": str(100 - pr - np_),
            "normal_forms": str(rng.randint(0, 30)),
        },
    )


def truth(report: Report) -> dict[str, Any]:
    """What a correct extractor returns for a clean `report`."""
    fields: dict[str, Any] = {}
    for field_id, _, unit, _ in ROWS:
        printed = report.values[field_id].replace(",", ".")  # the value a reader means
        fields[field_id] = {"value": float(printed), "unit": unit}
    fields["collection_date"] = {"value": report.collection_date, "unit": None}
    return {"report_id": report.report_id, "layout_id": LAYOUT_ID, "fields": fields}


def with_changes(report: Report, **changes: Any) -> Report:
    return replace(report, **changes)


def render_pdf(report: Report) -> bytes:
    buffer = io.BytesIO()
    canvas = Canvas(buffer, pagesize=A4, invariant=1)
    canvas.setTitle("Synthetic semen analysis report")
    y = PAGE_HEIGHT - 22

    def text(x: float, value: str, size: float = 10, bold: bool = False) -> None:
        canvas.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        canvas.drawString(x, y, value)

    if report.banner:
        text(60, BANNER, size=8, bold=True)
    y -= 50
    text(60, "Semen Analysis Report", size=18, bold=True)
    y -= 22
    text(60, "Mock Andrology Laboratory (synthetic, not a real provider)", size=9)
    y -= 34
    text(60, "Report ID", bold=True)
    text(COLUMNS[1], report.report_id)
    y -= 20
    text(60, "Collection date", bold=True)
    text(COLUMNS[1], report.collection_date)
    y -= 40
    text(COLUMNS[0], "Parameter", bold=True)
    text(COLUMNS[1], "Result", bold=True)
    text(COLUMNS[2], "Unit", bold=True)
    for field_id, label, _, unit in ROWS:
        y -= 24
        text(COLUMNS[0], label)
        text(COLUMNS[1], report.values[field_id])
        printed = report.printed_unit(field_id, unit)
        if printed:
            text(COLUMNS[2], printed)
    y -= 36
    text(60, "Values are invented for software testing and are not compared with any limit.", 8)
    for line in report.extra_lines:
        y -= 14
        text(60, line, size=8)
    canvas.showPage()
    canvas.save()
    return buffer.getvalue()
