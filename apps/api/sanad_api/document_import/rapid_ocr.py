"""A local OCR engine: RapidOCR running the PP-OCR detection and recognition models on ONNX
Runtime (T4.18, optional `ocr` extra).

It runs in-process on the CPU. The models ship inside the installed package, so reading a
document makes no network call (AC-29.11). It is a detection and recognition pipeline, not a
language model: it returns the text it sees with a box and a confidence, and cannot write text
that is not on the page.
"""

from __future__ import annotations

import logging
from importlib import metadata
from typing import TYPE_CHECKING, Any

from sanad_api.document_import.model import Fragment
from sanad_api.document_import.ocr import Quad, fragments_from_quads

if TYPE_CHECKING:
    from PIL.Image import Image

# The engine works best when small print is about this tall. A picture whose long side is
# shorter than MIN_LONG_SIDE is enlarged before reading (TECH_TBD, set from the evaluation run).
MIN_LONG_SIDE = 2200
MAX_UPSCALE = 3.0


class RapidOcrEngine:
    def __init__(self, min_long_side: int = MIN_LONG_SIDE) -> None:
        from rapidocr import RapidOCR

        self._engine = RapidOCR()
        # The library sets its own logger to INFO when it loads; it logs file paths, not text.
        logging.getLogger("RapidOCR").setLevel(logging.WARNING)
        self._min_long_side = min_long_side
        self.engine_id = f"rapidocr-{metadata.version('rapidocr')}"

    @property
    def enabled(self) -> bool:
        return True

    def read(self, image: Image) -> list[Fragment]:
        prepared = self._prepare(image)
        quads, texts, scores = self._run(prepared)
        if _is_sideways(quads):
            # Text runs up or down the page. Try both quarter turns and keep the clearer one.
            turned = [self._run(prepared.rotate(angle, expand=True)) for angle in (90, 270)]
            quads, texts, scores = max(turned, key=lambda out: _mean(out[2]))
        return fragments_from_quads(quads, texts, scores)

    def _prepare(self, image: Image) -> Image:
        from PIL import Image as pil_image

        long_side = max(image.size)
        if long_side >= self._min_long_side:
            return image
        scale = min(self._min_long_side / long_side, MAX_UPSCALE)
        size = (round(image.width * scale), round(image.height * scale))
        return image.resize(size, pil_image.Resampling.LANCZOS)

    def _run(self, image: Image) -> tuple[list[Quad], list[str], list[float]]:
        out: Any = self._engine(image, text_score=0.0)
        if out.boxes is None or out.txts is None:
            return [], [], []
        quads: list[Quad] = [
            tuple((float(x), float(y)) for x, y in box)  # type: ignore[misc]
            for box in out.boxes
        ]
        return quads, [str(text) for text in out.txts], [float(score) for score in out.scores]


def _mean(scores: list[float]) -> float:
    return sum(scores) / len(scores) if scores else 0.0


def _is_sideways(quads: list[Quad]) -> bool:
    tall = sum(
        1
        for quad in quads
        if max(y for _, y in quad) - min(y for _, y in quad)
        > 2 * (max(x for x, _ in quad) - min(x for x, _ in quad))
    )
    return bool(quads) and tall > len(quads) / 2
