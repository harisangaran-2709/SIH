/**
 * compliance/fieldExtractor.js
 * -----------------------------
 * Semantic field extractor with number classification.
 *
 * Pipeline:
 *   1. Classify every OCR detection by its numeric/nature type
 *   2. Extract fields using contextual patterns + proximity
 *   3. Normalize values (dates, quantities, prices)
 *   4. Every field retains full traceability: value, normalizedValue,
 *      confidence, sourceDetectionIds, boundingBox, rawText
 *
 * Number classification prevents treating arbitrary numbers
 * (licence, PIN, batch, barcode) as net quantity.
 */

const { v4: uuidv4 } = require('uuid');

// ─── Number Classification ─────────────────────────────────────────────────────

/**
 * Classify a numeric string into its semantic type.
 * Returns { type, confidence, reason }
 *
 * Types: QUANTITY | PRICE | DATE | PHONE | PINCODE | LICENCE_NUMBER |
 *        REGISTRATION_NUMBER | BATCH_NUMBER | BARCODE | DIMENSION | UNKNOWN
 */
function classifyNumericString(text) {
  const trimmed = text.trim();
  const digits = trimmed.replace(/\D/g, '');
  const digitsOnly = digits;

  // ── Phone: any '+' at start is a strong phone signal even for long numbers
  if (trimmed.startsWith('+') && /^[+\d\s()-]{8,20}$/.test(trimmed)) {
    return { type: 'PHONE', confidence: 0.95, reason: 'Phone with country code prefix' };
  }
  if (/^[+]?\d{1,3}[-\s]\d{3,5}[-\s]\d{5,10}$/.test(trimmed)) {
    return { type: 'PHONE', confidence: 0.95, reason: 'Phone with separators' };
  }
  if (/^0\d{2,5}[-\s]\d{5,8}$/.test(trimmed) && !looksLikePriceOrQty(trimmed)) {
    return { type: 'PHONE', confidence: 0.85, reason: 'Domestic phone with separators' };
  }
  if (/^\d{10,11}$/.test(digitsOnly) && !looksLikePriceOrQty(trimmed)) {
    return { type: 'PHONE', confidence: 0.75, reason: '10-11 digit standalone number in phone context' };
  }

  // ── Price / MRP
  if (/^[₹Rs.]\s*\d/.test(text) || /^\d\s*[₹Rs.]/.test(text)) {
    return { type: 'PRICE', confidence: 0.95, reason: 'Currency symbol present' };
  }
  // Standalone number followed by "MRP" nearby (handled in extraction, not classification)

  // ── Date (month-year patterns like "NOV. 2025", "APR 2027", "DEC-2024")
  if (/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[.,-]?\s*\d{4}$/i.test(trimmed)) {
    return { type: 'DATE', confidence: 0.98, reason: 'Month + 4-digit year pattern' };
  }
  if (/^\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}$/.test(trimmed) && digitsOnly.length >= 6) {
    // dd-mm-yyyy or similar — but not a 6-digit batch/barcode
    return { type: 'DATE', confidence: 0.90, reason: 'Date delimiter pattern with day+month' };
  }
  if (/^\d{4}[-/\.]\d{1,2}$/.test(trimmed)) {
    return { type: 'DATE', confidence: 0.90, reason: 'Year-month pattern' };
  }

  // ── PIN code (India: 6 digits, possibly 5 for other countries)
  if (/^\d{6}$/.test(digitsOnly) && looksLikePincode(trimmed)) {
    return { type: 'PINCODE', confidence: 0.88, reason: '6-digit number in address context' };
  }

  // ── BATCH_NUMBER — short alphanumeric, uppercase, typically 4-10 chars
  // e.g. BE107, A12345, LOT2024A, B202311
  // Excludes lowercase unit suffixes like "mg", "ml", "kg" by requiring UPPERCASE
  if (/^[A-Z]{1,3}\d{2,8}$/.test(trimmed) && trimmed.length <= 12) {
    return { type: 'BATCH_NUMBER', confidence: 0.85, reason: 'Short alphanumeric batch/lot pattern' };
  }
  if (/^LOT\s*\d+/i.test(trimmed) || /^BATCH\s*\d+/i.test(trimmed)) {
    return { type: 'BATCH_NUMBER', confidence: 0.92, reason: 'Explicit LOT/BATCH prefix' };
  }
  // Number followed by 1-4 UPPERCASE letters (not mg/ml/kg etc.)
  if (/^\d{3,8}[A-Z]{1,4}$/.test(trimmed) && trimmed.length >= 5 && trimmed.length <= 12) {
    return { type: 'BATCH_NUMBER', confidence: 0.80, reason: 'Number followed by uppercase letters' };
  }

  // ── LICENCE / REGISTRATION — long numeric strings (8+ digits)
  // e.g. 10820005000526, 122008, 12217026000320
  if (digitsOnly.length >= 8) {
    return { type: 'LICENCE_NUMBER', confidence: 0.80, reason: 'Long numeric identifier (≥8 digits)' };
  }

  // ── BARCODE — very long digit strings
  if (digitsOnly.length >= 12) {
    return { type: 'BARCODE', confidence: 0.85, reason: 'Long numeric string (barcode/ean pattern)' };
  }

  // ── DIMENSION — number with dimension unit (cm, mm, m, inch, etc.)
  if (/\d+\s*(cm|mm|m|inch|in|ft|foot)\b/i.test(text)) {
    return { type: 'DIMENSION', confidence: 0.90, reason: 'Number with dimension unit' };
  }
  //     (quantity patterns are tighter; dimension is a fallback)
  const qtyMatchImmediate = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?|count|caps?|tabs?)\b/i);
  if (qtyMatchImmediate) {
    return { type: 'QUANTITY', confidence: 0.92, reason: 'Number with quantity unit (' + qtyMatchImmediate[2] + ')' };
  }

  // ── QUANTITY — number with a weight/volume/count unit
  const qtyMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|pieces?|pcs?|nos?|nos|count|tabs?|caps?|ml)/i);
  if (qtyMatch) {
    return { type: 'QUANTITY', confidence: 0.92, reason: 'Number with quantity unit (' + qtyMatch[2] + ')' };
  }

  // ── PRICE — integer or decimal with 2 decimal places
  if (/^\d{1,6}(?:[.,]\d{1,2})?$/.test(trimmed)) {
    const val = parseFloat(trimmed.replace(',', '.'));
    // Prices typically range 1–10000 for consumer goods
    if (val > 0 && val < 100000 && !looksLikeQuantity(trimmed)) {
      return { type: 'PRICE', confidence: 0.70, reason: 'Numeric value in typical price range' };
    }
  }

  return { type: 'UNKNOWN', confidence: 0.3, reason: 'No specific classification pattern matched' };
}

function looksLikePincode(trimmed) {
  // PIN codes in India are 6 digits, and when found near address words
  // are highly likely to be PIN. In isolation we give lower confidence.
  return /^\d{6}$/.test(trimmed);
}

function looksLikeQuantity(trimmed) {
  return /\d+\s*(kg|g|l|ml|litre|pieces?|pcs?)/i.test(trimmed);
}

function looksLikePriceOrQty(trimmed) {
  // Check if in a price or quantity context
  return /\d+\s*(₹|Rs|MRP|price|kg|g|l|ml|pices)/i.test(trimmed);
}

// ─── Date Normalization ────────────────────────────────────────────────────────

const MONTH_MAP = {
  'jan': 1, 'january': 1,
  'feb': 2, 'february': 2,
  'mar': 3, 'march': 3,
  'apr': 4, 'april': 4,
  'may': 5,
  'jun': 6, 'june': 6,
  'jul': 7, 'july': 7,
  'aug': 8, 'august': 8,
  'sep': 9, 'sept': 9, 'september': 9,
  'oct': 10, 'october': 10,
  'nov': 11, 'november': 11,
  'dec': 12, 'december': 12,
};

/**
 * Parse date string and return YYYY-MM-DD or YYYY-MM.
 * Handles:
 *   "NOV. 2025" → 2025-11
 *   "APR 2027"  → 2027-04
 *   "DEC-2024"  → 2024-12
 *   "15/03/2025" → 2025-03-15
 *   "2025-11"   → 2025-11
 */
function normalizeDate(value) {
  const t = value.trim();

  // Month + year: "NOV. 2025", "APR 2027", "DEC-2024"
  const monthYear = t.match(/^([A-Za-z]{3,9})[.,\-]?\s*(\d{4})$/);
  if (monthYear) {
    const monthNum = MONTH_MAP[monthYear[1].toLowerCase()];
    if (monthNum) {
      return `${monthYear[2]}-${String(monthNum).padStart(2, '0')}`;
    }
  }

  // Year-month: "2025-11"
  const ym = t.match(/^(\d{4})[-/\.](\d{1,2})$/);
  if (ym) {
    return `${ym[1]}-${ym[2].padStart(2, '0')}`;
  }

  // dd-mm-yyyy or dd/mm/yyyy
  const dmy = t.match(/^(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{2,4})$/);
  if (dmy) {
    let year = dmy[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // yyyy-mm-dd
  const ymd = t.match(/^(\d{4})[-/\.](\d{1,2})[-/\.](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  return value; // Return as-is if no pattern matched
}

// ─── Unit Normalization ───────────────────────────────────────────────────────

const UNIT_NORMALIZATION = {
  'kg': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'g': 'g', 'gram': 'g', 'grams': 'g',
  'l': 'l', 'litre': 'l', 'litres': 'l', 'liter': 'l', 'liters': 'l',
  'ml': 'ml', 'millilitre': 'ml', 'millilitres': 'ml', 'milliliter': 'ml',
  'piece': 'pieces', 'pieces': 'pieces', 'pcs': 'pieces', 'pc': 'pieces',
  'nos': 'nos', 'nos.': 'nos', 'no': 'nos', 'no.': 'nos',
  'count': 'nos', 'ct': 'nos',
};

// ─── Detection ID Factory ────────────────────────────────────────────────────

function makeDetectionId(det) {
  const textPart = det.text.substring(0, 10).replace(/\s/g, '_').replace(/[^A-Za-z0-9_]/g, '');
  return `DET-${textPart}-${det.confidence.toFixed(2)}`;
}

// ─── Field Extractor ──────────────────────────────────────────────────────────

class FieldExtractor {
  /**
   * Extract all fields from OCR detections.
   * @param {Array} detections — raw OCR detections
   * @param {String} imageId — image identifier
   * @returns {Object} Extracted fields keyed by field name
   */
  extractFields(detections, imageId = 'unknown') {
    // Step 1: Classify all numeric-like detections
    const classified = detections.map(d => ({
      ...d,
      _classification: classifyNumericString(d.text),
    }));

    // Step 2: Spatial index for proximity-based association
    // Build a simple grid (bucket) index for fast nearby lookup
    const spatial = this._buildSpatialIndex(detections);

    // Step 3: Extract all fields
    const fields = {
      productName:        this._extractProductName(detections),
      manufacturer:       this._extractManufacturer(classified, detections),
      packer:             this._extractPacker(classified, detections),
      importer:           this._extractImporter(classified, detections),
      address:            this._extractAddress(detections),
      netQuantity:        this._extractNetQuantity(classified, detections),
      mrp:                this._extractMRP(classified, detections),
      manufacturingDate:  this._extractManufacturingDate(classified, detections),
      packingDate:        this._extractPackingDate(classified, detections),
      expiryDate:         this._extractExpiryDate(classified, detections),
      bestBefore:         this._extractBestBefore(classified, detections),
      batchNumber:        this._extractBatchNumber(classified, detections),
      consumerCare:       this._extractConsumerCare(classified, detections, spatial),
      phone:              this._extractPhone(classified, detections),
      email:              this._extractEmail(detections),
      website:            this._extractWebsite(detections),
      countryOfOrigin:    this._extractCountryOfOrigin(detections),
      licenceNumber:       this._extractLicenceNumber(classified, detections),
      // Surfaces tracked externally (in complianceManager) but initialize here
      _classifiedNumbers: classified.filter(d => d._classification.type !== 'UNKNOWN'),
    };

    return fields;
  }

  // ── Spatial Index ─────────────────────────────────────────────────────────

  _buildSpatialIndex(detections) {
    // Group detections by approximate row (y-band)
    const buckets = [];
    for (const det of detections) {
      if (!det.boundingBox) continue;
      const ys = det.boundingBox.map(p => p[1]);
      const rowY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const bucket = Math.floor(rowY / 40); // 40px row height
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(det);
    }
    return buckets;
  }

  _getNearbyDetections(det, detections, spatial, maxY = 60, maxX = 300) {
    if (!det.boundingBox) return [];
    const [bx1, by1, bx2, by2] = det.boundingBox.flat();
    const nearby = [];
    for (const other of detections) {
      if (other === det || !other.boundingBox) continue;
      const [ox1, oy1, ox2, oy2] = other.boundingBox.flat();
      const dy = Math.min(Math.abs(oy1 - by2), Math.abs(oy2 - by1));
      const dx = Math.min(Math.abs(ox1 - bx2), Math.abs(ox2 - bx1));
      if (dy < maxY && dx < maxX) {
        nearby.push(other);
      }
    }
    return nearby;
  }

  // ── Product Name ──────────────────────────────────────────────────────────

  _extractProductName(detections) {
    // Product name is typically: largest text block, uppercase, 2-5 words,
    // not numeric-heavy, not MRP/date/address patterns
    const candidates = detections
      .filter(d => {
        if (d.confidence < 0.80) return false;
        if (d.text.length < 3 || d.text.length > 40) return false;
        if (/^[\d\s.,₹]+$/.test(d.text)) return false; // purely numeric
        if (/^(MRP|M\.|MFG|EXP|INC|LTD|CO\.|LLC|PVT|LOT)/i.test(d.text)) return false;
        return true;
      })
      .sort((a, b) => {
        // Prefer shorter product-ish names over long address lines
        const scoreA = a.text.length < 25 && /^[A-Z]/.test(a.text) ? 2 : 0;
        const scoreB = b.text.length < 25 && /^[A-Z]/.test(b.text) ? 2 : 0;
        return (scoreB + b.confidence) - (scoreA + a.confidence);
      });

    if (!candidates.length) {
      return this._missingField('productName');
    }

    const det = candidates[0];
    return this._detectedField('productName', det.text, det.text, det.confidence, det);
  }

  // ── Manufacturer ─────────────────────────────────────────────────────────

  _extractManufacturer(classified, detections) {
    const patterns = [
      /(?:Manufactured\s*by|Mfd\.?\s*by|Manufacturer|MFG\.?\s*BY)[,:]?\s*([A-Za-z][A-Za-z\s&.,'-]{2,40})/i,
      /(?:Mfd\.?\s*on)[,:]?\s*(.+)/i,
    ];

    const result = this._matchField('manufacturer', patterns, detections, v => v.trim(), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Fallback: look for "Manufactured by" detection and get the NEXT detection on same row
    for (const det of detections) {
      if (/^Manufactured\s*by$/i.test(det.text.trim()) ||
          /^Mfd\.?\s*by$/i.test(det.text.trim())) {
        const nearby = this._getNearbyDetections(det, detections, null, 40, 300);
        const nameDet = nearby.find(n =>
          n.text.length > 5 && n.text.length < 50 &&
          /^[A-Z]/.test(n.text) && !/^[\d\s]+$/.test(n.text)
        );
        if (nameDet) {
          return this._detectedField('manufacturer', nameDet.text, nameDet.text,
            Math.min(det.confidence, nameDet.confidence), nameDet,
            [makeDetectionId(det), makeDetectionId(nameDet)]);
        }
      }
    }

    return result;
  }

  _extractPacker(classified, detections) {
    const patterns = [
      /(?:Packed\s*by|Packer|PKD\.?\s*BY)[,:]?\s*([A-Za-z][A-Za-z\s&.,'-]{2,40})/i,
    ];
    return this._matchField('packer', patterns, detections, v => v.trim(), 'DETECTED');
  }

  _extractImporter(classified, detections) {
    const patterns = [
      /(?:Imported\s*by|Importer)[,:]?\s*([A-Za-z][A-Za-z\s&.,'-]{2,40})/i,
    ];
    return this._matchField('importer', patterns, detections, v => v.trim(), 'DETECTED');
  }

  _extractAddress(detections) {
    // Address: look for "At:", "C/o", pincode-adjacent text, city patterns
    const patterns = [
      /(?:At|Sold\s*by|Regd\.?\s*(?:Office)?)[,:]?\s*(.+)/i,
      /(?:Regd\.?\s*Office|Head\s*Office|Corporate\s*Office)[,:]?\s*(.+)/i,
    ];

    const result = this._matchField('address', patterns, detections,
      v => v.replace(/\s+/g, ' ').trim(), 'DETECTED');

    if (result.status !== 'MISSING') return result;

    // Heuristic: find text containing pincode (6-digit number nearby)
    const withPincode = detections.find(d =>
      /\d{6}/.test(d.text) &&
      (d.text.length > 10) &&
      d.confidence > 0.7
    );
    if (withPincode) {
      return this._detectedField('address', withPincode.text, withPincode.text,
        withPincode.confidence, withPincode);
    }

    return result;
  }

  // ── Net Quantity ──────────────────────────────────────────────────────────

  _extractNetQuantity(classified, detections) {
    // Step 1: Find detections explicitly labeled as quantity
    // Patterns like "Net Qty: 500 g", "Contents: 1 L"
    const labeledPatterns = [
      /(?:Net[.\s]*(?:Qty|Quantity|Wt\.?|Weight)[:\s]*|Contents?[:\s]*)[,.]?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i,
    ];

    const labeledResult = this._matchField('netQuantity', labeledPatterns, detections,
      v => v.trim(), 'DETECTED', false);
    if (labeledResult.status === 'DETECTED' && labeledResult.normalizedValue) {
      // Normalize the quantity value
      const qtyVal = this._normalizeQuantity(labeledResult.value);
      if (qtyVal) {
        labeledResult.normalizedValue = qtyVal;
      }
      return labeledResult;
    }

    // Step 2: Find number + unit pairs near quantity-context keywords
    // "WEIGHT 500 G", "NET WT. 1 KG", "QTY 250 ML"
    const qtyContextKeywords = [
      'net wt', 'net weight', 'n.w.', 'wt.', 'quantity', 'qty',
      'net qty', 'net contents', 'contents', 'net content',
    ];

    for (const det of detections) {
      const upper = det.text.toUpperCase();
      const hasContext = qtyContextKeywords.some(kw => upper.includes(kw.toUpperCase()));
      if (!hasContext) continue;

      // Find a number+unit in THIS detection or nearby
      const nearby = this._getNearbyDetections(det, detections, null, 30, 200);
      const allNearby = [det, ...nearby];

      for (const nd of allNearby) {
        const qtyMatch = nd.text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i);
        if (qtyMatch) {
          const unitNorm = this._normalizeUnit(qtyMatch[2]);
          const value = parseFloat(qtyMatch[1].replace(',', '.'));
          if (value > 0 && value < 1000) { // sanity: reasonable qty range
            return {
              field: 'netQuantity',
              value: `${value} ${unitNorm}`,
              normalizedValue: { value, unit: unitNorm },
              confidence: nd.confidence,
              status: nd.confidence >= 0.90 ? 'DETECTED' : 'LOW_CONFIDENCE',
              sourceDetectionIds: [makeDetectionId(nd)],
              boundingBox: nd.boundingBox,
              rawText: nd.rawText || nd.text,
              ignoredClassifications: [], // populated below
            };
          }
        }
      }
    }

    // Step 3: Check classified detections for QUANTITY type
    const qtyClassified = classified.find(d => d._classification.type === 'QUANTITY');
    if (qtyClassified) {
      const qtyMatch = qtyClassified.text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|pieces?|pcs?|nos?)/i);
      if (qtyMatch) {
        const value = parseFloat(qtyMatch[1].replace(',', '.'));
        const unitNorm = this._normalizeUnit(qtyMatch[2]);
        return {
          field: 'netQuantity',
          value: `${value} ${unitNorm}`,
          normalizedValue: { value, unit: unitNorm },
          confidence: qtyClassified.confidence,
          status: 'DETECTED',
          sourceDetectionIds: [makeDetectionId(qtyClassified)],
          boundingBox: qtyClassified.boundingBox,
          rawText: qtyClassified.rawText || qtyClassified.text,
        };
      }
    }

    // Step 4: NOT_DETECTED — don't use arbitrary numbers
    // Explicitly list why we did NOT use other numbers
    const notUsed = classified
      .filter(d => !['QUANTITY', 'UNKNOWN'].includes(d._classification.type))
      .map(d => ({ text: d.text, type: d._classification.type, confidence: d._classification.confidence }));

    return {
      ...this._missingField('netQuantity'),
      notUsedNumbers: notUsed.slice(0, 10), // For WHY THIS RESULT panel
      reason: 'No quantity + unit pattern detected in labeled context. ' +
              'Other numbers were classified as ' + notUsed.map(n => n.type).join(', ') + ' and excluded.',
    };
  }

  _normalizeUnit(unit) {
    return UNIT_NORMALIZATION[unit.toLowerCase()] || unit.toLowerCase();
  }

  _normalizeQuantity(rawValue) {
    const match = rawValue.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i);
    if (!match) return null;
    const value = parseFloat(match[1].replace(',', '.'));
    const unit = this._normalizeUnit(match[2]);
    return { value, unit };
  }

  // ── MRP ──────────────────────────────────────────────────────────────────

  _extractMRP(classified, detections) {
    // Find MRP detection first
    let mrpDet = null;
    let labelDet = null;

    for (const det of detections) {
      const upper = det.text.toUpperCase();
      if (/MRP|M\.R\.P\.|MAXIMUM\s*RETAIL|RETAIL\s*PRICE/i.test(upper)) {
        labelDet = det;
        const nearby = this._getNearbyDetections(det, detections, null, 30, 200);
        // Find price in nearby or same detection
        for (const nd of [det, ...nearby]) {
          const priceMatch = nd.text.match(/(?:₹|Rs\.?)?\s*(\d+(?:[.,]\d{1,2})?)/);
          if (priceMatch) {
            const val = parseFloat(priceMatch[1].replace(',', ''));
            if (val > 0 && val < 1000000) {
              mrpDet = nd;
              break;
            }
          }
        }
        if (mrpDet) break;
      }
    }

    // Also try standalone price patterns
    if (!mrpDet) {
      for (const det of detections) {
        const mrpMatch = det.text.match(/₹?\s*(\d+(?:[.,]\d{1,2})?)\s*₹?/i);
        if (mrpMatch) {
          const val = parseFloat(mrpMatch[1].replace(',', ''));
          if (val > 0 && val < 100000 && val > 5) { // MRP typically > Rs.5
            mrpDet = det;
            break;
          }
        }
      }
    }

    if (mrpDet) {
      const mrpMatch = mrpDet.text.match(/(\d+(?:[.,]\d{1,2})?)/);
      const val = mrpMatch ? parseFloat(mrpMatch[1].replace(',', '')) : null;
      return {
        field: 'mrp',
        value: val,
        normalizedValue: val,
        confidence: mrpDet.confidence,
        status: 'DETECTED',
        sourceDetectionIds: [makeDetectionId(mrpDet)],
        boundingBox: mrpDet.boundingBox,
        rawText: mrpDet.rawText || mrpDet.text,
      };
    }

    // MRP not found — this could mean:
    // a) It's on a surface we didn't photograph → NOT_VISIBLE
    // b) It's genuinely absent → NOT_DETECTED
    // From a single image we cannot be sure, so mark NOT_VISIBLE → REVIEW
    return {
      field: 'mrp',
      value: null,
      normalizedValue: null,
      confidence: 0,
      status: 'NOT_VISIBLE',   // ← NOT_VISIBLE, not MISSING
      sourceDetectionIds: [],
      reason: 'MRP not found in the photographed surface. ' +
              'If only one surface was captured, MRP may be on another side. ' +
              'Inspector should verify all surfaces.',
    };
  }

  // ── Dates ────────────────────────────────────────────────────────────────

  _extractManufacturingDate(classified, detections) {
    const prefixes = [
      /(?:MFG\.?\s*(?:DATE|D\.?|ON)?|Manufacturing\s*(?:date|on)?|Manufactured?\s*(?:on|date)?|MFD\.?)[,:]?\s*(.+)/i,
      /(?:Date\s*of\s*(?:Mfg|Manufacturing|Manufacture))[,:]?\s*(.+)/i,
    ];

    const result = this._matchField('manufacturingDate', prefixes, detections,
      v => normalizeDate(v.trim()), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Fallback: find MFG label and get adjacent date
    for (const det of detections) {
      const t = det.text.trim();
      if (/^MFG\.?$/i.test(t) || /^MANUFACTURING$/i.test(t)) {
        const nearby = this._getNearbyDetections(det, detections, null, 30, 150);
        for (const nd of nearby) {
          const cls = classifyNumericString(nd.text);
          if (cls.type === 'DATE') {
            return this._detectedField('manufacturingDate', nd.text,
              normalizeDate(nd.text), nd.confidence, nd, [makeDetectionId(det), makeDetectionId(nd)]);
          }
        }
        // Also try raw month-year without classification
        const dateMatch = nd => nd.text.match(/([A-Za-z]{3,9})[.,-]?\s*(\d{4})/i);
      }
    }

    return result;
  }

  _extractPackingDate(classified, detections) {
    const prefixes = [
      /(?:PKD\.?|Packing\s*(?:Date)?|Packed\s*(?:on|date)?|Date\s*of\s*Packing)[,:]?\s*(.+)/i,
    ];

    const result = this._matchField('packingDate', prefixes, detections,
      v => normalizeDate(v.trim()), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Fallback: find PKD label
    for (const det of detections) {
      if (/^PKD\.?$/i.test(det.text.trim())) {
        const nearby = this._getNearbyDetections(det, detections, null, 30, 150);
        for (const nd of nearby) {
          const cls = classifyNumericString(nd.text);
          if (cls.type === 'DATE') {
            return this._detectedField('packingDate', nd.text,
              normalizeDate(nd.text), nd.confidence, nd, [makeDetectionId(det), makeDetectionId(nd)]);
          }
        }
      }
    }

    return result;
  }

  _extractExpiryDate(classified, detections) {
    const prefixes = [
      /(?:EXP\.?\s*(?:DATE|D\.?)?|Expiry\s*(?:date)?|Best\s*Before|Use\s*By|Use\s*Before)[,:]?\s*(.+)/i,
    ];

    const result = this._matchField('expiryDate', prefixes, detections,
      v => normalizeDate(v.trim()), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Fallback: find EXP label
    for (const det of detections) {
      const t = det.text.trim();
      if (/^EXP\.?$/i.test(t) || /^EXPIRY$/i.test(t) || /^BEST\s*BEFORE$/i.test(t)) {
        const nearby = this._getNearbyDetections(det, detections, null, 30, 150);
        for (const nd of nearby) {
          const cls = classifyNumericString(nd.text);
          if (cls.type === 'DATE') {
            return this._detectedField('expiryDate', nd.text,
              normalizeDate(nd.text), nd.confidence, nd, [makeDetectionId(det), makeDetectionId(nd)]);
          }
        }
      }
    }

    return result;
  }

  _extractBestBefore(classified, detections) {
    const prefixes = [
      /(?:Best\s*Before|Best\s*Bafore)[,:]?\s*(.+)/i,
    ];
    return this._matchField('bestBefore', prefixes, detections,
      v => v.trim(), 'DETECTED');
  }

  // ── Batch Number ─────────────────────────────────────────────────────────

  _extractBatchNumber(classified, detections) {
    // Step 1: Match explicit batch/lot label
    const patterns = [
      /(?:Batch|Lot)\s*(?:No\.?|Number)?[:.]?\s*([A-Z0-9]{3,15})/i,
    ];
    const result = this._matchField('batchNumber', patterns, detections, v => v.trim(), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Step 2: Look for BATCH/LOT keyword + nearby alphanumeric
    for (const det of detections) {
      const t = det.text.trim();
      if (/^BATCH$/i.test(t) || /^LOT$/i.test(t)) {
        const nearby = this._getNearbyDetections(det, detections, null, 30, 150);
        for (const nd of nearby) {
          const cls = classifyNumericString(nd.text);
          if (cls.type === 'BATCH_NUMBER' || /^[A-Z0-9]{4,12}$/.test(nd.text)) {
            return this._detectedField('batchNumber', nd.text, nd.text,
              Math.min(det.confidence, nd.confidence), nd,
              [makeDetectionId(det), makeDetectionId(nd)]);
          }
        }
      }
    }

    // Step 3: Use classified BATCH_NUMBER detections
    const batchClassified = classified.find(d => d._classification.type === 'BATCH_NUMBER');
    if (batchClassified) {
      return this._detectedField('batchNumber', batchClassified.text, batchClassified.text,
        batchClassified._classification.confidence, batchClassified);
    }

    return result;
  }

  // ── Consumer Care ─────────────────────────────────────────────────────────

  _extractConsumerCare(classified, detections, spatial) {
    // Find "CUSTOMER CARE" / "CONSUMER CARE" / "HELPLINE" / "CONTACT" label
    let labelDet = null;
    let labelType = '';

    for (const det of detections) {
      const t = det.text.trim().toUpperCase();
      if (/CUSTOMER\s*CARE|CONSUMER\s*CARE|HELPLINE|HELP\s*LINE|CONTACT\s*US|TOLL\s*FREE/i.test(t)) {
        labelDet = det;
        labelType = t;
        break;
      }
    }

    // Get nearby contact info
    const nearby = labelDet
      ? this._getNearbyDetections(labelDet, detections, spatial, 60, 300)
      : [];

    const phoneDets = [];
    const emailDets = [];
    const webDets = [];
    const addressDets = [];

    for (const det of [...nearby, labelDet].filter(Boolean)) {
      const t = det.text;
      if (/\d{10,}/.test(t) || /^[+]?\d/.test(t)) phoneDets.push(det);
      if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(t)) emailDets.push(det);
      if (/www\.|^https?:\/\//i.test(t)) webDets.push(det);
    }

    const parts = [];
    const allIds = labelDet ? [makeDetectionId(labelDet)] : [];

    // Build structured contact
    const contact = {};

    for (const pd of phoneDets) {
      if (!parts.includes(pd.text)) { parts.push(pd.text); allIds.push(makeDetectionId(pd)); }
    }
    for (const ed of emailDets) {
      contact.email = ed.text;
      if (!parts.includes(ed.text)) { parts.push(ed.text); allIds.push(makeDetectionId(ed)); }
    }
    for (const wd of webDets) {
      contact.website = wd.text;
      if (!parts.includes(wd.text)) { parts.push(wd.text); allIds.push(makeDetectionId(wd)); }
    }

    // Also collect email/website from standalone extractions
    for (const det of detections) {
      if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(det.text)) {
        if (!contact.email) {
          contact.email = det.text;
          if (!parts.includes(det.text)) { parts.push(det.text); allIds.push(makeDetectionId(det)); }
        }
      }
      if (/www\./i.test(det.text) || /^https?:\/\//i.test(det.text)) {
        if (!contact.website) {
          contact.website = det.text;
          if (!parts.includes(det.text)) { parts.push(det.text); allIds.push(makeDetectionId(det)); }
        }
      }
    }

    if (parts.length === 0) {
      return {
        ...this._missingField('consumerCare'),
        detectedLabel: labelType || null,
        labelOnly: labelDet ? true : false,
      };
    }

    return {
      field: 'consumerCare',
      value: parts.join(' | '),
      normalizedValue: contact,
      confidence: labelDet ? labelDet.confidence : Math.max(...(phoneDets.map(d => d.confidence) || [0.5])),
      status: 'DETECTED',
      sourceDetectionIds: [...new Set(allIds)],
      boundingBox: labelDet?.boundingBox || phoneDets[0]?.boundingBox,
      rawText: labelDet?.rawText || null,
      contactParts: parts,
    };
  }

  // ── Phone ────────────────────────────────────────────────────────────────

  _extractPhone(classified, detections) {
    const patterns = [
      /([+]?\d{1,3}[-\s]?\d{3,5}[-\s]?\d{6,10})/,
      /(\d{10})/,
    ];
    return this._matchField('phone', patterns, detections, v => v.trim(), 'DETECTED');
  }

  // ── Email ────────────────────────────────────────────────────────────────

  _extractEmail(detections) {
    const patterns = [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/];
    return this._matchField('email', patterns, detections, v => v.trim(), 'DETECTED');
  }

  // ── Website ──────────────────────────────────────────────────────────────

  _extractWebsite(detections) {
    const patterns = [
      /(?:www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /(?:https?:\/\/[^\s]+)/i,
    ];
    return this._matchField('website', patterns, detections, v => v.trim(), 'DETECTED');
  }

  // ── Country of Origin ───────────────────────────────────────────────────

  _extractCountryOfOrigin(detections) {
    const patterns = [
      /(?:Country\s*of\s*Origin|Made\s*in|Product\s*of|Country\s*of\s*Manufacturing)[,:]?\s*([A-Za-z][A-Za-z\s]{2,30})/i,
      /(?:Imported\s*from)[,:]?\s*([A-Za-z][A-Za-z\s]{2,30})/i,
    ];
    return this._matchField('countryOfOrigin', patterns, detections, v => v.trim(), 'DETECTED');
  }

  // ── Licence Number ───────────────────────────────────────────────────────

  _extractLicenceNumber(classified, detections) {
    // Look for licence/registration labels
    const patterns = [
      /(?:Licence|License|Reg\.?|Registration)\s*(?:No\.?|Number)?[:.]?\s*([A-Z0-9]{5,20})/i,
      /(?:FSSAI|LIC\.?)[-\s]*([0-9]+)/i,
    ];
    const result = this._matchField('licenceNumber', patterns, detections, v => v.trim().toUpperCase(), 'DETECTED');
    if (result.status !== 'MISSING') return result;

    // Use classified LICENCE_NUMBER detections
    const licClassified = classified.find(d => d._classification.type === 'LICENCE_NUMBER');
    if (licClassified) {
      return this._detectedField('licenceNumber', licClassified.text, licClassified.text,
        licClassified._classification.confidence, licClassified);
    }

    return result;
  }

  // ── Generic Pattern Matcher ─────────────────────────────────────────────

  /**
   * Match field using regex patterns against OCR detections.
   * @param {string} fieldName
   * @param {RegExp[]} patterns
   * @param {Array} detections
   * @param {Function} normalizer
   * @param {string} onSuccessStatus — 'DETECTED' or 'LOW_CONFIDENCE'
   * @param {boolean} requirePrefix — pattern must have a capture group
   */
  _matchField(fieldName, patterns, detections, normalizer, onSuccessStatus, requirePrefix = true) {
    const matches = [];

    for (const det of detections) {
      const text = det.text + ' ' + (det.rawText || '');

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const value = requirePrefix ? (match[1] || match[0]).trim() : match[0].trim();
          if (value.length > 0) {
            matches.push({
              detection: det,
              value,
              fullMatch: match[0],
              confidence: det.confidence,
            });
          }
        }
      }
    }

    if (matches.length === 0) {
      return this._missingField(fieldName);
    }

    // Ambiguous: multiple different values
    if (matches.length > 1) {
      const vals = matches.map(m => m.value);
      const allSame = vals.every(v => v === vals[0]);
      if (!allSame) {
        return {
          field: fieldName,
          value: vals,
          normalizedValue: vals.map(normalizer),
          confidence: Math.max(...matches.map(m => m.confidence)),
          status: 'AMBIGUOUS',
          sourceDetectionIds: matches.map(m => makeDetectionId(m.detection)),
          boundingBox: matches[0].detection.boundingBox,
        };
      }
    }

    const best = matches.reduce((a, b) => a.confidence > b.confidence ? a : b);
    const normalized = normalizer ? normalizer(best.value) : best.value;
    const status = best.confidence >= 0.90 ? onSuccessStatus
      : (best.confidence >= 0.75 ? 'LOW_CONFIDENCE' : 'LOW_CONFIDENCE');

    return {
      field: fieldName,
      value: best.value,
      normalizedValue: normalized,
      confidence: best.confidence,
      status,
      sourceDetectionIds: [makeDetectionId(best.detection)],
      boundingBox: best.detection.boundingBox,
      rawText: best.detection.rawText || best.detection.text,
    };
  }

  // ── Field Factories ──────────────────────────────────────────────────────

  _detectedField(fieldName, value, normalizedValue, confidence, detection, extraIds = []) {
    return {
      field: fieldName,
      value,
      normalizedValue: normalizedValue || value,
      confidence,
      status: confidence >= 0.90 ? 'DETECTED' : 'LOW_CONFIDENCE',
      sourceDetectionIds: [makeDetectionId(detection), ...extraIds].filter(Boolean),
      boundingBox: detection?.boundingBox || null,
      rawText: detection?.rawText || detection?.text || null,
    };
  }

  _missingField(fieldName) {
    return {
      field: fieldName,
      value: null,
      normalizedValue: null,
      confidence: 0,
      status: 'NOT_DETECTED',  // NOT_DETECTED, not MISSING — preserves meaning
      sourceDetectionIds: [],
      boundingBox: null,
    };
  }
}

module.exports = { FieldExtractor, classifyNumericString, normalizeDate };
