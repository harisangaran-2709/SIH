/**
 * compliance/fieldExtractor.js
 * -----------------------------
 * Extracts structured fields from OCR detections
 * Maintains traceability to source OCR text
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Field extraction patterns
 */
const PATTERNS = {
  // MRP patterns
  mrp: [
    /(?:MRP|M\.R\.P\.?|Maximum Retail Price|Max\.? Retail Price)[:\s]*₹?\s*(\d+(?:\.\d{1,2})?)/i,
    /₹\s*(\d+(?:\.\d{1,2})?)\s*(?:MRP|M\.R\.P\.?)/i,
    /Rs\.?\s*(\d+(?:\.\d{1,2})?)/i,
  ],

  // Net quantity patterns
  netQuantity: [
    /(?:Net[.\s]*(?:Qty|Quantity|Wt\.?|Weight))[:\s]*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i,
    /(?:Contents?|Contain)[:\s]*(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram)/i,
    /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i,
  ],

  // Manufacturing date patterns
  mfgDate: [
    /(?:Mfg\.?|Manufacturing|Manufactured)\s*(?:Date|On)?[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /(?:Date of (?:Mfg|Manufacturing|Manufacture))[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /(?:Mfg\.?|Manufacturing)[:\s]*([A-Za-z]+\s*\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ],

  // Packing date
  packingDate: [
    /(?:Packing|Packed)\s*(?:Date|On)?[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    /(?:Date of Packing)[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ],

  // Best before
  bestBefore: [
    /(?:Best Before|Best Bafore|Use Before|Use By)[:\s]*(\d+\s*(?:months?|days?|years?))/i,
    /(?:Best Before|Best Bafore|Use Before|Use By)[:\s]*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
  ],

  // Batch number
  batchNumber: [
    /(?:Batch|Lot)\s*(?:No\.?|Number)?[:\s]*([A-Z0-9]+)/i,
    /(?:Batch|Lot)[:\s]*([A-Z0-9]+)/i,
  ],

  // Manufacturer
  manufacturer: [
    /(?:Manufactured by|Mfd\.? by|Manufacturer)[:\s]*([A-Za-z\s&.,'-]+(?:Pvt\.?|Private|Ltd\.?|Limited|Inc\.?|Corporation|Corp\.?)[A-Za-z\s.,'-]*)/i,
    /(?:Manufactured by|Mfd\.? by)[:\s]*([A-Za-z\s&.,'-]+)/i,
  ],

  // Packer
  packer: [
    /(?:Packed by|Packer)[:\s]*([A-Za-z\s&.,'-]+(?:Pvt\.?|Private|Ltd\.?|Limited|Inc\.?)[A-Za-z\s.,'-]*)/i,
    /(?:Packed by)[:\s]*([A-Za-z\s&.,'-]+)/i,
  ],

  // Importer
  importer: [
    /(?:Imported by|Importer)[:\s]*([A-Za-z\s&.,'-]+(?:Pvt\.?|Private|Ltd\.?|Limited|Inc\.?)[A-Za-z\s.,'-]*)/i,
    /(?:Imported by)[:\s]*([A-Za-z\s&.,'-]+)/i,
  ],

  // Country of origin
  countryOfOrigin: [
    /(?:Country of Origin|Made in|Product of)[:\s]*([A-Za-z\s]+)/i,
  ],

  // Consumer care
  consumerCare: [
    /(?:Customer Care|Consumer Care|Contact)[:\s]*([+\d\s()-]+)/i,
    /(?:Customer Care|Consumer Care)[:\s]*([A-Za-z0-9\s.,@+-]+)/i,
  ],

  // Email
  email: [
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  ],

  // Website
  website: [
    /(?:Website|Web)[:\s]*(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    /(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
  ],

  // Phone
  phone: [
    /([+]?\d{1,3}[-\s]?\d{3,5}[-\s]?\d{6,8})/,
    /(\d{10})/,
  ],
};

/**
 * Unit normalization
 */
const UNIT_NORMALIZATION = {
  'kg': 'kg',
  'kilogram': 'kg',
  'g': 'g',
  'gram': 'g',
  'l': 'l',
  'litre': 'l',
  'liter': 'l',
  'ml': 'ml',
  'millilitre': 'ml',
  'milliliter': 'ml',
  'piece': 'pieces',
  'pieces': 'pieces',
  'pcs': 'pieces',
  'pc': 'pieces',
  'nos': 'nos',
  'no': 'nos',
};

/**
 * Field extractor class
 */
class FieldExtractor {
  /**
   * Extract all fields from OCR detections
   * @param {Array} detections - OCR detection objects
   * @param {String} imageId - Image identifier
   * @returns {Object} Extracted fields with traceability
   */
  extractFields(detections, imageId = 'unknown') {
    const fields = {};

    // Product name (first large text, typically)
    fields.productName = this.extractProductName(detections);

    // MRP
    fields.mrp = this.extractField(detections, 'mrp', PATTERNS.mrp, this.normalizeMRP.bind(this));

    // Net quantity
    fields.netQuantity = this.extractField(detections, 'netQuantity', PATTERNS.netQuantity, this.normalizeQuantity.bind(this));

    // Manufacturing date
    fields.mfgDate = this.extractField(detections, 'mfgDate', PATTERNS.mfgDate, this.normalizeDate.bind(this));

    // Packing date
    fields.packingDate = this.extractField(detections, 'packingDate', PATTERNS.packingDate, this.normalizeDate.bind(this));

    // Best before
    fields.bestBefore = this.extractField(detections, 'bestBefore', PATTERNS.bestBefore);

    // Batch number
    fields.batchNumber = this.extractField(detections, 'batchNumber', PATTERNS.batchNumber);

    // Manufacturer
    fields.manufacturer = this.extractField(detections, 'manufacturer', PATTERNS.manufacturer);

    // Packer
    fields.packer = this.extractField(detections, 'packer', PATTERNS.packer);

    // Importer
    fields.importer = this.extractField(detections, 'importer', PATTERNS.importer);

    // Country of origin
    fields.countryOfOrigin = this.extractField(detections, 'countryOfOrigin', PATTERNS.countryOfOrigin);

    // Consumer care
    fields.consumerCare = this.extractConsumerCare(detections);

    // Email
    fields.email = this.extractField(detections, 'email', PATTERNS.email);

    // Website
    fields.website = this.extractField(detections, 'website', PATTERNS.website);

    // Phone
    fields.phone = this.extractField(detections, 'phone', PATTERNS.phone);

    return fields;
  }

  /**
   * Extract product name (heuristic: first large confident text)
   */
  extractProductName(detections) {
    // Find first high-confidence, reasonably long text
    const candidates = detections
      .filter(d => d.confidence > 0.85 && d.text.length > 3 && d.text.length < 50)
      .filter(d => !this.isNumericOrPrice(d.text))
      .slice(0, 3); // Top 3 candidates

    if (candidates.length === 0) {
      return this.createMissingField('productName');
    }

    // Use first candidate
    const det = candidates[0];
    return {
      field: 'productName',
      value: det.text,
      normalizedValue: det.text,
      confidence: det.confidence,
      status: 'DETECTED',
      sourceDetectionIds: [this.createDetectionId(det)],
      boundingBox: det.boundingBox,
      rawText: det.rawText || det.text,
    };
  }

  /**
   * Extract field using patterns
   */
  extractField(detections, fieldName, patterns, normalizer = null) {
    const matches = [];

    for (const detection of detections) {
      const text = detection.text + ' ' + (detection.rawText || '');

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          matches.push({
            detection,
            match: match[1] || match[0],
            fullMatch: match[0], // Store full match for normalizers
            confidence: detection.confidence,
          });
        }
      }
    }

    if (matches.length === 0) {
      return this.createMissingField(fieldName);
    }

    // Handle multiple matches
    if (matches.length > 1) {
      // Check if they're all the same
      const firstValue = matches[0].match;
      const allSame = matches.every(m => m.match === firstValue);

      if (!allSame) {
        // Ambiguous - multiple different values
        return this.createAmbiguousField(fieldName, matches);
      }
    }

    // Single match or all same
    const best = matches.reduce((a, b) => a.confidence > b.confidence ? a : b);
    // Use fullMatch for normalizers that need full context (like quantity with units)
    const normalized = normalizer ? normalizer(best.fullMatch) : best.match;

    return {
      field: fieldName,
      value: best.match,
      normalizedValue: normalized,
      confidence: best.confidence,
      status: best.confidence < 0.75 ? 'LOW_CONFIDENCE' : 'DETECTED',
      sourceDetectionIds: matches.map(m => this.createDetectionId(m.detection)),
      boundingBox: best.detection.boundingBox,
      rawText: best.detection.rawText || best.detection.text,
    };
  }

  /**
   * Extract consumer care (phone + name + address)
   */
  extractConsumerCare(detections) {
    const phone = this.extractField(detections, 'phone', PATTERNS.phone);
    const email = this.extractField(detections, 'email', PATTERNS.email);
    const website = this.extractField(detections, 'website', PATTERNS.website);

    // Combine consumer care fields
    const parts = [];
    if (phone.status === 'DETECTED') parts.push(phone.value);
    if (email.status === 'DETECTED') parts.push(email.value);
    if (website.status === 'DETECTED') parts.push(website.value);

    if (parts.length === 0) {
      return this.createMissingField('consumerCare');
    }

    return {
      field: 'consumerCare',
      value: parts.join(' | '),
      normalizedValue: { phone: phone.value, email: email.value, website: website.value },
      confidence: Math.max(phone.confidence, email.confidence, website.confidence),
      status: 'DETECTED',
      sourceDetectionIds: [
        ...phone.sourceDetectionIds,
        ...email.sourceDetectionIds,
        ...website.sourceDetectionIds,
      ],
    };
  }

  /**
   * Create missing field structure
   */
  createMissingField(fieldName) {
    return {
      field: fieldName,
      value: null,
      normalizedValue: null,
      confidence: 0,
      status: 'MISSING',
      sourceDetectionIds: [],
    };
  }

  /**
   * Create ambiguous field structure
   */
  createAmbiguousField(fieldName, matches) {
    return {
      field: fieldName,
      value: matches.map(m => m.match).join(' | '),
      normalizedValue: matches.map(m => m.match),
      confidence: Math.max(...matches.map(m => m.confidence)),
      status: 'AMBIGUOUS',
      sourceDetectionIds: matches.map(m => this.createDetectionId(m.detection)),
    };
  }

  /**
   * Create detection ID
   */
  createDetectionId(detection) {
    return `DET-${detection.text.substring(0, 10).replace(/\s/g, '_')}-${detection.confidence.toFixed(2)}`;
  }

  /**
   * Check if text is numeric or price
   */
  isNumericOrPrice(text) {
    return /^[\d.,₹Rs\s]+$/.test(text);
  }

  /**
   * Normalize MRP
   */
  normalizeMRP(value) {
    const num = parseFloat(value.replace(/[^\d.]/g, ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Normalize quantity
   */
  normalizeQuantity(value) {
    const match = value.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|pieces?|pcs?|nos?)/i);
    if (!match) return null;

    const num = parseFloat(match[1]);
    const unit = UNIT_NORMALIZATION[match[2].toLowerCase()] || match[2].toLowerCase();

    return { value: num, unit };
  }

  /**
   * Normalize date
   */
  normalizeDate(value) {
    // Try to parse common date formats
    const match = value.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) {
        year = '20' + year;
      }
      return `${year}-${month}-${day}`;
    }

    return value;
  }
}

module.exports = { FieldExtractor };
