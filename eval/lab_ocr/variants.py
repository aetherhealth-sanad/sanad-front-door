"""Turns a synthetic PDF into pictures that look like scans (T-60). Phone photos with strong
perspective distortion are out of T-60 scope and are not made here.

Every variant is made from a generated synthetic document with a fixed seed, so a run can be
repeated. A variant returns the bytes the extractor will receive: an image-only PDF with the
same number of pages as the source.
"""

from __future__ import annotations

import io
from collections.abc import Callable

import numpy as np
import pypdfium2
from PIL import Image, ImageEnhance, ImageFilter

Transform = Callable[[Image.Image, np.random.Generator], Image.Image]


def render(pdf: bytes, dpi: int) -> list[Image.Image]:
    document = pypdfium2.PdfDocument(pdf)
    try:
        return [page.render(scale=dpi / 72).to_pil().convert("RGB") for page in document]
    finally:
        document.close()


def as_pdf(pages: list[Image.Image], dpi: int) -> bytes:
    buffer = io.BytesIO()
    pages[0].save(
        buffer, format="PDF", save_all=True, append_images=pages[1:], resolution=float(dpi)
    )
    return buffer.getvalue()


def _rotate(degrees: float) -> Transform:
    def apply(image: Image.Image, _: np.random.Generator) -> Image.Image:
        return image.rotate(
            degrees, expand=True, fillcolor=(255, 255, 255), resample=Image.Resampling.BICUBIC
        )

    return apply


def _blur(radius: float) -> Transform:
    return lambda image, _: image.filter(ImageFilter.GaussianBlur(radius))


def _noise(sigma: float) -> Transform:
    def apply(image: Image.Image, rng: np.random.Generator) -> Image.Image:
        pixels = np.asarray(image).astype(np.float32)
        pixels += rng.normal(0, sigma, pixels.shape)
        return Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))

    return apply


def _low_contrast(image: Image.Image, _: np.random.Generator) -> Image.Image:
    faded = ImageEnhance.Contrast(image).enhance(0.35)
    return ImageEnhance.Brightness(faded).enhance(1.15)


def _jpeg(quality: int) -> Transform:
    def apply(image: Image.Image, _: np.random.Generator) -> Image.Image:
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality)
        return Image.open(io.BytesIO(buffer.getvalue())).convert("RGB")

    return apply


def _scanned(image: Image.Image, rng: np.random.Generator) -> Image.Image:
    """lab_B: a page through an office scanner, slightly turned, noisy and soft."""
    turned = _rotate(2.5)(image, rng)
    noisy = _noise(14)(turned, rng)
    return noisy.filter(ImageFilter.GaussianBlur(0.8))


# name -> (render DPI, transform). The text-layer variant is the PDF itself and is not here.
VARIANTS: dict[str, tuple[int, Transform | None]] = {
    "scan-300dpi": (300, None),
    "scan-200dpi": (200, None),
    "scan-150dpi": (150, None),
    "scan-100dpi": (100, None),
    "rotated-2deg": (200, _rotate(2)),
    "rotated-5deg": (200, _rotate(-5)),
    "rotated-90deg": (200, _rotate(90)),
    "blur": (200, _blur(1.4)),
    "noise": (200, _noise(22)),
    "low-contrast": (200, _low_contrast),
    "jpeg-q20": (150, _jpeg(20)),
    "scanned": (200, _scanned),
}


def make(pdf: bytes, name: str, seed: int) -> bytes:
    dpi, transform = VARIANTS[name]
    rng = np.random.default_rng(seed)
    pages = render(pdf, dpi)
    if transform is not None:
        pages = [transform(page, rng) for page in pages]
    return as_pdf(pages, dpi)
