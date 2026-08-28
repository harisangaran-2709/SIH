/**
 * api/ocrRoutes.js
 * ----------------
 * Express router for POST /api/ocr
 *
 * Accepts multipart/form-data with field name `images` (repeatable).
 * Validates the upload, forwards to the OCR provider, validates the
 * response against the Zod schema, and returns JSON.
 *
 * Error handling
 * --------------
 *   400 – no images / bad file type / file too large
 *   503 – Python OCR service unreachable
 *   500 – unexpected error
 */

"use strict";

const path = require("path");
const express = require("express");
const multer = require("multer");

const { PaddleOCRProvider } = require("./ocrProvider");
const { OCRResponseSchema } = require("../schemas/ocrSchema");

const router = express.Router();

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || "http://localhost:8000";
const MAX_FILE_MB = parseFloat(process.env.OCR_MAX_IMAGE_SIZE_MB || "10");
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

// ---------------------------------------------------------------------------
// Multer (in-memory storage – files forwarded as buffers, no disk write)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIMES.has(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error("Unsupported file type"), { status: 400 }),
        false
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Provider singleton
// ---------------------------------------------------------------------------
const provider = new PaddleOCRProvider(OCR_SERVICE_URL);

// ---------------------------------------------------------------------------
// POST /api/ocr
// ---------------------------------------------------------------------------
router.post(
  "/",
  (req, res, next) => {
    upload.array("images")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
      }
      if (err) {
        return res.status(err.status || 400).json({ success: false, error: err.message });
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: "No images provided (field name: images)" });
    }

    try {
      const raw = await provider.processImages(req.files);

      // Validate with Zod before forwarding to client
      const parsed = OCRResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("[ocrRoutes] Schema validation failed:", parsed.error.format());
        // Pass through anyway – the Python response is still useful
        return res.json(raw);
      }

      return res.json(parsed.data);
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        return res.status(503).json({
          success: false,
          error: `Python OCR service unavailable at ${OCR_SERVICE_URL}.  Is it running?  npm run start:ocr`,
        });
      }
      console.error("[ocrRoutes] Unhandled error:", err.message);
      return res.status(500).json({ success: false, error: `Internal error: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/ocr/health
// ---------------------------------------------------------------------------
router.get("/health", async (_req, res) => {
  const check = await provider.healthCheck();
  return res.status(check.ok ? 200 : 503).json({
    nodeApi: "ok",
    pythonService: check.ok ? "ok" : "unavailable",
    detail: check.detail,
    serviceUrl: OCR_SERVICE_URL,
  });
});

module.exports = router;
