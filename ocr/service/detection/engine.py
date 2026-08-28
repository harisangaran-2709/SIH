"""
service/detection/engine.py
----------------------------
PaddleOCR detection engine – the only module that touches PaddleOCR.

Architecture
------------
  Image (PIL)
      |
  Preprocessing pipeline
      |
  PaddleOCR.ocr()
      |
  Raw results [ [ [bbox], (text, conf) ], ... ]
      |
  Normalised detections [ OCRDetection, ... ]

Bounding-box coordinate system
--------------------------------
Every bounding box is returned as four corner points in pixel coordinates,
relative to the *original* image (before any preprocessing resize).

  Format: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
           top-left, top-right, bottom-right, bottom-left
           Origin: top-left corner of the image (x goes right, y goes down).

The preprocessing pipeline may resize the image internally; the engine
scales bounding boxes back to original-image coordinates before returning.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from PIL import Image

from ..models.config import OCRConfig, ocr_config
from ..preprocessing.pipeline import PreprocessingConfig, preprocess

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class OCRDetection:
    """One detected text region."""
    text: str
    raw_text: str           # original OCR output, never mutated
    confidence: float       # 0.0 – 1.0
    bounding_box: List[List[int]]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] in px
    below_threshold: bool = False  # True when conf < configured threshold


@dataclass
class OCRImageResult:
    """OCR result for a single image."""
    image_id: str
    width: int               # original image width in pixels
    height: int              # original image height in pixels
    processing_time_ms: int
    detections: List[OCRDetection]
    preprocessing_steps: List[str] = field(default_factory=list)
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class PaddleOCREngine:
    """
    Wraps PaddleOCR and exposes a simple `process_image` method.

    Lazy-loaded: PaddleOCR is only initialised the first time process_image
    is called so that import errors are surfaced at call time, not at startup.
    """

    def __init__(self, config: OCRConfig = ocr_config):
        self._config = config
        self._ocr = None   # lazy init

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_ocr(self):
        """Initialise (or return the cached) PaddleOCR instance."""
        if self._ocr is not None:
            return self._ocr

        try:
            from paddleocr import PaddleOCR  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "PaddleOCR is not installed.  "
                "Run:  pip install paddlepaddle==2.6.2 paddleocr==2.9.1"
            ) from exc

        logger.info(
            "Initialising PaddleOCR  lang=%s  use_angle_cls=%s  gpu=%s",
            self._config.lang,
            self._config.use_angle_cls,
            self._config.use_gpu,
        )
        self._ocr = PaddleOCR(
            use_angle_cls=self._config.use_angle_cls,
            lang=self._config.lang,
            use_gpu=self._config.use_gpu,
            show_log=False,
            det_limit_side_len=self._config.det_limit_side_len,
        )
        return self._ocr

    @staticmethod
    def _scale_box(
        box: list,
        orig_w: int,
        orig_h: int,
        proc_w: int,
        proc_h: int,
    ) -> List[List[int]]:
        """
        Scale bounding-box points from preprocessed-image space back to
        original-image space.

        Parameters
        ----------
        box   : four [x, y] points in preprocessed-image coordinates
        orig_w / orig_h : original image dimensions
        proc_w / proc_h : preprocessed image dimensions
        """
        sx = orig_w / proc_w if proc_w else 1.0
        sy = orig_h / proc_h if proc_h else 1.0
        return [[int(pt[0] * sx), int(pt[1] * sy)] for pt in box]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_image(
        self,
        image: Image.Image,
        image_id: str,
        prep_config: Optional[PreprocessingConfig] = None,
    ) -> OCRImageResult:
        """
        Run preprocessing + PaddleOCR on a PIL image.

        Returns
        -------
        OCRImageResult with all detections (confidence-filtered detections are
        still included but flagged with below_threshold=True).
        """
        orig_w, orig_h = image.size
        t0 = time.perf_counter()

        # 1. Preprocessing ---------------------------------------------------
        try:
            processed, prep_info = preprocess(image, prep_config)
        except Exception as exc:
            logger.exception("Preprocessing failed for image_id=%s", image_id)
            return OCRImageResult(
                image_id=image_id,
                width=orig_w,
                height=orig_h,
                processing_time_ms=0,
                detections=[],
                error=f"Preprocessing error: {exc}",
            )

        proc_w, proc_h = processed.size
        prep_steps: List[str] = prep_info.get("steps", [])

        # 2. PaddleOCR -------------------------------------------------------
        try:
            ocr = self._get_ocr()
            # PaddleOCR accepts a numpy array
            import numpy as np  # noqa: PLC0415
            import cv2           # noqa: PLC0415
            np_img = cv2.cvtColor(np.array(processed), cv2.COLOR_RGB2BGR)
            raw_results = ocr.ocr(np_img, cls=self._config.use_angle_cls)
        except RuntimeError:
            raise
        except Exception as exc:
            logger.exception("PaddleOCR failed for image_id=%s", image_id)
            elapsed = int((time.perf_counter() - t0) * 1000)
            return OCRImageResult(
                image_id=image_id,
                width=orig_w,
                height=orig_h,
                processing_time_ms=elapsed,
                detections=[],
                preprocessing_steps=prep_steps,
                error=f"OCR engine error: {exc}",
            )

        # 3. Normalise results -----------------------------------------------
        detections: List[OCRDetection] = []

        # PaddleOCR returns a list of pages; we always send one image.
        page = raw_results[0] if raw_results else []
        if page is None:
            page = []

        for line in page:
            # Each line: [ [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, conf) ]
            try:
                box_raw, (text, conf) = line
            except (TypeError, ValueError):
                logger.warning("Unexpected OCR line format: %s", line)
                continue

            raw_text = text  # preserve original output
            conf_f = float(conf)

            scaled_box = self._scale_box(box_raw, orig_w, orig_h, proc_w, proc_h)

            detections.append(
                OCRDetection(
                    text=text,
                    raw_text=raw_text,
                    confidence=conf_f,
                    bounding_box=scaled_box,
                    below_threshold=conf_f < self._config.confidence_threshold,
                )
            )

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "image_id=%s  %d detection(s)  %dms",
            image_id,
            len(detections),
            elapsed_ms,
        )

        return OCRImageResult(
            image_id=image_id,
            width=orig_w,
            height=orig_h,
            processing_time_ms=elapsed_ms,
            detections=detections,
            preprocessing_steps=prep_steps,
        )


# Module-level singleton used by the Flask service
paddle_engine = PaddleOCREngine()
