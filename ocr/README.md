# OCR Module – Package Text Detection

Performs OCR on photographs of Indian packaged commodities.
**This is a standalone OCR component only.** It does not do field extraction,
compliance checking, or AI interpretation.

---

## What this module does

```
📷 Packaged Commodity Image
          |
   Image Preprocessing
   (EXIF orientation, resize, CLAHE, sharpen)
          |
       PaddleOCR
          |
   Raw Text Detection
          |
   Bounding Boxes + Confidence Scores
          |
       JSON Response
```

The module:
- Preprocesses real-world smartphone photographs
- Runs PaddleOCR on each image
- Returns **every** detected text region with its bounding box and confidence score
- Does **not** interpret, label, or filter the OCR output

---

## Architecture

```
Browser / API client
        |  multipart/form-data (images[])
        |
Node.js Express API (port 3000)
  api/ocrRoutes.js
  api/ocrProvider.js
        |  HTTP POST /ocr
        |
Python Flask service (port 8000)
  service/app.py
  service/preprocessing/pipeline.py
        |
    PaddleOCR
        |
  JSON response
```

Files:

| Path | Description |
|------|-------------|
| `server.js` | Node.js entry point |
| `api/ocrRoutes.js` | Express routes for `/api/ocr` |
| `api/ocrProvider.js` | OCRProvider interface + PaddleOCRProvider |
| `schemas/ocrSchema.js` | Zod validation schemas |
| `public/index.html` | OCR testing/debugging page |
| `service/app.py` | Flask OCR microservice |
| `service/detection/engine.py` | PaddleOCREngine class |
| `service/preprocessing/pipeline.py` | Image preprocessing pipeline |
| `service/models/config.py` | Configuration (reads env vars) |
| `service/requirements.txt` | Python dependencies |
| `tests/testOCR.js` | CLI test runner |
| `test-images/` | Place your package images here |

---

## Requirements

| Dependency | Version |
|------------|---------|
| Python     | 3.9+   (tested: 3.12) |
| Node.js    | 18+    (tested: 24) |
| PaddlePaddle (CPU) | 2.6.2 |
| PaddleOCR          | 2.9.1 |

---

## Installation

### 1 – Python dependencies

```bash
pip install paddlepaddle==2.6.2 paddleocr==2.9.1
pip install flask==3.1.0 flask-cors==5.0.0 opencv-python-headless==4.12.0.88 Pillow==11.0.0 numpy==2.1.2 python-dotenv==1.0.1
```

Or install all at once from requirements.txt:

```bash
pip install -r ocr/service/requirements.txt
```

> **Note on PaddlePaddle and Python 3.12:**
> paddlepaddle 2.6.2 does not publish a Windows wheel for Python 3.12 on PyPI.
> If `pip install paddlepaddle==2.6.2` fails, try:
> ```bash
> pip install paddlepaddle==2.6.1
> ```
> or install the official preview wheel from https://www.paddlepaddle.org.cn/install/quick
> and update requirements.txt to match.

### 2 – Node.js dependencies

```bash
cd ocr
npm install
```

### 3 – Environment

```bash
cp .env.example .env
# Edit .env if needed (defaults are fine for local development)
```

---

## PaddleOCR Setup

PaddleOCR downloads its detection and recognition models on **first use**.
Models are cached in `~/.paddleocr/` (Linux/Mac) or `%USERPROFILE%\.paddleocr\` (Windows).

Default model set for `lang=en`:
- Detection model : `en_PP-OCRv3_det`
- Recognition model : `en_PP-OCRv4_rec`
- Angle classifier : `ch_ppocr_mobile_v2.0_cls`

No manual download is needed; the first OCR call triggers the download automatically.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Node.js API port |
| `OCR_SERVICE_URL` | `http://localhost:8000` | Python service URL (used by Node.js) |
| `OCR_PORT` | `8000` | Python service port |
| `OCR_LANG` | `en` | PaddleOCR language code |
| `OCR_CONFIDENCE_THRESHOLD` | `0.30` | Detections below this are flagged (still returned) |
| `OCR_MAX_IMAGE_SIZE_MB` | `10` | Max upload size in MB |
| `OCR_DET_LIMIT_SIDE_LEN` | `960` | PaddleOCR internal detector pixel limit |
| `OCR_USE_ANGLE_CLS` | `1` | `1` = use angle classifier (better on rotated text) |
| `OCR_USE_GPU` | `0` | `1` = GPU mode (requires paddlepaddle-gpu) |
| `OCR_TIMEOUT_SECONDS` | `60` | Per-image timeout |

---

## Running the OCR service

```bash
# Terminal 1 – Python OCR service
cd ocr
python -m service.app
# or: npm run start:ocr
```

The service starts at `http://localhost:8000`.

---

## Running the API

```bash
# Terminal 2 – Node.js API + testing page
cd ocr
npm start
```

Open `http://localhost:3000` in a browser for the testing page.

---

## Testing OCR

Place real package photos in `test-images/`:

```
test-images/
  front.jpg
  back.jpg
  side.jpg
```

Then run (with both services already started):

```bash
npm run test:ocr
```

Output includes:
- Detected text for each image
- Bounding box coordinates (pixel, original-image space)
- Confidence scores
- Processing time
- Summary statistics

---

## API

### POST /api/ocr

OCR one or more images.

**Request** – `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `images` | file | Image file. Repeat for multiple images. |

Supported types: `jpg`, `jpeg`, `png`, `webp`  
Max size: 10 MB per file (configurable via `OCR_MAX_IMAGE_SIZE_MB`)

**Response**

```json
{
  "success": true,
  "results": [
    {
      "imageId": "front.jpg",
      "width": 1920,
      "height": 1080,
      "processingTimeMs": 842,
      "preprocessingSteps": ["exif_orientation", "resize", "clahe", "sharpen"],
      "detections": [
        {
          "text": "Toor Dal",
          "rawText": "Toor Dal",
          "confidence": 0.97,
          "boundingBox": [
            [100, 120],
            [400, 120],
            [400, 170],
            [100, 170]
          ],
          "belowThreshold": false
        },
        {
          "text": "MRP \u20b9160.00",
          "rawText": "MRP \u20b9160.00",
          "confidence": 0.96,
          "boundingBox": [
            [100, 300],
            [400, 300],
            [400, 350],
            [100, 350]
          ],
          "belowThreshold": false
        }
      ]
    }
  ]
}
```

### GET /api/ocr/health

```json
{
  "nodeApi": "ok",
  "pythonService": "ok",
  "detail": "{\"status\": \"ok\", \"lang\": \"en\"}",
  "serviceUrl": "http://localhost:8000"
}
```

---

## Bounding Boxes

Each detection includes 4 corner points:

```
  boundingBox[0] = top-left
  boundingBox[1] = top-right
  boundingBox[2] = bottom-right
  boundingBox[3] = bottom-left

  Coordinate origin : top-left corner of the image
  X direction       : left → right
  Y direction       : top → bottom
  Unit              : pixels
  Reference image   : original uploaded image (before preprocessing)
```

The preprocessing pipeline may resize the image internally.
The engine scales all bounding boxes back to original-image space before returning,
so boxes can be drawn directly onto the original image in the browser.

---

## Confidence Scores

`confidence` is a float in `[0.0, 1.0]`.

| Range | Meaning |
|-------|---------|
| 0.90 – 1.00 | Very high confidence |
| 0.70 – 0.89 | High confidence |
| 0.50 – 0.69 | Medium confidence – review visually |
| 0.30 – 0.49 | Low confidence – treat with caution |
| 0.00 – 0.29 | Below threshold (flagged with `belowThreshold: true`) |

The confidence threshold is configurable (`OCR_CONFIDENCE_THRESHOLD`).
Detections below the threshold are **still returned** – the downstream AI module
needs to be aware of OCR uncertainty.

---

## Supported Languages

The current configuration supports **English (`en`)** only.

PaddleOCR supports additional languages. To add a language:

1. Change `OCR_LANG` in `.env` to the desired code (e.g. `hi`, `ta`).
2. Verify the PaddleOCR model exists for that language at:
   https://github.com/PaddlePaddle/PaddleOCR/blob/main/doc/doc_en/models_list_en.md
3. On first run the model will be downloaded automatically.

Indian-language models available (verify currency with the PaddleOCR repo):
| Language | Code |
|----------|------|
| Hindi    | `hi` |
| Tamil    | (check repo) |
| Telugu   | (check repo) |
| Kannada  | (check repo) |

> Do not enable a language code unless you have verified that PaddleOCR ships a
> model for it. Using an unsupported code will cause a model download failure.

---

## Image Preprocessing Pipeline

Applied in this order (each step is independently configurable):

1. **EXIF orientation** – corrects rotation from smartphone photos
2. **Resize** – upscales if the shorter side is below 1024 px; caps at 4096 px
3. **CLAHE** – adaptive histogram equalisation on the luminance channel (helps text on coloured/low-contrast backgrounds)
4. **Unsharp mask** – mild sharpening to recover detail lost in smartphone JPEG compression
5. **Denoising** – disabled by default (slow; rarely needed for modern phone cameras)

Preprocessing is applied to a copy; bounding boxes returned are in original-image coordinates.

---

## Troubleshooting

### `pip install paddlepaddle` fails on Python 3.12 / Windows

paddlepaddle 2.6.2 may not have a wheel for Python 3.12 on Windows via PyPI.
Options:
1. Use Python 3.11: `py -3.11 -m pip install paddlepaddle==2.6.2`
2. Install from the official wheel: https://www.paddlepaddle.org.cn/install/quick
3. Use paddlepaddle 3.0.0b (beta) which supports Python 3.12

### `PaddleOCR is not installed` error at runtime

The Python service started, but paddleocr/paddlepaddle was not found by the Python
executable used. Confirm with `python -m pip list | grep paddle`.

### Models not downloading / SSL errors

```bash
pip install certifi
python -c "import certifi; print(certifi.where())"
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")
```

### OCR returns 0 detections on a real image

- Check confidence threshold: lower `OCR_CONFIDENCE_THRESHOLD` to 0.10 and try again
- Verify the image is not corrupted: open it in an image viewer
- The language setting may not match the text: `OCR_LANG=en` only works for Latin text

### Python service returns 503 from Node.js

Start the Python service first:
```bash
python -m service.app
```
Confirm health: `curl http://localhost:8000/health`

---

## Limitations

1. **GPU not used by default**: CPU inference is ~3–10x slower but requires no CUDA setup.
2. **First run is slow**: PaddleOCR downloads ~100 MB of models on first use.
3. **Hindi/Tamil/other Indian scripts**: Not yet configured. Adding them requires
   verifying PaddleOCR model availability.
4. **Perspective distortion**: Severe perspective distortion may require a manual
   perspective-correction step before OCR.
5. **Barcode text**: Text printed as part of a barcode design may not be reliably detected.
6. **Tiny text below 8px effective height**: May be missed even after upscaling.

---

## Future Integration

The OCR output is designed to be consumed by a downstream AI module:

```
OCR Module (this)
        |
        |  JSON: text + bounding boxes + confidence
        v
Vision / LLM Field Extraction
        |
        |  Structured package fields:
        |   - product_name, brand, net_quantity, mrp,
        |     manufacturer, packer, manufacture_date,
        |     expiry_date, batch_number, …
        v
Legal Metrology RAG
        |
        |  Applicable rules for the product category
        v
Compliance Validation Engine
        |
        v
Compliance Report
```

The OCR JSON is intentionally raw. The LLM/Vision module will interpret the
detected text regions and map them to legal fields.
