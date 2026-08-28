/**
 * compliance/evidenceGenerator.js
 * --------------------------------
 * Evidence generation system for Legal Metrology compliance findings.
 *
 * Generates evidence records that:
 * 1. Link each finding to its source OCR detection IDs and bounding boxes
 * 2. Provide crop metadata so the browser can render image crops via Canvas API
 * 3. Never modify original images server-side (no Sharp/Jimp required)
 *
 * Evidence record structure:
 * {
 *   evidenceId, findingId, ruleId, field, status,
 *   ocrDetectionIds: string[],
 *   boundingBox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]],
 *   cropRegion: { x, y, width, height, padding: 20 },
 *   imageId: string,
 *   sourceText: string,
 *   confidence: number,
 *   generatedAt: ISO timestamp
 * }
 */

class EvidenceGenerator {
  /**
   * Generate evidence records from compliance findings and OCR detections
   * @param {Object} complianceResult - Full compliance analysis result
   * @param {Object} ocrResults - Original OCR results with detections
   * @returns {Object} Evidence package with records and summary
   */
  generateEvidence(complianceResult, ocrResults) {
    const evidenceRecords = [];
    const ocrDetectionMap = this.buildDetectionMap(ocrResults);
    const imageMap = this.buildImageMap(ocrResults);

    complianceResult.findings.forEach(finding => {
      const evidence = this.generateEvidenceForFinding(finding, ocrDetectionMap, imageMap);
      if (evidence) {
        evidenceRecords.push(evidence);
      }
    });

    // Add evidence for declarations (even PASS ones for complete records)
    Object.entries(complianceResult.declarations || {}).forEach(([fieldName, declaration]) => {
      if (declaration.detected && declaration.sourceDetectionIds?.length > 0) {
        const existing = evidenceRecords.find(e => e.field === fieldName);
        if (!existing) {
          const evidence = this.generateEvidenceForDeclaration(fieldName, declaration, ocrDetectionMap, imageMap);
          evidenceRecords.push(evidence);
        }
      }
    });

    return {
      evidenceId: `EV-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      findingCount: complianceResult.findings.length,
      evidenceRecordCount: evidenceRecords.length,
      records: evidenceRecords,
      summary: this.generateEvidenceSummary(evidenceRecords, complianceResult),
      instructions: this.getEvidenceInstructions(),
    };
  }

  /**
   * Build a map of detectionId -> detection for quick lookup
   */
  buildDetectionMap(ocrResults) {
    const map = new Map();
    (ocrResults.results || []).forEach(result => {
      (result.detections || []).forEach(det => {
        const id = `DET-${det.text.substring(0, 10).replace(/\s/g, '_')}-${det.confidence.toFixed(2)}`;
        map.set(id, { ...det, imageId: result.imageId });
        // Also index by text for fuzzy matching
        const textKey = det.text.toLowerCase().trim();
        if (textKey) map.set(`text:${textKey}`, det);
      });
    });
    return map;
  }

  /**
   * Build a map of imageId -> image dimensions
   */
  buildImageMap(ocrResults) {
    const map = new Map();
    (ocrResults.results || []).forEach(result => {
      map.set(result.imageId, {
        imageId: result.imageId,
        width: result.width,
        height: result.height,
        processingTimeMs: result.processingTimeMs,
      });
    });
    return map;
  }

  /**
   * Generate evidence record for a single finding
   */
  generateEvidenceForFinding(finding, detectionMap, imageMap) {
    const detectionIds = finding.sourceDetectionIds || [];
    const detections = detectionIds
      .map(id => detectionMap.get(id))
      .filter(Boolean);

    // If no direct match, try to find by field text
    let primaryDetection = detections[0];
    if (!primaryDetection && finding.field) {
      primaryDetection = this.findDetectionByField(finding.field, detectionMap);
    }

    const imageId = primaryDetection?.imageId || finding.imageId || 'unknown';
    const imageInfo = imageMap.get(imageId) || { width: 0, height: 0 };

    const cropRegion = this.calculateCropRegion(
      primaryDetection?.boundingBox,
      imageInfo.width,
      imageInfo.height
    );

    return {
      evidenceId: `EV-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      field: finding.field,
      status: finding.status,
      severity: this.getSeverity(finding.status),
      // OCR traceability
      ocrDetectionIds: detectionIds,
      sourceText: primaryDetection?.text || finding.detectedText || null,
      confidence: primaryDetection?.confidence || finding.confidence || 0,
      // Bounding box (the evidence anchor)
      boundingBox: primaryDetection?.boundingBox || null,
      // Crop metadata for browser-side rendering
      cropRegion,
      imageId,
      imageDimensions: { width: imageInfo.width, height: imageInfo.height },
      // Context
      expected: finding.expected,
      detectedText: finding.detectedText,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate evidence record for a declaration
   */
  generateEvidenceForDeclaration(fieldName, declaration, detectionMap, imageMap) {
    const detectionIds = declaration.sourceDetectionIds || [];
    const detections = detectionIds
      .map(id => detectionMap.get(id))
      .filter(Boolean);
    const primaryDetection = detections[0];

    const imageId = primaryDetection?.imageId || 'unknown';
    const imageInfo = imageMap.get(imageId) || { width: 0, height: 0 };

    const cropRegion = this.calculateCropRegion(
      primaryDetection?.boundingBox,
      imageInfo.width,
      imageInfo.height
    );

    return {
      evidenceId: `EV-DECL-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      findingId: null,
      ruleId: declaration.ruleId || null,
      field: fieldName,
      status: declaration.status,
      severity: 'INFO',
      ocrDetectionIds: detectionIds,
      sourceText: declaration.value || null,
      confidence: declaration.confidence || 0,
      boundingBox: primaryDetection?.boundingBox || null,
      cropRegion,
      imageId,
      imageDimensions: { width: imageInfo.width, height: imageInfo.height },
      expected: null,
      detectedText: declaration.value,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Find a detection by matching the field name to detected text
   */
  findDetectionByField(fieldName, detectionMap) {
    const fieldKeywords = {
      mrp: ['mrp', 'retail price', 'maximum retail'],
      netQuantity: ['net qty', 'net wt', 'contents', 'qty'],
      manufacturer: ['manufactured by', 'mfd by', 'manufacturer'],
      mfgDate: ['mfg', 'manufacturing date', 'manufactured'],
      consumerCare: ['customer care', 'consumer care', 'contact'],
      productName: [], // handled separately
    };

    const keywords = fieldKeywords[fieldName] || [fieldName];
    for (const [key, det] of detectionMap.entries()) {
      if (key.startsWith('text:')) {
        const text = key.substring(5);
        if (keywords.some(kw => text.includes(kw))) {
          return det;
        }
      }
    }
    return null;
  }

  /**
   * Calculate crop region with padding for visual context
   * Returns pixel coordinates for browser-side canvas cropping
   */
  calculateCropRegion(boundingBox, imageWidth, imageHeight) {
    const padding = 30; // pixels of context around the detection
    const minSize = 80; // minimum crop size

    if (!boundingBox || boundingBox.length < 4) {
      // No bounding box — return center crop
      const size = Math.min(imageWidth, imageHeight, 400);
      return {
        x: Math.max(0, Math.floor(imageWidth / 2 - size / 2)),
        y: Math.max(0, Math.floor(imageHeight / 2 - size / 2)),
        width: size,
        height: size,
        padding,
        method: 'center_fallback',
      };
    }

    // Extract bounding rectangle from polygon
    const xs = boundingBox.map(p => p[0]);
    const ys = boundingBox.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    // Apply padding
    const x = Math.max(0, minX - padding);
    const y = Math.max(0, minY - padding);
    const w = Math.min(imageWidth - x, width + padding * 2);
    const h = Math.min(imageHeight - y, height + padding * 2);

    return {
      x,
      y,
      width: Math.max(w, minSize),
      height: Math.max(h, minSize),
      padding,
      method: 'bbox',
    };
  }

  /**
   * Determine severity based on status
   */
  getSeverity(status) {
    switch (status) {
      case 'FAIL': return 'HIGH';
      case 'REVIEW': return 'MEDIUM';
      case 'PASS': return 'LOW';
      default: return 'INFO';
    }
  }

  /**
   * Generate summary statistics for the evidence package
   */
  generateEvidenceSummary(records, complianceResult) {
    const bySeverity = { HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const byField = {};
    const byRule = {};

    records.forEach(r => {
      bySeverity[r.severity]++;
      byField[r.field] = (byField[r.field] || 0) + 1;
      if (r.ruleId) byRule[r.ruleId] = (byRule[r.ruleId] || 0) + 1;
    });

    return {
      totalRecords: records.length,
      bySeverity,
      topFields: Object.entries(byField).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ field: k, count: v })),
      topRules: Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ ruleId: k, count: v })),
      highConfidenceCount: records.filter(r => r.confidence >= 0.90).length,
      requiresInspectorReview: records.filter(r => r.severity === 'MEDIUM').length,
    };
  }

  /**
   * Get instructions for the browser to generate crops
   */
  getEvidenceInstructions() {
    return {
      browser_rendering: 'Use HTML5 Canvas to crop regions from the original image using cropRegion coordinates',
      library_required: 'None — pure Canvas API',
      example_code: `
// Example: Generate crop from evidence record
function generateCrop(imageElement, evidenceRecord) {
  const { cropRegion } = evidenceRecord;
  const canvas = document.createElement('canvas');
  canvas.width = cropRegion.width;
  canvas.height = cropRegion.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    imageElement,
    cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height,
    0, 0, cropRegion.width, cropRegion.height
  );
  return canvas.toDataURL('image/png');
}
      `.trim(),
    };
  }
}

module.exports = { EvidenceGenerator };
