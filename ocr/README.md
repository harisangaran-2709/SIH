# Legal Metrology Compliance Engine

A two-tier microservice that ingests photographs of Indian packaged commodities,
extracts the legal declarations printed on them, and evaluates them against the
**Legal Metrology (Packaged Commodities) Rules, 2011**.

- **Python service (port 8000)** — image preprocessing + PaddleOCR text detection
- **Node.js service (port 3000)** — field extraction, product/package classification,
  rule evaluation, evidence generation, and a browser-based testing UI

The OCR layer is intentionally raw: every detected text region is returned with
its bounding box and confidence score. The compliance engine consumes that JSON
and produces a structured inspection report.

---

## Pipeline

```
📷 Smartphone photos (front.jpg, back.jpg, side.jpg …)
          │
   Image Preprocessing  (EXIF orientation, resize, CLAHE, sharpen)
          │
       PaddleOCR
          │
   Raw Text Detections  (text + boundingBox + confidence)
          │
   Field Extraction  (number classification into 11 types,
                      spatial proximity, date normalization)
          │
   Product Classification  (food / fish_oil / cosmetic / pharma / …)
   Package Classification  (retail / wholesale / export / industrial / …)
          │
   Applicability  (Rule 3 — >25kg/litre, industrial / institutional)
   Exemption      (Rule 26 — <10g/ml small package exemption)
          │
   Rule Engine  (Phase 1 declarations → Phase 2 schedules
                 → Phase 3 physical → Phase 4 enforcement)
          │
   Evidence  (tight-cropped canvas patches per finding)
          │
   Summary + Final Status
          │
   HTML Report  (testing page UI)
```

The four statuses returned by the engine are:

| Status | Meaning |
|--------|---------|
| `COMPLIANT` | All applicable declarations detected, no rules failed |
| `POTENTIAL_NON_COMPLIANCE` | At least one rule produced a `FAIL` outcome (a declaration that *was* detected violates a rule) |
| `REVIEW` | One or more declarations are `NOT_DETECTED`, `NOT_VISIBLE`, `AMBIGUOUS`, or `LOW_CONFIDENCE` — physical rules (Phase 3) and enforcement rules (Phase 4) always return REVIEW because they require inspector verification |
| `NOT_APPLICABLE` | Chapter II of the Rules does not apply (e.g. >25kg/litre package, industrial / institutional package) |

`POTENTIAL_NON_COMPLIANCE` is never auto-emitted without a human inspector. A
missing declaration is a **REVIEW** outcome, not a `FAIL` — the system tells
the inspector "we could not see this; please verify" rather than "this is
illegal." Only a declaration that was actually detected and then judged to
violate a rule produces a `FAIL`.

---

## Architecture

```
Browser  ──POST /api/compliance/analyze──▶  Node.js Express (3000)
                                              │
                                              │  multipart / JSON
                                              ▼
                                        Field extraction
                                        Product / package classification
                                        Applicability / exemption
                                        Rule engine
                                        Evidence generator
                                              │
                                              │  HTTP POST /ocr
                                              ▼
                                        Python Flask (8000)
                                              │
                                              ▼
                                        PaddleOCR
```

| Path | Description |
|------|-------------|
| `server.js` | Node.js entry point, mounts static UI + API |
| `api/ocrRoutes.js` | Express routes for `/api/ocr` |
| `api/complianceRoutes.js` | Express routes for `/api/compliance` |
| `api/ocrProvider.js` | OCRProvider interface + PaddleOCRProvider |
| `schemas/ocrSchema.js` | Zod validation schemas |
| `compliance/fieldExtractor.js` | Number classification (11 types) + spatial proximity field extraction |
| `compliance/productClassifier.js` | Product + package type classification |
| `compliance/complianceManager.js` | Orchestrator (pipeline order, applicability, exemption, summary, final status) |
| `compliance/ruleEngine.js` | Phase 1–4 rule evaluation + grouped physical/enforcement checks |
| `compliance/evidenceGenerator.js` | Canvas-based evidence crop generation |
| `rules/ruleDatabase.js` | Single source of truth for all 30+ rule definitions |
| `public/index.html` | Browser testing UI: upload, OCR, fields, findings, evidence crops, rule cards, summary |
| `service/app.py` | Flask OCR microservice |
| `service/detection/engine.py` | PaddleOCREngine class |
| `service/preprocessing/pipeline.py` | Image preprocessing pipeline |
| `service/models/config.py` | Configuration (reads env vars) |
| `test/compliance.test.js` | End-to-end compliance engine tests (6 scenarios) |

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
pip install flask==3.1.0 flask-cors==5.0.0 opencv-python-headless==4.12.0.88 \
            Pillow==11.0.0 numpy==2.1.2 python-dotenv==1.0.1
```

Or install all at once from `service/requirements.txt`:

```bash
pip install -r service/requirements.txt
```

> **Note on PaddlePaddle and Python 3.12:**
> paddlepaddle 2.6.2 does not publish a Windows wheel for Python 3.12 on PyPI.
> If `pip install paddlepaddle==2.6.2` fails, try `pip install paddlepaddle==2.6.1`
> or install the official preview wheel from https://www.paddlepaddle.org.cn/install/quick
> and update `service/requirements.txt` to match.

### 2 – Node.js dependencies

```bash
cd ocr
npm install
```

### 3 – Environment

```bash
cp .env.example .env   # if you have an example file; defaults are fine
```

The default `.env` is shipped with sensible defaults. Override only if you need
a non-standard port or remote OCR service.

---

## Running the system

Open **two terminals** in the project root:

```bash
# Terminal 1 — Python OCR service
python -m service.app
# or:  npm run start:ocr

# Terminal 2 — Node.js API + testing page
npm start
```

Open `http://localhost:3000` in a browser. The testing page lets you:

- Drop in one or more images (e.g. `test-images/front.jpg`, `test-images/back.jpg`)
- Run OCR on the Python service
- See the detected text rendered on the canvas with bounding boxes
- Submit detections to the compliance engine
- See the structured compliance report:
  - **Image Coverage** — which package surfaces were photographed (FRONT, BACK, …) and a warning if only one surface was captured
  - **Extracted Fields** — every field the engine found (product name, net quantity, MRP, manufacturer, dates, consumer care, batch number) with status and confidence
  - **Findings** — one card per rule that fired, with a tight evidence crop and a **WHY THIS RESULT?** panel explaining what was detected, what was expected, and what action to take
  - **Grouped Rules** — physical inspection and enforcement rules collapsed into single cards (each card contains every Phase 3/4 rule that applies)
  - **Rule Results by Phase** — Phase 1 (declarations), Phase 2 (schedules), Phase 3 (physical), Phase 4 (enforcement)
  - **Summary** — counts of COMPLIANT / POTENTIAL_NON_COMPLIANCE / REVIEW / NOT_APPLICABLE rules plus the final status

---

## API

### POST `/api/compliance/analyze`

Submit raw OCR results (typically obtained from `/api/ocr`) and receive a
structured compliance analysis.

**Request** – `application/json`

```json
{
  "results": [
    {
      "imageId": "front.jpg",
      "width": 1920,
      "height": 1080,
      "detections": [
        { "text": "Toor Dal", "confidence": 0.97, "boundingBox": [[100,120],[400,120],[400,170],[100,170]] }
      ]
    }
  ]
}
```

**Response** – top-level fields:

| Field | Description |
|-------|-------------|
| `success` | `true` if analysis completed |
| `product` | `{ category, subcategory, isFood, isFoodSupplement, isPharmaceutical, confidence, status, reason }` |
| `packageType` | `{ type, confidence }` — retail / wholesale / export / industrial / institutional / imported |
| `imageCoverage` | `{ surfaces, multiSurface, warning }` — surface inference per `imageId` |
| `applicability` | `{ chapterTwoApplies, reason, ruleId }` — Rule 3 |
| `exemption` | `{ isExempt, exemptionType, reason, ruleId }` — Rule 26 |
| `declarations` | Per-field `{ detected, value, confidence, status, ruleId, reason }` |
| `visualChecks` | Phase 2 schedule rules |
| `ruleResults` | All evaluated rules with `status: PASS \| FAIL \| REVIEW \| NOT_APPLICABLE` |
| `groupedRules` | Physical + enforcement rules grouped into single cards |
| `findings` | One entry per rule that produced `REVIEW` or `FAIL`, with `boundingBox`, `sourceDetectionIds`, `imageId`, `inspectionTime`, `inspectorStatus`, and a `whyResult` panel |
| `evidence` | Generated evidence package: `crops[]` (data URIs) per finding |
| `summary` | `{ compliant, nonCompliant, review, notApplicable }` |
| `finalStatus` | `COMPLIANT \| POTENTIAL_NON_COMPLIANCE \| REVIEW \| NOT_APPLICABLE` |

### POST `/api/ocr`

Multipart upload of one or more images. Forwards to the Python service and
returns the raw OCR JSON consumed by the compliance endpoint.

### GET `/api/ocr/health` and `/api/compliance/health`

Liveness probes for both services.

---

## Field extraction model

The field extractor is the bridge between raw OCR text and the rule engine.
It implements:

- **Number classification** — every numeric string is classified into one of
  11 types: `QUANTITY`, `PRICE`, `DATE`, `PHONE`, `PINCODE`, `LICENCE_NUMBER`,
  `REGISTRATION_NUMBER`, `BATCH_NUMBER`, `BARCODE`, `DIMENSION`, `UNKNOWN`.
  This prevents a barcode, licence number, or PIN code from being misread
  as a net quantity.
- **Spatial proximity** — labels (`MFG`, `MRP`, `Customer Care`, `Batch No`)
  are paired with the nearest matching value detection using a spatial
  index. Adjacency beats text-only matching.
- **Date normalization** — `NOV. 2025`, `15/03/2025`, `08/2026` are all
  normalized to ISO-style month/year or full date strings.
- **MRP NOT_VISIBLE** — when a single-surface photo does not contain an MRP,
  the field is reported as `NOT_VISIBLE` (not `MISSING`) with a recommended
  action: "Photograph all sides of the package. If MRP is absent from all
  sides, it is a violation." The status maps to `REVIEW`, never `FAIL`.
- **Traceability** — every extracted field carries `sourceDetectionIds` and
  a `boundingBox` so the UI can show *which* OCR detection(s) were used.

The output is a structured `fields` object passed to the product classifier,
the package classifier, and the rule engine.

---

## Pipeline order matters

The compliance manager runs in this order on purpose:

1. **Field extraction** — turn raw OCR into structured fields with confidence
2. **Product classification** — food / fish_oil / pharma / etc.
3. **Package classification** — retail / wholesale / industrial / etc.
4. **Applicability (Rule 3)** — is Chapter II even in scope?
5. **Exemption (Rule 26)** — does the small-package exemption apply?
6. **Rule engine (Phase 1 → 2 → 3 → 4)** — only run if applicable and not exempt
7. **Summary + final status** — COMPLIANT / REVIEW / POTENTIAL_NON_COMPLIANCE / NOT_APPLICABLE
8. **Evidence generation** — needs the full status + findings to produce crops

If you check declarations *before* applicability, a 30 kg cement bag would be
falsely flagged for missing retail declarations even though Chapter II excludes
it. The order in `complianceManager.js` is the contract.

---

## Status semantics

| Evidence status | Rule status | Meaning |
|-----------------|-------------|---------|
| `DETECTED`      | `PASS` or `FAIL` | Field was found; the rule was evaluated against it. `FAIL` only when a *detected* value violates a rule. |
| `NOT_DETECTED`  | `REVIEW` | Field was searched for on the photographed surface and not found. Inspector should verify. |
| `NOT_VISIBLE`   | `REVIEW` | Field was not on the photographed surface, but the surface doesn't cover the whole package. Inspector should photograph the missing side. |
| `AMBIGUOUS`     | `REVIEW` | Multiple candidates, no clear winner. Inspector must pick. |
| `LOW_CONFIDENCE`| `REVIEW` | OCR confidence is below the trust threshold. Inspector must verify. |

Phase 3 (physical) and Phase 4 (enforcement) rules are always `REVIEW` because
they require a calibrated reference, a weighing scale, or a human decision.

`POTENTIAL_NON_COMPLIANCE` is only emitted when at least one rule produced
`FAIL`. A missing declaration can never produce a `FAIL` on its own.

---

## Testing

The compliance engine has an end-to-end test suite that uses mocked OCR
detections (no Python service required):

```bash
node test/compliance.test.js
```

Expected output:

```
╔════════════════════════════════════════════════════════╗
║   Legal Metrology Compliance Engine - Test Suite     ║
╚════════════════════════════════════════════════════════╝

Test 1: Complete package with all declarations          ✓ PASSED
Test 2: Package with missing declarations               ✓ PASSED
Test 3: Exempt package (< 10g)                           ✓ PASSED
Test 4: Large package (> 25kg - not applicable)          ✓ PASSED
Test 5: Field extraction traceability                    ✓ PASSED
Test 6: Product classification                           ✓ PASSED

╔════════════════════════════════════════════════════════╗
║   Test Results: 6 passed, 0 failed                       ║
╚════════════════════════════════════════════════════════╝
```

The Python OCR service has its own test:

```bash
python tests/test_engine.py
```

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

## Troubleshooting

### `pip install paddlepaddle` fails on Python 3.12 / Windows

paddlepaddle 2.6.2 may not have a wheel for Python 3.12 on Windows via PyPI.
Options:
1. Use Python 3.11: `py -3.11 -m pip install paddlepaddle==2.6.2`
2. Install from the official wheel: https://www.paddlepaddle.org.cn/install/quick
3. Use paddlepaddle 3.0.0b (beta) which supports Python 3.12

### `PaddleOCR is not installed` error at runtime

The Python service started, but paddleocr/paddlepaddle was not found by the
Python executable used. Confirm with `python -m pip list | grep paddle`.

### OCR returns 0 detections on a real image

- Check confidence threshold: lower `OCR_CONFIDENCE_THRESHOLD` to 0.10 and try again
- Verify the image is not corrupted: open it in an image viewer
- The language setting may not match the text: `OCR_LANG=en` only works for Latin text

### Compliance report shows only REVIEW for everything

That is **expected** on a single-surface photo. The system cannot confirm
declarations it could not see. Photograph every side of the package and re-run
to convert REVIEW outcomes into COMPLIANT or POTENTIAL_NON_COMPLIANCE.

### `[object Object]` in the UI

If you see literal `[object Object]` in the testing page, an evidence crop
or field value is missing. Check the browser console for stack traces. The
HTML uses a hardened `escHtml` that maps unprintable objects to `—`.

---

## Limitations

1. **GPU not used by default**: CPU inference is ~3–10x slower but requires no CUDA setup.
2. **First run is slow**: PaddleOCR downloads ~100 MB of models on first use.
3. **Hindi/Tamil/other Indian scripts**: Not yet configured.
4. **No camera calibration**: Phase 3 rules (font height, weight) require a
   calibrated reference in the image. Without it they always return `REVIEW`.
5. **Single-surface photos**: Multi-surface checks (front + back) are not
   possible from one image. The UI surfaces this as a warning.
6. **No barcode/QR code scanning**: 2D codes are not decoded; only the human-
   readable text near them is parsed.

---

## License & legal

The rules database encodes the **Legal Metrology (Packaged Commodities) Rules,
2011** as published by the Government of India. This project does not provide
legal advice; the system is an inspection *aid* and every `POTENTIAL_NON_COMPLIANCE`
verdict must be reviewed by a qualified Legal Metrology Inspector before any
enforcement action is taken.
