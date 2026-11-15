"""S2, second choice: the port every OCR engine implements, and the default that does nothing.

This follows the model adapter of RF-21. The default install has no engine: `DisabledOcr` never
reaches an engine or the network, and a page that needs OCR is refused with `OCR_UNAVAILABLE`
(AC-29.11). An engine runs locally and in-process; it must not send a document anywhere.
"""

from __future__ import annotations

import io
import math
import statistics
from collections.abc import Sequence
from typing import TYPE_CHECKING, Protocol

from sanad_api.document_import.intake import Limits, Rejected
from sanad_api.document_import.model import Fragment, RejectReason

if TYPE_CHECKING:
    from PIL.Image import Image

RENDER_DPI = 300


class OcrEngine(Protocol):
    """`engine_id` goes into the draft and the trace, so it must name the engine honestly."""

    engine_id: str

    @property
    def enabled(self) -> bool: ...

    def read(self, image: Image) -> list[Fragment]:
        """Text fragments with boxes in pixels (origin top left) and a confidence from 0 to 1."""
        ...


class DisabledOcr:
    engine_id = "disabled"

    @property
    def enabled(self) -> bool:
        return False

    def read(self, image: Image) -> list[Fragment]:
        raise Rejected(RejectReason.OCR_UNAVAILABLE)


Quad = tuple[tuple[float, float], tuple[float, float], tuple[float, float], tuple[float, float]]
# Boxes at least this many times wider than tall are used to measure the page skew.
_LONG_BOX = 4.0
# Below this angle, in degrees, the page counts as straight.
_MIN_SKEW = 0.2


def skew_degrees(quads: Sequence[Quad]) -> float:
    """The page skew, from the top edges of the long text boxes. 0 when it cannot be measured."""
    angles = []
    for (x0, y0), (x1, y1), _, (x3, y3) in quads:
        width, height = math.hypot(x1 - x0, y1 - y0), math.hypot(x3 - x0, y3 - y0)
        if height > 0 and width >= _LONG_BOX * height:
            angles.append(math.degrees(math.atan2(y1 - y0, x1 - x0)))
    return statistics.median(angles) if angles else 0.0


def fragments_from_quads(
    quads: Sequence[Quad], texts: Sequence[str], scores: Sequence[float]
) -> list[Fragment]:
    """Engine output to fragments. A skewed page is straightened here, in coordinates, so that
    rows line up again. The picture itself is not changed and no text is touched."""
    angle = skew_degrees(quads)
    turn = -math.radians(angle) if abs(angle) >= _MIN_SKEW else 0.0
    cos, sin = math.cos(turn), math.sin(turn)
    fragments = []
    for quad, text, score in zip(quads, texts, scores, strict=True):
        xs = [x * cos - y * sin for x, y in quad]
        ys = [x * sin + y * cos for x, y in quad]
        if text.strip():
            fragments.append(
                Fragment(text.strip(), min(xs), max(xs), min(ys), max(ys), float(score))
            )
    return fragments


def open_image(document: bytes, limits: Limits) -> Image:
    try:
        from PIL import Image as pil_image

        image = pil_image.open(io.BytesIO(document))
        if image.width * image.height > limits.max_pixels:
            raise Rejected(RejectReason.DOCUMENT_TOO_LARGE)
        image.load()
        return image.convert("RGB")
    except Rejected:
        raise
    except Exception as error:
        raise Rejected(RejectReason.DOCUMENT_UNREADABLE) from error


def render_pdf_page(document: bytes, index: int, limits: Limits, dpi: int = RENDER_DPI) -> Image:
    try:
        import pypdfium2

        pdf = pypdfium2.PdfDocument(document)
        try:
            page = pdf[index]
            scale = dpi / 72
            if page.get_width() * scale * page.get_height() * scale > limits.max_pixels:
                raise Rejected(RejectReason.DOCUMENT_TOO_LARGE)
            return page.render(scale=scale).to_pil().convert("RGB")
        finally:
            pdf.close()
    except Rejected:
        raise
    except Exception as error:
        raise Rejected(RejectReason.DOCUMENT_UNREADABLE) from error
