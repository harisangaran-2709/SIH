/**
 * server.js
 * ---------
 * Entry point for the Node.js OCR API.
 *
 * Routes
 * ------
 *   POST /api/ocr         – OCR endpoint (see api/ocrRoutes.js)
 *   GET  /api/ocr/health  – Health check (both Node + Python service)
 *   GET  /                – OCR testing/debugging page (public/index.html)
 */

"use strict";

require("dotenv").config({ path: __dirname + "/.env" });

const path = require("path");
const express = require("express");

const ocrRoutes = require("./api/ocrRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the static testing page
app.use(express.static(path.join(__dirname, "public")));

// JSON body parser for non-multipart requests
app.use(express.json());

// OCR API
app.use("/api/ocr", ocrRoutes);

// Catch-all 404
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   OCR Module – Node.js API                          ║
╠══════════════════════════════════════════════════════╣
║   Testing page : http://localhost:${PORT}/              ║
║   OCR endpoint : POST http://localhost:${PORT}/api/ocr   ║
║   Health check : GET  http://localhost:${PORT}/api/ocr/health ║
╠══════════════════════════════════════════════════════╣
║   Python OCR service URL : ${process.env.OCR_SERVICE_URL || "http://localhost:8000"}      ║
║   Start it with: npm run start:ocr                  ║
╚══════════════════════════════════════════════════════╝
`);
});
