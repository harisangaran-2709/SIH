# SIH - Packaged Commodity Legal Compliance Checker

> **AI-powered OCR system for Indian packaged commodities**

This repository contains the **OCR Module** for an AI-powered legal compliance checker that validates packaged commodity labeling against Indian Legal Metrology rules.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [What This Module Does](#what-this-module-does)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [API Documentation](#api-documentation)
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

## 📦 What This Module Does

This OCR module:

- ✅ **Detects text** from smartphone photos of packaged commodities
- ✅ **Returns bounding boxes** for each detected text region
- ✅ **Provides confidence scores** for OCR accuracy assessment
- ✅ **Preprocesses images** (EXIF rotation, resize, contrast, sharpening)
- ✅ **Supports multiple images** (front, back, side of package)

**What it does NOT do** (by design):

- ❌ Field extraction (e.g., identifying "MRP" vs "Net Quantity")
- ❌ Legal compliance checking
- ❌ AI interpretation of detected text

These features will be added in the next stages of the project.

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
3. Click "Run OCR"
4. View detected text with bounding boxes overlaid on images

### CLI Test Runner

```bash
# Add test images to test-images/ directory
cp /path/to/your/package/photo.jpg ocr/test-images/

# Run the test
npm run test:ocr
```

**Sample output:**
```
Found 2 image(s): front.jpg, back.jpg

Image : front.jpg
Status: ✓ OK
Size  : 600×400px
Time  : 1247ms
Found : 5 detection(s)

Detections:
  1. [████████████████████] 98.0%
     Text: "TOOR DAL"
     Box : TL(178,73) TR(228,73) BR(228,95) BL(178,95)
```

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

---

## 📁 Project Structure

```
SIH/
├── ocr/                          # OCR Module
│   ├── service/                  # Python OCR Microservice
│   │   ├── app.py               # Flask entry point
│   │   ├── detection/
│   │   │   └── engine.py        # PaddleOCR engine
│   │   ├── preprocessing/
│   │   │   └── pipeline.py      # Image preprocessing
│   │   ├── models/
│   │   │   └── config.py        # Configuration
│   │   └── requirements.txt     # Python dependencies
│   │
│   ├── api/                      # Node.js API Layer
│   │   ├── ocrRoutes.js         # Express routes
│   │   └── ocrProvider.js       # Provider abstraction
│   │
│   ├── schemas/
│   │   └── ocrSchema.js         # Zod validation
│   │
│   ├── public/
│   │   └── index.html           # Testing page
│   │
│   ├── tests/
│   │   ├── testOCR.js           # CLI test runner
│   │   └── test_engine.py       # Python test
│   │
│   ├── test-images/             # Sample images
│   │   ├── front.jpg
│   │   └── back.jpg
│   │
│   ├── server.js                # Node.js entry point
│   ├── package.json
│   ├── .env.example
│   ├── start.bat                # Quick start script
│   ├── README.md                # Detailed module docs
│   └── IMPLEMENTATION_REPORT.md # Technical details
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
- OCR text detection
- Bounding box extraction
- Confidence scoring
- Image preprocessing
- Web testing interface
- API layer

### 🚧 Next Stages
1. **AI Field Extraction** — LLM/Vision to interpret detected text
2. **Legal Metrology RAG** — Rule retrieval for product categories
3. **Compliance Engine** — Validation against Indian Legal Metrology rules
4. **User Interface** — Production-ready web application
5. **Deployment** — Cloud hosting and scaling

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
