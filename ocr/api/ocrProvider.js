/**
 * api/ocrProvider.js
 * ------------------
 * OCRProvider interface + PaddleOCRProvider implementation.
 *
 * Architecture
 * ------------
 *   Node.js API (Express)
 *        |
 *   OCRProvider  <-- interface/contract
 *        |
 *   PaddleOCRProvider  <-- current implementation
 *        |
 *   Python Flask service (http://localhost:8000)
 *        |
 *   PaddleOCR
 *
 * Adding a new provider later
 * ----------------------------
 * 1. Create a class that extends OCRProvider.
 * 2. Implement processImages(images, options).
 * 3. Register it in server.js.
 *
 * processImages() must resolve with an array of OCRImageResult objects
 * matching the OCRImageResultSchema defined in schemas/ocrSchema.js.
 */

"use strict";

const axios = require("axios");
const FormData = require("form-data");

// ---------------------------------------------------------------------------
// Abstract base (interface contract)
// ---------------------------------------------------------------------------
class OCRProvider {
  /**
   * Process multiple images and return OCR results.
   *
   * @param {Array<{buffer: Buffer, originalname: string}>} images
   * @param {object} options   - provider-specific options
   * @returns {Promise<Array>} - array of OCRImageResult-shaped objects
   */
  async processImages(_images, _options = {}) {  // eslint-disable-line
    throw new Error("OCRProvider.processImages() must be implemented");
  }

  /**
   * Check that the provider is reachable.
   * @returns {Promise<{ok: boolean, detail: string}>}
   */
  async healthCheck() {
    return { ok: false, detail: "not implemented" };
  }
}

// ---------------------------------------------------------------------------
// PaddleOCR via Python Flask service
// ---------------------------------------------------------------------------
class PaddleOCRProvider extends OCRProvider {
  /**
   * @param {string} serviceUrl - base URL of the Python OCR service
   */
  constructor(serviceUrl) {
    super();
    this.serviceUrl = serviceUrl.replace(/\/$/, "");  // strip trailing slash
  }

  async healthCheck() {
    try {
      const res = await axios.get(`${this.serviceUrl}/health`, { timeout: 5000 });
      return { ok: res.data?.status === "ok", detail: JSON.stringify(res.data) };
    } catch (err) {
      return { ok: false, detail: err.message };
    }
  }

  /**
   * Forward images to the Python service and return normalised results.
   *
   * @param {Array<{buffer: Buffer, originalname: string, mimetype: string}>} images
   * @returns {Promise<Array>}
   */
  async processImages(images) {
    const form = new FormData();
    for (const img of images) {
      form.append("images", img.buffer, {
        filename: img.originalname,
        contentType: img.mimetype,
      });
    }

    const response = await axios.post(`${this.serviceUrl}/ocr`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120_000,   // 2 minutes – large images take time on first run (model load)
    });

    return response.data;
  }
}

module.exports = { OCRProvider, PaddleOCRProvider };
