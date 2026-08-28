/**
 * compliance/complianceManager.js
 * --------------------------------
 * Core orchestrator for the Legal Metrology Compliance Engine.
 *
 * Correct pipeline:
 *   1. OCR detections → Field extraction + number classification
 *   2. Product classification
 *   3. Package classification
 *   4. Applicability check  (Rule 3)
 *   5. Exemption check      (Rule 26)
 *   6. Rule engine          (Phase 1 → 2 → 3 → 4)
 *   7. Evidence generation  (needs all above)
 *   8. Summary + Final status
 *
 * Critical rules:
 *   - Never map OCR missing → FAIL. Use NOT_DETECTED/NOT_VISIBLE → REVIEW.
 *   - NEVER emit CONFIRMED_VIOLATION without inspector.
 *   - Single-image MRP absent → NOT_VISIBLE → REVIEW, not FAIL.
 *   - Physical rules (Phase 3/4) → REVIEW only; never auto-PASS/FAIL.
 */

const { FieldExtractor } = require('./fieldExtractor');
const { ProductClassifier } = require('./productClassifier');
const { RuleEngine } = require('./ruleEngine');
const { EvidenceGenerator } = require('./evidenceGenerator');

class ComplianceManager {
  constructor() {
    this.extractor = new FieldExtractor();
    this.classifier = new ProductClassifier();
    this.ruleEngine = new RuleEngine();
    this.evidenceGenerator = new EvidenceGenerator();
  }

  /**
   * Analyze OCR results for legal metrology compliance.
   * @param {Object} ocrResults — raw OCR output from Express API/PaddleOCR
   * @returns {Object} Full compliance analysis response
   */
  async analyze(ocrResults) {
    try {
      const results = ocrResults.results || [];
      if (results.length === 0) {
        return this._errorResponse("No OCR results to analyze");
      }

      // ── Image Coverage Tracking ─────────────────────────────────────────
      const imageCoverage = this._trackImageCoverage(results);

      // Collect all detections across all images
      const allDetections = [];
      results.forEach(res => {
        res.detections.forEach(det => {
          allDetections.push({ ...det, imageId: res.imageId });
        });
      });

      // ── Step 1: Field Extraction (with number classification) ───────────
      const fields = this.extractor.extractFields(allDetections);

      // ── Step 2 & 3: Product + Package Classification ─────────────────────
      const product = this.classifier.classifyProduct(fields);
      const packageType = this.classifier.classifyPackage(fields);

      // ── Step 4: Applicability (Rule 3) — BEFORE declarations ─────────────
      const applicability = this._checkApplicability(fields, product, packageType);

      // ── Step 5: Exemption (Rule 26) — BEFORE declarations ──────────────
      const exemption = this._checkExemptions(fields, product, packageType);

      // ── Step 6: Run Rule Engine (only if applicable + not exempt) ────────
      let declarations = {};
      let visualChecks = {};
      let ruleResults = [];
      let findings = [];
      let groupedRules = [];

      if (applicability.chapterTwoApplies && !exemption.isExempt) {
        const engineResult = this.ruleEngine.runPhase1Checks(
          fields, product, packageType, allDetections
        );

        declarations  = engineResult.declarations;
        visualChecks = engineResult.visualChecks;
        ruleResults  = engineResult.ruleResults;
        findings      = engineResult.findings;
        groupedRules  = engineResult.groupedRules || [];

        // Attach image coverage + bbox to findings
        findings = this._enrichFindings(findings, fields, results);
      } else {
        // Not applicable or exempt — populate all rules as NOT_APPLICABLE
        const allRules = this.ruleEngine.ruleDb.getPhase1Rules();
        allRules.forEach(rule => {
          ruleResults.push({
            ruleId: rule.rule_id,
            source: rule.source,
            rule: rule.rule,
            title: rule.title,
            category: rule.category,
            check: rule.title,
            input: null,
            expected: rule.legal_reference,
            confidence: 1.0,
            status: "NOT_APPLICABLE",
            legalReference: rule.legal_reference,
            reason: !applicability.chapterTwoApplies
              ? `Chapter II doesn't apply: ${applicability.reason}`
              : `Exempt: ${exemption.reason}`,
          });
        });
      }

      // Add calibration check (Rule 7.2) — always REVIEW without calibration
      this._addCalibrationCheck(ruleResults, findings);

      // ── Step 7: Summary + Final Status ─────────────────────────────────
      const summary = this._calculateSummary(ruleResults);
      const finalStatus = this._determineFinalStatus(summary, applicability, exemption);

      // ── Step 8: Evidence Package (needs summary + finalStatus) ───────────
      const evidencePackage = this.evidenceGenerator.generateEvidence(
        { findings, declarations, summary, ruleResults, finalStatus, groupedRules, imageCoverage, product, packageType },
        ocrResults
      );

      return {
        success: true,
        product,
        packageType,
        imageCoverage,
        inspectionDate: new Date().toISOString(),
        ruleVersion: "2011-baseline",
        applicability,
        exemption,
        declarations,
        visualChecks,
        ruleResults,
        groupedRules,
        findings,
        evidence: evidencePackage,
        summary,
        finalStatus,
      };
    } catch (err) {
      console.error("[ComplianceManager] Analysis error:", err);
      return this._errorResponse(err.message);
    }
  }

  // ── Image Coverage Tracking ───────────────────────────────────────────────

  _trackImageCoverage(results) {
    // Infer surface from imageId
    const inferSurface = (imageId) => {
      const lower = (imageId || '').toLowerCase();
      if (/front|frontside|frontpanel/.test(lower)) return 'FRONT';
      if (/back|backside|backpanel|reverse/.test(lower)) return 'BACK';
      if (/left|leftside/.test(lower)) return 'LEFT';
      if (/right|rightside/.test(lower)) return 'RIGHT';
      if (/top|topside/.test(lower)) return 'TOP';
      if (/bottom|bottomside/.test(lower)) return 'BOTTOM';
      return 'UNKNOWN';
    };

    const surfaces = results.map(r => ({
      imageId: r.imageId,
      surface: inferSurface(r.imageId),
      width: r.width,
      height: r.height,
      detectionCount: r.detections.length,
    }));

    const surfaceTypes = [...new Set(surfaces.map(s => s.surface))];
    const multiSurface = surfaceTypes.length > 1;

    return {
      surfaces,
      surfaceTypes,
      surfaceCount: surfaces.length,
      multiSurface,
      surfacesCaptured: surfaceTypes.sort().join(', '),
      warning: !multiSurface
        ? 'Only 1 surface captured. MRP and other declarations may be on other sides. Inspector should verify all surfaces.'
        : null,
    };
  }

  // ── Applicability Check (Rule 3) ──────────────────────────────────────────

  _checkApplicability(fields, product, packageType) {
    const netQty = fields.netQuantity?.normalizedValue;

    // >25 kg or >25 L excludes Chapter II (except cement & fertilizers)
    if (netQty && (netQty.unit === 'kg' || netQty.unit === 'l')) {
      const isCement = product.category === 'cement';
      if (netQty.value > 25 && !isCement) {
        return {
          chapterTwoApplies: false,
          reason: `Quantity (${netQty.value} ${netQty.unit}) exceeds 25kg/litre — Rule 3 excludes large packages`,
          confidence: fields.netQuantity.confidence || 0.5,
          ruleId: 'PCR_R3_01',
        };
      }
    }

    if (packageType.type === 'industrial_package') {
      return {
        chapterTwoApplies: false,
        reason: "Industrial package — excluded under Rule 3(b)",
        confidence: packageType.confidence,
        ruleId: 'PCR_R3_01',
      };
    }

    if (packageType.type === 'institutional_package') {
      return {
        chapterTwoApplies: false,
        reason: "Institutional package — excluded under Rule 3(c)",
        confidence: packageType.confidence,
        ruleId: 'PCR_R3_01',
      };
    }

    return {
      chapterTwoApplies: true,
      reason: "Chapter II applies — standard retail package",
      confidence: 0.9,
      ruleId: 'PCR_R3_01',
    };
  }

  // ── Exemption Check (Rule 26) ─────────────────────────────────────────────

  _checkExemptions(fields, product, packageType) {
    const netQty = fields.netQuantity?.normalizedValue;

    // Small packages < 10g or < 10ml exempt (except milk powder, baby food)
    if (netQty && (netQty.unit === 'g' || netQty.unit === 'ml')) {
      if (this._qtyExempts(netQty.value, product.category)) {
        return {
          isExempt: true,
          exemptionType: "small_package_exemption",
          reason: `Net quantity ${netQty.value}${netQty.unit} — exempt under Rule 26`,
          ruleId: 'PCR_R26_01',
        };
      }
    }

    return {
      isExempt: false,
      exemptionType: null,
      reason: "No exemption applies",
      ruleId: null,
    };
  }

  _qtyExempts(value, category) {
    if (value > 10) return false;
    const nonExempt = ['milk_powder', 'baby_food', 'weaning_food', 'infant_formula'];
    return !nonExempt.includes(category);
  }

  // ── Enrich Findings with Traceability ───────────────────────────────────

  _enrichFindings(findings, fields, ocrResults) {
    return findings.map(finding => {
      if (finding.field && fields[finding.field]?.boundingBox) {
        finding.boundingBox = fields[finding.field].boundingBox;
      }
      if (finding.field && fields[finding.field]?.sourceDetectionIds?.length) {
        finding.sourceDetectionIds = fields[finding.field].sourceDetectionIds;
      }
      // Add WHY explanation
      finding.whyResult = this._buildWhyExplanation(finding, fields);
      finding.imageId = ocrResults[0]?.imageId || 'unknown';
      finding.inspectionTime = new Date().toISOString();
      finding.inspectorStatus = finding.inspectorStatus || 'PENDING';
      return finding;
    });
  }

  /**
   * Build WHY THIS RESULT explanation for a finding.
   */
  _buildWhyExplanation(finding, fields) {
    const { ruleId, field, status, detectedText, confidence } = finding;

    const rule = this.ruleEngine.ruleDb.getRule(ruleId);
    const fieldData = field ? fields[field] : null;

    let detectedEvidence = null;
    let expectedCondition = null;
    let reason = '';
    let recommendedAction = '';

    // Build per-field WHY explanations
    switch (field) {
      case 'netQuantity':
        detectedEvidence = fieldData?.value || detectedText || 'No quantity declaration detected';
        expectedCondition = 'A number with a weight/volume unit (e.g. "500 g", "1 kg", "250 ml")';
        if (fieldData?.notUsedNumbers?.length) {
          reason = `Other numbers on the label were classified as: ${
            [...new Set(fieldData.notUsedNumbers.map(n => n.type))].join(', ')
          }. These were excluded as they are not quantity declarations.`;
        }
        recommendedAction = 'Ensure the net quantity appears with its unit (e.g. "Net Qty: 500 g").';
        break;

      case 'mrp':
        detectedEvidence = fieldData?.status === 'NOT_VISIBLE'
          ? 'MRP not found on photographed surface'
          : (fieldData?.value || 'No MRP declaration detected');
        expectedCondition = 'MRP must be clearly marked on the package (Rule 6.6)';
        if (fieldData?.status === 'NOT_VISIBLE') {
          reason = 'Only one package surface was photographed. MRP may be on another side.';
          recommendedAction = 'Photograph all surfaces of the package. If MRP is absent from all sides, it is a violation.';
        } else {
          reason = finding.reason || 'MRP not found in extracted text.';
          recommendedAction = 'Verify MRP is printed on the package in the format "MRP Rs. XX.XX".';
        }
        break;

      case 'manufacturingDate':
      case 'date':
        detectedEvidence = fieldData?.value || 'No date detected';
        expectedCondition = 'Month and year of manufacture (e.g. "MFG. DATE NOV. 2025")';
        reason = fieldData?.value
          ? `Date value extracted: ${fieldData.value}`
          : 'No MFG/MANUFACTURE/EXP/EXPIRY label pattern found near a date.';
        recommendedAction = 'Ensure manufacturing and expiry dates are clearly printed with their labels.';
        break;

      case 'consumerCare':
        detectedEvidence = fieldData?.value || 'No customer care details found';
        expectedCondition = 'Customer care phone number, email or address (Rule 6.10)';
        reason = fieldData?.detectedLabel
          ? `Found "${fieldData.detectedLabel}" label but no associated contact details.`
          : 'No "CUSTOMER CARE" / "HELPLINE" / "CONSUMER CARE" label found.';
        recommendedAction = 'Ensure customer care details are printed near the CUSTOMER CARE label.';
        break;

      case 'batchNumber':
        detectedEvidence = fieldData?.value || 'No batch/lot number found';
        expectedCondition = 'Batch or lot number (Second Schedule, Rule 7)';
        reason = 'No BATCH/LOT label near a batch identifier found.';
        recommendedAction = 'Ensure the batch/lot number is printed on the package.';
        break;

      default:
        detectedEvidence = detectedText || fieldData?.value || 'No evidence';
        expectedCondition = rule?.legal_reference || 'See applicable rule';
        reason = finding.reason || `Rule ${ruleId} could not be satisfied from image.`;
        recommendedAction = 'Verify this declaration is present on the package.';
    }

    // Adjust reason by status
    if (status === 'REVIEW') {
      reason = reason || 'Evidence is insufficient to determine compliance. Inspector verification required.';
    }

    return {
      ruleId,
      ruleTitle: rule?.title || ruleId,
      legalReference: rule?.legal_reference || null,
      field,
      status,
      detectedEvidence,
      expectedCondition,
      reason,
      recommendedAction,
      confidence: confidence || fieldData?.confidence || 0,
    };
  }

  // ── Calibration Check (Rule 7.2) ──────────────────────────────────────────

  _addCalibrationCheck(ruleResults, findings) {
    ruleResults.push({
      ruleId: "PCR_R7_02",
      source: "Legal Metrology (Packaged Commodities) Rules, 2011",
      rule: "7(2)",
      title: "Numeral height for quantity",
      category: "visual_font",
      check: "Numeral height",
      input: null,
      expected: "1mm to 6mm depending on package size",
      confidence: 0,
      status: "REVIEW",
      legalReference: "Rule 7(2)",
      reason: "Calibration unavailable. Cannot measure physical font height from an uncalibrated photograph.",
    });

    findings.push({
      findingId: `F-CAL-${Date.now()}`,
      ruleId: "PCR_R7_02",
      status: "REVIEW",
      field: "netQuantity",
      detectedText: null,
      expected: "Camera calibration for physical font measurement",
      confidence: 0,
      imageId: "unknown",
      inspectionTime: new Date().toISOString(),
      inspectorStatus: "PENDING",
      whyResult: {
        ruleId: "PCR_R7_02",
        ruleTitle: "Numeral height for quantity",
        legalReference: "Rule 7(2)",
        field: "netQuantity",
        status: "REVIEW",
        detectedEvidence: "Calibration not performed",
        expectedCondition: "Physical measurement of font height (1-6mm)",
        reason: "Font height requires a calibrated reference in the image (e.g., a known-size object). Without calibration, the system cannot determine physical dimensions.",
        recommendedAction: "Use a calibrated camera setup or reference object. Inspector should measure font height with calipers.",
        confidence: 0,
      },
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  _calculateSummary(ruleResults) {
    const summary = { compliant: 0, nonCompliant: 0, review: 0, notApplicable: 0 };
    ruleResults.forEach(res => {
      switch (res.status) {
        case 'PASS':           summary.compliant++;    break;
        case 'FAIL':           summary.nonCompliant++; break;
        case 'REVIEW':         summary.review++;      break;
        case 'NOT_APPLICABLE': summary.notApplicable++; break;
      }
    });
    return summary;
  }

  // ── Final Status ─────────────────────────────────────────────────────────

  _determineFinalStatus(summary, applicability, exemption) {
    if (!applicability.chapterTwoApplies) return "NOT_APPLICABLE";
    if (exemption.isExempt) return "COMPLIANT";  // exempt = compliant by law

    // If there are any FAIL findings, flag as potential non-compliance
    if (summary.nonCompliant > 0) return "POTENTIAL_NON_COMPLIANCE";

    // If there are REVIEW items, inspector must verify
    if (summary.review > 0) return "REVIEW";

    return "COMPLIANT";
  }

  // ── Error Response ───────────────────────────────────────────────────────

  _errorResponse(errorMsg) {
    return {
      success: false,
      error: errorMsg,
      summary: { compliant: 0, nonCompliant: 0, review: 0, notApplicable: 0 },
      finalStatus: "REVIEW",
    };
  }
}

module.exports = { ComplianceManager };
