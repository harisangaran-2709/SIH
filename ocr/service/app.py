"""
service/app.py
--------------
Flask OCR microservice.

Endpoints
---------
POST /ocr
    Accepts multipart/form-data with one or more images.
    Field name: images   (repeat the field for multiple images)
    Returns:    JSON OCR response (see schema below)

GET  /health
    Returns {"status": "ok"} – useful for the Node.js layer to check liveness.
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

# Load .env BEFORE importing config so env vars are available at dataclass init.
# Walk up until we find .env (handles running from different cwd).
_here = Path(__file__).resolve().parent
for _p in [_here, _here.parent, _here.parent.parent]:
    _env = _p / ".env"
    if _env.exists():
        load_dotenv(_env)
        break

from service.models.config import ocr_config          # noqa: E402
from service.detection.engine import paddle_engine, OCRImageResult, OCRDetection  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("ocr.app")

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Allowed extensions and size limits
# ---------------------------------------------------------------------------
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_BYTES = int(ocr_config.max_image_size_mb * 1024 * 1024)


def _allowed(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[-1].lower() in ALLOWED_EXTENSIONS


def _to_dict(det: OCRDetection) -> dict:
    return {
        "text": det.text,
        "rawText": det.raw_text,
        "confidence": round(det.confidence, 4),
        "boundingBox": det.bounding_box,
        "belowThreshold": det.below_threshold,
    }


def _result_to_dict(r: OCRImageResult) -> dict:
    d: dict = {
        "imageId": r.image_id,
        "width": r.width,
        "height": r.height,
        "processingTimeMs": r.processing_time_ms,
        "preprocessingSteps": r.preprocessing_steps,
        "detections": [_to_dict(det) for det in r.detections],
    }
    if r.error:
        d["error"] = r.error
    return d


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "lang": ocr_config.lang})


@app.route("/ocr", methods=["POST"])
def ocr_endpoint():
    files = request.files.getlist("images")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"success": False, "error": "No images provided"}), 400

    results: List[dict] = []

    for idx, file in enumerate(files):
        image_id = file.filename or f"image-{idx + 1}"

        # --- validation ---
        if not _allowed(image_id):
            results.append({
                "imageId": image_id,
                "error": f"Unsupported file type.  Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
                "detections": [],
            })
            continue

        raw = file.read()
        if len(raw) > MAX_BYTES:
            results.append({
                "imageId": image_id,
                "error": f"File too large.  Max {ocr_config.max_image_size_mb} MB.",
                "detections": [],
            })
            continue

        # --- open as PIL ---
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception as exc:
            results.append({
                "imageId": image_id,
                "error": f"Cannot open image: {exc}",
                "detections": [],
            })
            continue

        # --- OCR ---
        try:
            result = paddle_engine.process_image(img, image_id)
            results.append(_result_to_dict(result))
        except RuntimeError as exc:
            # PaddleOCR not installed / init failure
            logger.exception("OCR engine runtime error")
            return jsonify({"success": False, "error": str(exc)}), 503
        except Exception as exc:
            logger.exception("Unexpected OCR error")
            results.append({
                "imageId": image_id,
                "error": f"OCR processing error: {exc}",
                "detections": [],
            })

    return jsonify({"success": True, "results": results})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=ocr_config.port, debug=False)
