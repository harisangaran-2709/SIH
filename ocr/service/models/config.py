"""
service/models/config.py
------------------------
Central configuration for the PaddleOCR model and engine.
All values read from environment variables with sensible defaults.
"""
from __future__ import annotations
import os
from dataclasses import dataclass, field


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    val = os.environ.get(name, "").strip().lower()
    if val in ("1", "true", "yes"):
        return True
    if val in ("0", "false", "no"):
        return False
    return default


@dataclass
class OCRConfig:
    # Language: 'en' (English) is the default.
    # PaddleOCR also ships models for 'ch', 'latin', 'cyrillic', etc.
    lang: str = field(default_factory=lambda: os.environ.get("OCR_LANG", "en"))

    # Whether to use the angle classifier (helps with rotated text).
    use_angle_cls: bool = field(
        default_factory=lambda: _env_bool("OCR_USE_ANGLE_CLS", True)
    )

    # Detections below this threshold are still returned for transparency.
    confidence_threshold: float = field(
        default_factory=lambda: _env_float("OCR_CONFIDENCE_THRESHOLD", 0.30)
    )

    max_image_size_mb: float = field(
        default_factory=lambda: _env_float("OCR_MAX_IMAGE_SIZE_MB", 10.0)
    )

    det_limit_side_len: int = field(
        default_factory=lambda: _env_int("OCR_DET_LIMIT_SIDE_LEN", 960)
    )

    port: int = field(default_factory=lambda: _env_int("OCR_PORT", 8000))

    timeout_seconds: int = field(
        default_factory=lambda: _env_int("OCR_TIMEOUT_SECONDS", 60)
    )

    use_gpu: bool = field(
        default_factory=lambda: _env_bool("OCR_USE_GPU", False)
    )


# Singleton – shared across all modules
ocr_config = OCRConfig()
