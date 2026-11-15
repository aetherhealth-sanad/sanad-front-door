"""Image preparation before OCR: straighten a page scanned at a small angle.

An engine that returns upright boxes (Tesseract) cannot be corrected afterwards, because the
cells of one row come back at different heights. The page is therefore turned before reading.
Only the picture is turned; no text is changed. numpy comes with the optional `ocr` extra.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PIL.Image import Image

MAX_SKEW = 6.0  # degrees searched either way
STEP = 0.25
WORK_WIDTH = 900  # the angle is measured on a small copy, for speed


def skew_angle(image: Image) -> float:
    """The turn, in degrees, that makes the text lines level. Found by trying angles and keeping
    the one whose row sums vary most: level lines give sharp dark and light bands."""
    import numpy as np

    scale = WORK_WIDTH / image.width
    small = image.convert("L").resize((WORK_WIDTH, max(1, round(image.height * scale))))
    ink = np.asarray(small) < 160
    if ink.mean() < 0.001:
        return 0.0
    ys, xs = np.nonzero(ink)
    cx, cy = small.width / 2, small.height / 2
    best_angle, best_score = 0.0, -1.0
    angle = -MAX_SKEW
    while angle <= MAX_SKEW + 1e-9:
        theta = np.radians(angle)
        rows = np.round((xs - cx) * np.sin(theta) + (ys - cy) * np.cos(theta) + cy).astype(int)
        rows = rows[(rows >= 0) & (rows < small.height)]
        score = float(np.var(np.bincount(rows, minlength=small.height)))
        if score > best_score:
            best_angle, best_score = angle, score
        angle += STEP
    return best_angle


def straighten(image: Image) -> Image:
    from PIL import Image as pil_image

    angle = skew_angle(image)
    if abs(angle) < STEP:
        return image
    return image.rotate(
        -angle, expand=True, fillcolor=(255, 255, 255), resample=pil_image.Resampling.BICUBIC
    )
