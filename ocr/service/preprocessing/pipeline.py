"""
preprocessing/pipeline.py
--------------------------
Modular image-preprocessing pipeline for package OCR.

Design goals
  - Improve OCR accuracy on real smartphone photos of packages.
  - Each step is independently toggleable via the PreprocessingConfig.
  - Steps are run in a fixed order that empirically works well for text detection.
  - We do NOT aggressively preprocess everything; some steps can hurt accuracy
    on already-good images.  Config tuning is documented per step.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class PreprocessingConfig:
    """Controls which preprocessing steps are applied and their parameters."""

    # ---- resize ----
    # Upscale images whose shorter side is below min_side so that small text
    # is easier to detect.  Large images are NOT downscaled here (PaddleOCR
    # handles that internally).
    resize_enabled: bool = True
    min_side: int = 1024          # minimum short-side resolution after resize
    max_side: int = 4096          # safety cap (prevents OOM on huge images)

    # ---- orientation correction ----
    # Use EXIF data to auto-rotate images taken in portrait/landscape mode.
    orientation_enabled: bool = True

    # ---- contrast enhancement ----
    # CLAHE (Contrast Limited Adaptive Histogram Equalization) improves
    # readability of text on coloured / poorly-lit backgrounds.
    clahe_enabled: bool = True
    clahe_clip_limit: float = 2.0
    clahe_tile_grid: tuple = (8, 8)

    # ---- sharpening ----
    # A mild unsharp-mask to recover detail lost to smartphone compression.
    sharpen_enabled: bool = True
    sharpen_sigma: float = 1.0
    sharpen_strength: float = 1.5    # 1.0 = no change, >1 = sharper

    # ---- denoising ----
    # Fast Non-Local Means (colour).  Disabled by default because it is slow
    # and often unnecessary for modern phone cameras.
    denoise_enabled: bool = False
    denoise_h: int = 10

    # ---- confidence filter (OCR layer, not preprocessing) ----
    min_confidence: float = 0.0      # keep everything by default; caller filters


# Default config used by the service
DEFAULT_CONFIG = PreprocessingConfig()


# ---------------------------------------------------------------------------
# Individual steps
# ---------------------------------------------------------------------------

def _to_cv2(img: Image.Image) -> np.ndarray:
    """PIL (RGB) → OpenCV (BGR)."""
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def _to_pil(img: np.ndarray) -> Image.Image:
    """OpenCV (BGR) → PIL (RGB)."""
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def apply_exif_orientation(img: Image.Image) -> Image.Image:
    """
    Rotate an image according to its EXIF orientation tag.
    Silently returns the original if no EXIF data is present.
    """
    try:
        exif = img._getexif()            # type: ignore[attr-defined]
        if exif is None:
            return img
        orientation_tag = 274            # EXIF tag for Orientation
        orientation = exif.get(orientation_tag)
        rotations = {3: 180, 6: 270, 8: 90}
        degrees = rotations.get(orientation)
        if degrees:
            img = img.rotate(degrees, expand=True)
    except Exception:
        pass                             # no EXIF — that's fine
    return img


def resize_image(img: Image.Image, cfg: PreprocessingConfig) -> Image.Image:
    """
    Upscale if shorter side < min_side.  Apply safety cap at max_side.
    Aspect ratio is always preserved.
    """
    w, h = img.size
    short = min(w, h)
    long_  = max(w, h)

    if short < cfg.min_side:
        scale = cfg.min_side / short
        new_w = int(w * scale)
        new_h = int(h * scale)
        # Safety cap
        if max(new_w, new_h) > cfg.max_side:
            scale = cfg.max_side / long_
            new_w = int(w * scale)
            new_h = int(h * scale)
        logger.debug("resize %dx%d → %dx%d", w, h, new_w, new_h)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    return img


def apply_clahe(cv_img: np.ndarray, cfg: PreprocessingConfig) -> np.ndarray:
    """
    Apply CLAHE to the luminance channel of the image.
    Operates in LAB colour space to avoid hue shift.
    """
    lab = cv2.cvtColor(cv_img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(
        clipLimit=cfg.clahe_clip_limit,
        tileGridSize=cfg.clahe_tile_grid,
    )
    l_ch = clahe.apply(l_ch)
    lab = cv2.merge((l_ch, a_ch, b_ch))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def apply_sharpen(cv_img: np.ndarray, cfg: PreprocessingConfig) -> np.ndarray:
    """Unsharp mask sharpening."""
    blur = cv2.GaussianBlur(cv_img, (0, 0), cfg.sharpen_sigma)
    return cv2.addWeighted(cv_img, cfg.sharpen_strength, blur, -(cfg.sharpen_strength - 1), 0)


def apply_denoise(cv_img: np.ndarray, cfg: PreprocessingConfig) -> np.ndarray:
    """Fast Non-Local Means colour denoising."""
    return cv2.fastNlMeansDenoisingColored(cv_img, None, cfg.denoise_h, cfg.denoise_h, 7, 21)


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------

def preprocess(
    img: Image.Image,
    cfg: Optional[PreprocessingConfig] = None,
) -> tuple[Image.Image, dict]:
    """
    Run the preprocessing pipeline on a PIL image.

    Returns
    -------
    processed: PIL.Image.Image
        The pre-processed image ready for PaddleOCR.
    info: dict
        Metadata about what was applied (for logging / debugging).
    """
    if cfg is None:
        cfg = DEFAULT_CONFIG

    info: dict = {"original_size": img.size, "steps": []}

    # 1. EXIF orientation
    if cfg.orientation_enabled:
        img = apply_exif_orientation(img)
        info["steps"].append("exif_orientation")

    # 2. Resize / upscale
    if cfg.resize_enabled:
        img = resize_image(img, cfg)
        info["steps"].append("resize")

    info["processed_size"] = img.size

    # Convert to OpenCV for the remaining steps
    cv_img = _to_cv2(img)

    # 3. CLAHE contrast enhancement
    if cfg.clahe_enabled:
        cv_img = apply_clahe(cv_img, cfg)
        info["steps"].append("clahe")

    # 4. Sharpening
    if cfg.sharpen_enabled:
        cv_img = apply_sharpen(cv_img, cfg)
        info["steps"].append("sharpen")

    # 5. Denoising (optional, disabled by default)
    if cfg.denoise_enabled:
        cv_img = apply_denoise(cv_img, cfg)
        info["steps"].append("denoise")

    return _to_pil(cv_img), info
