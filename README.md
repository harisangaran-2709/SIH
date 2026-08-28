# SIH - Packaged Commodity Legal Compliance Checker

> **OCR + Legal Metrology compliance engine for Indian packaged commodities**

This repository contains two cooperating modules:

1. **OCR Module** — Detects text + bounding boxes + confidence from smartphone photos via PaddleOCR.
2. **Legal Metrology Compliance Engine** — Consumes OCR output, extracts structured fields, classifies the product and package, then runs a deterministic rule engine (2011-baseline) over four phases to produce a compliance report with full OCR traceability and inspector-reviewable evidence.

OCR is unchanged. The compliance engine sits on top as a non-invasive analysis layer.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [What This System Does](#what-this-system-does)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [API Documentation](#api-documentation)
  - [OCR endpoints](#post-apicr)
  - [Compliance endpoints](#post-apicomplianceanalyze)
- [Compliance Engine](#compliance-engine)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Windows (Easiest Method)

```bash
# 1. Clone the repository
git clone https://github.com/harisangaran-2709/SIH.git
cd SIH/ocr

# 2. Install dependencies
npm install
pip install -r service/requirements.txt

# 3. Run everything
start.bat
```

The testing page will automatically open at `http://localhost:3000`

### Linux / macOS

```bash
# 1. Clone the repository
git clone https://github.com/harisangaran-2709/SIH.git
cd SIH/ocr

# 2. Install dependencies
npm install
pip install -r service/requirements.txt

# 3. Start Python OCR service (Terminal 1)
python -m service.app

# 4. Start Node.js API (Terminal 2 - new terminal)
npm start
```

Then open `http://localhost:3000` in your browser.

---

## 📦 What This System Does

### OCR Module

- ✅ **Detects text** from smartphone photos of packaged commodities
- ✅ **Returns bounding boxes** for each detected text region
- ✅ **Provides confidence scores** for OCR accuracy assessment
- ✅ **Preprocesses images** (EXIF rotation, resize, contrast, sharpening)
- ✅ **Supports multiple images** (front, back, side of package)

### Compliance Engine

- ✅ **Field extraction** from OCR detections (MRP, net quantity, manufacturer, dates, etc.)
- ✅ **Product classification** into 16 categories with food/non-food flag
- ✅ **Package classification** (retail / wholesale / industrial / institutional / imported)
- ✅ **Applicability check** (Rule 3 — >25 kg/l excluded)
- ✅ **Exemption check** (Rule 26 — <10 g/ml exempt)
- ✅ **Deterministic rule engine** — 50+ rules across 4 phases (2011-baseline)
- ✅ **Evidence generation** — every finding is linked to OCR detection IDs + bounding boxes
- ✅ **Inspector review** — Phase 3/4 always REVIEW; never fabricates mm or registry data
- ✅ **Compliance report** — PASS / POTENTIAL_NON_COMPLIANCE / REVIEW with evidence crops

---

## 🔧 Prerequisites

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| Python | 3.9 - 3.12 | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| Git | Latest | https://git-scm.com |

### Verify Installation

```bash
python --version   # Should show 3.9+
node --version     # Should show 18+
npm --version      # Should show 9+
```

---

## 📥 Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/harisangaran-2709/SIH.git
cd SIH/ocr
```

### Step 2: Install Python Dependencies

```bash
pip install -r service/requirements.txt
```

This installs:
- PaddleOCR 2.9.1
- PaddlePaddle 2.6.2
- Flask 3.1.0
- OpenCV, Pillow, NumPy

**Note:** First-time installation downloads ~150MB of dependencies.

### Step 3: Install Node.js Dependencies

```bash
npm install
```

This installs:
- Express
- Multer
- Axios
- Zod
- Form-data

---

## ▶️ Running the Application

### Option 1: Quick Start Script (Windows)

```bash
start.bat
```

This automatically:
1. Starts the Python OCR service
2. Starts the Node.js API
3. Opens the testing page in your browser

### Option 2: Manual Start (All Platforms)

**Terminal 1 - Python OCR Service:**

```bash
cd ocr
python -m service.app
```

Expected output:
```
 * Running on http://0.0.0.0:8000
```

**Terminal 2 - Node.js API:**

```bash
cd ocr
npm start
```

Expected output:
```
╔══════════════════════════════════════════════════════╗
║   OCR Module – Node.js API                          ║
╠══════════════════════════════════════════════════════╣
║   Testing page : http://localhost:3000/              ║
║   OCR endpoint : POST http://localhost:3000/api/ocr  ║
║   Health check : GET  http://localhost:3000/api/ocr/health ║
╚══════════════════════════════════════════════════════╝
```

### Option 3: Using npm Scripts

```bash
# Terminal 1
npm run start:ocr   # Starts Python service

# Terminal 2
npm start           # Starts Node.js API
```

---

## 🧪 Testing

### Web Interface

1. Open `http://localhost:3000` in your browser
2. Upload package images (JPG, PNG, WEBP)
3. Click "Run OCR" — view detections with bounding boxes
4. Click "⚖ Analyze Compliance" — view the compliance report

### OCR CLI Tests

```bash
# Add test images to test-images/
cp /path/to/your/package/photo.jpg ocr/test-images/

# Run OCR tests
npm run test:ocr
```

### Compliance Engine Tests

```bash
node ocr/test/compliance.test.js
```

All 6 tests pass:
- Complete package — all declarations detected
- Missing declarations — findings generated correctly
- Exempt < 10g — exemption applied
- Large > 25kg — Chapter II excluded
- Field extraction — sourceDetectionIds preserved
- Product classification — 16 categories

### API Health Check

```bash
curl http://localhost:3000/api/ocr/health
```

Expected response:
```json
{
  "nodeApi": "ok",
  "pythonService": "ok",
  "detail": "{\"status\": \"ok\", \"lang\": \"en\"}",
  "serviceUrl": "http://localhost:8000"
}
```

---

## 📡 API Documentation

### POST `/api/ocr`

Perform OCR on uploaded images.

**Request:**
```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "images=@front.jpg" \
  -F "images=@back.jpg"
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "imageId": "front.jpg",
      "width": 600,
      "height": 400,
      "processingTimeMs": 1247,
      "preprocessingSteps": ["exif_orientation", "resize", "clahe", "sharpen"],
      "detections": [
        {
          "text": "MRP ₹160.00",
          "rawText": "MRP ₹160.00",
          "confidence": 0.98,
          "boundingBox": [[118,299], [182,299], [182,321], [118,321]],
          "belowThreshold": false
        }
      ]
    }
  ]
}
```

### GET `/api/ocr/health`

Check service health.

**Response:**
```json
{
  "nodeApi": "ok",
  "pythonService": "ok",
  "serviceUrl": "http://localhost:8000"
}
```

### Compliance endpoints

**POST `/api/compliance/analyze`**
Analyze OCR results for legal metrology compliance.

Request body (output from `POST /api/ocr`):
```json
{
  "results": [
    {
      "imageId": "front.jpg",
      "detections": [
        {"text":"Toor Dal","confidence":0.97,"boundingBox":[[100,120],[400,120],[400,170],[100,170]]},
        {"text":"MRP ₹160.00","confidence":0.96,"boundingBox":[[100,300],[400,300],[400,350],[100,350]]}
      ]
    }
  ]
}
```

Response (abridged):
```json
{
  "success": true,
  "product": {"category":"food","isFood":true,"name":"Toor Dal"},
  "packageType": {"type":"retail_package"},
  "applicability": {"chapterTwoApplies":true,"reason":"..."},
  "ruleResults": [...],
  "findings": [...],
  "evidence": {"evidenceId":"EV-...","records":[...],"instructions":{...}},
  "summary": {"pass":3,"fail":0,"review":1,"notApplicable":1},
  "finalStatus": "REVIEW"
}
```

**GET `/api/compliance/health`** — service status.

**GET `/api/compliance/rules?phase=2`** — list rules for a phase.

**GET `/api/compliance/stats`** — counts by phase, categories, calibration-required.

---

## ⚖️ Compliance Engine

The compliance layer is a deterministic pipeline, not an LLM. It does not invent measurements or registry results.

Pipeline:

```
OCR JSON
  → FieldExtractor (regex + bounding-box traceability)
  → ProductClassifier (16 categories)
  → PackageClassifier (retail/wholesale/industrial/institutional/imported/exported)
  → Applicability (Rule 3)
  → Exemption (Rule 26)
  → RuleEngine (Phase 1 → 2 → 3 → 4)
  → EvidenceGenerator (Canvas-crop metadata per finding)
  → Summary + FinalStatus (PASS / POTENTIAL_NON_COMPLIANCE / REVIEW)
```

**Critical safeguards (never violated):**
- OCR failure = `MISSING`, never treated as a legal violation.
- Uncalibrated image = `REVIEW` with reason "Calibration unavailable" — never a fabricated `1.2mm`.
- Phase 3 (MPE / physical measurements) and Phase 4 (enforcement / registry) always emit `REVIEW`; inspector verification required.
- Final status never `CONFIRMED_VIOLATION`; only `PASS`, `POTENTIAL_NON_COMPLIANCE`, or `REVIEW`.
- Every finding carries `ocrDetectionIds`, `boundingBox`, `cropRegion`, `imageId`, `confidence`.

**Phases:**
- Phase 1: Mandatory declarations (Rule 6), font/display (Rule 7), legibility (Rule 9), quantity expression (Rule 12), standard units (Rule 13)
- Phase 2: Manufacturer ≠ packer (Rule 5), Second Schedule (food), Fourth Schedule, Rules 14–17
- Phase 3: Rule 19 (MPE), Rules 21–22, First / Fifth / Sixth / Seventh Schedules — always REVIEW
- Phase 4: Rules 20, 27–30 (enforcement / registry) — always REVIEW

---

## 📁 Project Structure

```
SIH/
├── ocr/
│   ├── service/                  # Python OCR Microservice
│   │   ├── app.py               # Flask entry point
│   │   ├── detection/engine.py  # PaddleOCR engine
│   │   ├── preprocessing/       # Image preprocessing
│   │   ├── models/config.py     # Configuration
│   │   └── requirements.txt
│   │
│   ├── api/                      # Node.js API Layer
│   │   ├── ocrRoutes.js         # POST /api/ocr
│   │   ├── ocrProvider.js       # Provider abstraction
│   │   └── complianceRoutes.js   # POST /api/compliance/*
│   │
│   ├── compliance/               # Legal Metrology compliance engine
│   │   ├── complianceManager.js  # Orchestrator (extract → classify → rules → evidence)
│   │   ├── fieldExtractor.js     # Regex field extraction with bbox traceability
│   │   ├── productClassifier.js  # 16 product categories
│   │   ├── ruleDatabase.js       # 50+ structured rules (Phase 1–4)
│   │   ├── ruleEngine.js         # Deterministic rule execution
│   │   └── evidenceGenerator.js  # Canvas-crop metadata per finding
│   │
│   ├── schemas/
│   │   ├── ocrSchema.js
│   │   └── complianceSchema.js   # Zod validation for compliance responses
│   │
│   ├── rules/
│   │   └── 2011-baseline/        # Structured rule data
│   │       └── rule6-06.json
│   │
│   ├── public/
│   │   └── index.html           # Testing + compliance UI (one page)
│   │
│   ├── test/
│   │   └── compliance.test.js   # 6-test compliance suite
│   │
│   ├── tests/
│   │   ├── testOCR.js           # CLI OCR test runner
│   │   └── test_engine.py       # Python test
│   │
│   ├── test-images/             # Sample package images
│   ├── server.js                # Node.js entry point
│   ├── package.json
│   ├── .env.example
│   ├── start.bat                # Quick start script
│   └── README.md                # Detailed module docs
│
└── README.md                     # This file
```

---

## ⚙️ Configuration

All settings are in `ocr/.env`:

```env
# Node.js API
PORT=3000

# Python OCR Service
OCR_SERVICE_URL=http://localhost:8000
OCR_PORT=8000

# OCR Settings
OCR_LANG=en                        # Language: en (English)
OCR_CONFIDENCE_THRESHOLD=0.30      # Min confidence (0.0 - 1.0)
OCR_MAX_IMAGE_SIZE_MB=10           # Max upload size
OCR_USE_GPU=0                      # 0=CPU, 1=GPU
```

Copy `.env.example` to `.env` and modify as needed.

---

## 🔧 Troubleshooting

### "Python OCR service unavailable"

**Symptom:** Node.js API returns 503 error

**Solution:**
```bash
# Check if Python service is running
curl http://localhost:8000/health

# If not, start it:
cd ocr
python -m service.app
```

### "PaddleOCR is not installed"

**Symptom:** `ImportError: No module named 'paddleocr'`

**Solution:**
```bash
pip install paddleocr==2.9.1 paddlepaddle==2.6.2
```

### PaddlePaddle install fails on Python 3.12

**Solution:**
```bash
# Option 1: Use Python 3.11
py -3.11 -m pip install paddlepaddle==2.6.2

# Option 2: Install from official site
# Visit: https://www.paddlepaddle.org.cn/install/quick
```

### OCR returns 0 detections

**Solutions:**
1. Lower confidence threshold:
   ```env
   OCR_CONFIDENCE_THRESHOLD=0.10
   ```

2. Check image quality (clear, well-lit, text visible)

3. Verify language setting matches text:
   ```env
   OCR_LANG=en  # For English text
   ```

### Port already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use`

**Solution:**

**Windows:**
```bash
# Find process using port 3000
netstat -ano | findstr :3000

# Kill process (replace PID)
taskkill /PID <PID> /F
```

**Linux/macOS:**
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9
```

### Models not downloading

**Symptom:** SSL errors during model download

**Solution:**
```bash
pip install --upgrade certifi
set SSL_CERT_FILE=%USERPROFILE%\AppData\Local\Programs\Python\Python312\Lib\site-packages\certifi\cacert.pem
```

---

## 📚 Additional Documentation

- **OCR Module README:** `ocr/README.md` — Detailed module documentation
- **Implementation Report:** `ocr/IMPLEMENTATION_REPORT.md` — Technical details
- **API Reference:** See [API Documentation](#api-documentation) above

---

## 🛣️ Roadmap

### ✅ Completed
- OCR text detection + bounding boxes + confidence
- Image preprocessing (EXIF, CLAHE, sharpening)
- Field extraction (regex-based, OCR-traceable)
- Product classification (16 categories, food/non-food)
- Package classification (retail/wholesale/industrial/institutional/imported)
- Applicability & exemption checks (Rule 3, Rule 26)
- Deterministic rule engine — Phase 1 (mandatory declarations)
- Deterministic rule engine — Phase 2 (product-aware)
- Deterministic rule engine — Phase 3 (physical inspection, REVIEW-only)
- Deterministic rule engine — Phase 4 (enforcement/registry, REVIEW-only)
- Evidence generation (Canvas-crop metadata per finding)
- Compliance UI in browser
- 6/6 compliance tests

### 🚧 Next Stages
1. **CI/CD** — automated test runner on push
2. **Real-image validation** — test on actual package photos
3. **Camera calibration UI** — physical font measurement workflow
4. **Inspector verification UI** — approve/reject REVIEW findings
5. **Compliance report export** — PDF generation

---

## 🤝 Contributing

This is a Smart India Hackathon 2026 project.

---

## 📄 License

This project was developed for educational purposes as part of SIH 2026.

---

## 👥 Team

- **Repository Owner:** [harisangaran-2709](https://github.com/harisangaran-2709)
- **Development:** Built with Claude Code

---

## 📞 Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review `ocr/README.md` for detailed documentation
3. Open an issue on GitHub

---

**Last Updated:** 2026-08-28
**Compliance Engine Version:** 2011-baseline (Phases 1–4)
