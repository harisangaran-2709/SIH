/**
 * compliance/complianceManager.js
 * --------------------------------
 * Core orchestrator for the Legal Metrology Compliance Engine
 * Chains field extraction, classification, applicability, exemptions,
 * and the deterministic rule engine.
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
   * Run compliance analysis on OCR results
   * @param {Object} ocrResults - Raw OCR output from Express API/PaddleOCR
   * @returns {Object} Full compliance analysis response
   */
  async analyze(ocrResults) {
    try {
      const results = ocrResults.results || [];
      if (results.length === 0) {
        return this.createErrorResponse("No OCR results to analyze");
      }

      // Collect all detections across all images
      const allDetections = [];
      const imageMap = {};

      results.forEach(res => {
        imageMap[res.imageId] = res;
        res.detections.forEach(det => {
          allDetections.push({
            ...det,
            imageId: res.imageId,
          });
        });
      });

      // 1. Field Extraction
      const fields = this.extractor.extractFields(allDetections);

      // 2. Product and Package Classification
      const product = this.classifier.classifyProduct(fields);
      const packageType = this.classifier.classifyPackage(fields);

      // 3. Applicability Check (Rule 3)
      const applicability = this.checkApplicability(fields, product, packageType);

      // 4. Exemption Check (Rule 26)
      const exemption = this.checkExemptions(fields, product, packageType);

      // Initialize response structure
      let declarations = {};
      let visualChecks = {};
      let ruleResults = [];
      let findings = [];

      // 5. Execute Rule Engine (only if applicable and not exempt)
      if (applicability.chapterTwoApplies && !exemption.isExempt) {
        const engineResult = this.ruleEngine.runPhase1Checks(fields, product, packageType, allDetections);

        declarations = engineResult.declarations;
        visualChecks = engineResult.visualChecks;
        ruleResults = engineResult.ruleResults;
        findings = engineResult.findings;

        // Associate findings with bounding boxes and image IDs from fields
        findings.forEach(finding => {
          if (finding.field && fields[finding.field]) {
            const fieldData = fields[finding.field];
            if (fieldData.boundingBox) {
              finding.boundingBox = fieldData.boundingBox;
            }
            finding.imageId = results[0]?.imageId || 'unknown';
          }
        });
      } else {
        // Not applicable or exempt: populate all mandatory rules with NOT_APPLICABLE status
        const ruleDb = this.ruleEngine.ruleDb;
        const allRules = ruleDb.getPhase1Rules();

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
            reason: !applicability.chapterTwoApplies ?
              `Chapter II doesn't apply: ${applicability.reason}` :
              `Exempt: ${exemption.reason}`,
          });
        });
      }

      // Add camera calibration rule check
      this.addCalibrationCheck(ruleResults, findings);

      // 7. Generate Summary & Final Status
      const summary = this.calculateSummary(ruleResults);
      const finalStatus = this.determineFinalStatus(summary, applicability, exemption);

      // 6. Generate Evidence Package (with full OCR traceability) — needs summary/finalStatus
      const evidencePackage = this.evidenceGenerator.generateEvidence(
        { findings, declarations, summary, ruleResults, finalStatus },
        ocrResults
      );

      return {
        success: true,
        product,
        packageType,
        inspectionDate: new Date().toISOString(),
        ruleVersion: "2011-baseline",
        applicability,
        exemption,
        declarations,
        visualChecks,
        ruleResults,
        findings,
        evidence: evidencePackage,
        summary,
        finalStatus,
      };
    } catch (err) {
      console.error("[ComplianceManager] Analysis error:", err);
      return this.createErrorResponse(err.message);
    }
  }

  /**
   * Complete Applicability Check (Rule 3)
   */
  checkApplicability(fields, product, packageType) {
    const netQty = fields.netQuantity?.normalizedValue;

    // RULE: Packages containing more than 25 kg or 25 litres are excluded from Chapter II (except cement & fertilizers)
    if (netQty && (netQty.unit === 'kg' || netQty.unit === 'l')) {
      const isCement = product.category === 'cement';
      if (netQty.value > 25 && !isCement) {
        return {
          chapterTwoApplies: false,
          reason: `Quantity (${netQty.value} ${netQty.unit}) exceeds 25kg/litres limit under Rule 3`,
          confidence: fields.netQuantity.confidence,
          packQuantity: netQty,
        };
      }
    }

    // Industrial/Institutional consumer indicators
    if (packageType.type === 'industrial_package') {
      return {
        chapterTwoApplies: false,
        reason: "Industrial package is excluded under Rule 3(b)",
        confidence: packageType.confidence,
        packQuantity: netQty || undefined,
      };
    }

    if (packageType.type === 'institutional_package') {
      return {
        chapterTwoApplies: false,
        reason: "Institutional package is excluded under Rule 3(c)",
        confidence: packageType.confidence,
        packQuantity: netQty || undefined,
      };
    }

    return {
      chapterTwoApplies: true,
      reason: "Chapter II applies to standard retail packages",
      confidence: 0.9,
      packQuantity: netQty || undefined,
    };
  }

  /**
   * Exemption Check (Rule 26)
   */
  checkExemptions(fields, product, packageType) {
    const netQty = fields.netQuantity?.normalizedValue;

    // RULE 26 Exemptions:
    // 1. Packages < 10g or 10ml (except milk powder, baby food, etc.)
    if (netQty && (netQty.unit === 'g' || netQty.unit === 'ml')) {
      if (qtySavesExemption(netQty.value, product.category)) {
        return {
          isExempt: true,
          exemptionType: "small_package_exemption",
          reason: `Net quantity is ${netQty.value}${netQty.unit} (exempt under Rule 26 for small packages)`,
          ruleId: "PCR_R26_01",
        };
      }
    }

    // 2. Fast food packages, etc. (we mark as review if unclear)
    return {
      isExempt: false,
      exemptionType: null,
      reason: "No applicable exemptions detected under Rule 26",
    };
  }

  /**
   * Add camera calibration check (Rule 7)
   */
  addCalibrationCheck(ruleResults, findings) {
    // Height measurement always requires camera calibration
    ruleResults.push({
      ruleId: "PCR_R7_02",
      source: "Legal Metrology (Packaged Commodities) Rules, 2011",
      rule: "7",
      title: "Numeral height for quantity",
      category: "visual_font",
      check: "Numeral height",
      input: null,
      expected: "1mm to 6mm depending on package size",
      confidence: 0,
      status: "REVIEW",
      legalReference: "Rule 7(2)",
      reason: "Calibration unavailable. Cannot measure physical font height from uncalibrated image.",
    });

    findings.push({
      findingId: `F-CAL-${Date.now()}`,
      ruleId: "PCR_R7_02",
      status: "REVIEW",
      field: "netQuantity",
      detectedText: null,
      expected: "Camera calibration for physical dimensions",
      confidence: 0,
      imageId: "unknown",
      inspectionTime: new Date().toISOString(),
      inspectorStatus: "PENDING",
    });
  }

  /**
   * Helper to compute summary counts
   */
  calculateSummary(ruleResults) {
    const summary = { pass: 0, fail: 0, review: 0, notApplicable: 0 };
    ruleResults.forEach(res => {
      if (res.status === 'PASS') summary.pass++;
      else if (res.status === 'FAIL') summary.fail++;
      else if (res.status === 'REVIEW') summary.review++;
      else if (res.status === 'NOT_APPLICABLE') summary.notApplicable++;
    });
    return summary;
  }

  /**
   * Determine final status
   */
  determineFinalStatus(summary, applicability, exemption) {
    if (!applicability.chapterTwoApplies || exemption.isExempt) {
      return "PASS"; // Not applicable/exempt is legally compliant or out of scope
    }
    if (summary.fail > 0) {
      return "POTENTIAL_NON_COMPLIANCE";
    }
    if (summary.review > 0) {
      return "REVIEW";
    }
    return "PASS";
  }

  createErrorResponse(errorMsg) {
    return {
      success: false,
      error: errorMsg,
      summary: { pass: 0, fail: 0, review: 0, notApplicable: 0 },
      finalStatus: "REVIEW",
    };
  }
}

/**
 * Determine if a small quantity qualifies for exemption
 */
function qtySavesExemption(value, category) {
  if (value > 10) return false;
  // Milk powder, baby food, etc. are NOT exempt even if small
  const nonExemptCategories = ['milk_powder', 'baby_food', 'weaning_food'];
  return !nonExemptCategories.includes(category);
}

module.exports = { ComplianceManager };
