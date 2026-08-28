#!/usr/bin/env node
/**
 * tests/testOCR.js
 * -----------------
 * CLI test runner:  npm run test:ocr
 *
 * 1. Finds images inside test-images/
 * 2. POSTs them to the OCR API (Node.js layer)
 * 3. Prints structured results with detection counts, times, confidence scores
 *
 * The Node.js API must be running: npm start
 * The Python service must be running: npm run start:ocr
 */

"use strict";

require("dotenv").config({ path: __dirname + "/../.env" });

const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const http = require("http");
const https = require("https");

const BASE_URL = process.env.NODE_API_URL || `http://localhost:${process.env.PORT || 3000}`;
const IMAGE_DIR = path.join(__dirname, "../test-images");
const ALLOWED = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const headers = form.getHeaders();
    
    // Use getLength for form-data v4 compatibility
    form.getLength((err, length) => {
      if (err) {
        // Fallback: send without content-length
        headers["transfer-encoding"] = "chunked";
      } else {
        headers["content-length"] = length;
      }

      const urlObj = new URL(url);
      const req = lib.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (url.startsWith("https") ? 443 : 80),
        path: urlObj.pathname,
        method: "POST",
        headers,
      }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error("Non-JSON response: " + body.slice(0, 200))); }
        });
      });
      req.on("error", reject);
      form.pipe(req);
    });
  });
}

function confBar(conf) {
  const filled = Math.round(conf * 20);
  return "[" + "?".repeat(filled) + "?".repeat(20 - filled) + "]";
}

function printResult(r) {
  const status = r.error ? "?  ERROR" : "? OK";
  console.log(`\n  Image : ${r.imageId}`);
  console.log(`  Status: ${status}`);
  if (r.error) {
    console.log(`  Error : ${r.error}`);
    return;
  }
  console.log(`  Size  : ${r.width}?${r.height}px`);
  console.log(`  Time  : ${r.processingTimeMs}ms`);
  console.log(`  Steps : ${(r.preprocessingSteps || []).join(", ") || "none"}`);
  console.log(`  Found : ${r.detections.length} detection(s)`);

  if (r.detections.length === 0) {
    console.log("  (no text detected)");
    return;
  }

  console.log("\n  Detections:");
  console.log("  " + "?".repeat(72));
  r.detections.forEach((d, i) => {
    const pct = (d.confidence * 100).toFixed(1).padStart(5);
    const flag = d.belowThreshold ? " ?LOW" : "";
    console.log(`  ${String(i + 1).padStart(3)}. ${confBar(d.confidence)} ${pct}%${flag}`);
    console.log(`       Text: "${d.text}"`);
    if (d.rawText !== d.text) console.log(`       Raw : "${d.rawText}"`);
    const bb = d.boundingBox;
    if (bb?.length === 4) {
      console.log(`       Box : TL(${bb[0][0]},${bb[0][1]}) TR(${bb[1][0]},${bb[1][1]}) BR(${bb[2][0]},${bb[2][1]}) BL(${bb[3][0]},${bb[3][1]})`);
    }
  });
  console.log("  " + "?".repeat(72));
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  console.log("????????????????????????????????????????????????????????");
  console.log("?          OCR Module ? CLI Test Runner                ?");
  console.log("????????????????????????????????????????????????????????");
  console.log(`\nAPI   : ${BASE_URL}/api/ocr`);
  console.log(`Images: ${IMAGE_DIR}\n`);

  // Find images
  let imageFiles = [];
  try {
    imageFiles = fs.readdirSync(IMAGE_DIR)
      .filter(f => ALLOWED.has(path.extname(f).toLowerCase()))
      .map(f => path.join(IMAGE_DIR, f));
  } catch (_) {
    console.error(`ERROR: Cannot read test-images/ directory at ${IMAGE_DIR}`);
    console.error("Place your package photographs in that folder and retry.");
    process.exit(1);
  }

  if (imageFiles.length === 0) {
    console.log("No images found in test-images/");
    console.log("Add JPG, PNG, or WEBP photographs of packaged commodities and re-run.");
    console.log("\nExample:");
    console.log("  copy C:\\path\\to\\your\\photo.jpg test-images\\");
    process.exit(0);
  }

  console.log(`Found ${imageFiles.length} image(s):  ${imageFiles.map(f => path.basename(f)).join(", ")}\n`);

  // Build form
  const form = new FormData();
  for (const fp of imageFiles) {
    form.append("images", fs.createReadStream(fp), path.basename(fp));
  }

  // Submit
  const t0 = Date.now();
  let data;
  try {
    data = await postForm(`${BASE_URL}/api/ocr`, form);
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      console.error(`\nERROR: Cannot connect to ${BASE_URL}`);
      console.error("Make sure the Node.js API is running: npm start");
      console.error("Make sure the Python service is running: npm run start:ocr");
    } else {
      console.error("\nERROR:", err.message);
    }
    process.exit(1);
  }

  const totalMs = Date.now() - t0;

  if (!data.success) {
    console.error("OCR failed:", data.error);
    process.exit(1);
  }

  // Print results
  console.log("?".repeat(74));
  data.results.forEach(printResult);
  console.log("\n" + "?".repeat(74));

  // Summary
  const total = data.results.reduce((s, r) => s + (r.detections?.length || 0), 0);
  const avgTime = Math.round(
    data.results.reduce((s, r) => s + (r.processingTimeMs || 0), 0) / data.results.length
  );
  const allConfs = data.results.flatMap(r => r.detections.map(d => d.confidence));
  const avgConf = allConfs.length
    ? ((allConfs.reduce((a, b) => a + b, 0) / allConfs.length) * 100).toFixed(1)
    : "N/A";

  console.log("\n?? Summary");
  console.log(`   Images processed : ${data.results.length}`);
  console.log(`   Total detections : ${total}`);
  console.log(`   Avg time /image  : ${avgTime}ms`);
  console.log(`   Avg confidence   : ${avgConf}%`);
  console.log(`   Wall-clock total : ${totalMs}ms`);
  console.log("\n? Test complete");
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});