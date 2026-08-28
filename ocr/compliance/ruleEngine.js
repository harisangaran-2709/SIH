/**
 * compliance/ruleEngine.js
 * -------------------------
 * Legal Metrology rule validation engine
 * Validates extracted fields against 2011-baseline rules
 */

const { RuleDatabase } = require('./ruleDatabase');

/**
 * Rule engine class
 */
class RuleEngine {
  constructor() {
    this.ruleDb = new RuleDatabase();
  }

  /**
   * Run Phase 1 compliance checks only (image-verifiable, no calibration)
   * @param {Object} fields - Extracted fields
   * @param {Object} product - Product classification
   * @param {Object} packageType - Package classification
   * @param {Array} detections - Original OCR detections
   * @returns {Object} Compliance results
   */
  runPhase1Checks(fields, product, packageType, detections) {
    const results = [];
    const findings = [];
    const declarations = {};

    // Check mandatory declarations (Rule 6)
    this.checkManufacturerPackerImporter(fields, results, declarations, findings);
    this.checkProductName(fields, results, declarations, findings);
    this.checkNetQuantity(fields, results, declarations, findings);
    this.checkManufacturingDate(fields, results, declarations, findings);
    this.checkMRP(fields, results, declarations, findings);
    this.checkConsumerCare(fields, results, declarations, findings);

    // Check visual/legibility (Rule 9)
    const visualChecks = this.checkVisualQuality(detections);

    // Check quantity format (Rule 12)
    this.checkQuantityExpression(fields, results, findings);

    // Check units (Rule 13)
    this.checkUnits(fields, results, findings);

    // Phase 2: Product-aware checks (Rule 5, Second Schedule, Rules 14-17, 24-26, Fourth Schedule)
    this.checkManufacturerDifferentFromPacker(fields, results, declarations, findings);
    this.checkFoodDeclarations(fields, product, results, declarations, findings);
    this.checkCommoditySpecificRules(fields, product, results, findings);

    // Phase 3: Physical inspection (Rules 19, 21-22) — always REVIEW without calibration
    this.checkPhysicalInspectionRules(fields, results, findings);

    // Phase 4: Enforcement/registry (Rules 27-30, 20) — always REVIEW, inspector verifies
    this.checkEnforcementRegistryRules(fields, product, results, findings);

    return {
      ruleResults: results,
      findings,
      declarations,
      visualChecks,
    };
  }

  /**
   * Check manufacturer/packer/importer (Rule 6.1)
   */
  checkManufacturerPackerImporter(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_01');
    const manufacturer = fields.manufacturer;
    const packer = fields.packer;
    const importer = fields.importer;

    // At least one must be present
    const hasAny = manufacturer?.status === 'DETECTED' ||
                   packer?.status === 'DETECTED' ||
                   importer?.status === 'DETECTED';

    const detected = hasAny;
    const status = hasAny ? 'PASS' : 'FAIL';
    const confidence = Math.max(
      manufacturer?.confidence || 0,
      packer?.confidence || 0,
      importer?.confidence || 0
    );

    declarations.manufacturer = {
      field: 'manufacturer',
      required: true,
      detected,
      value: manufacturer?.value || packer?.value || importer?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_01',
      reason: hasAny ? 'At least one entity detected' : 'No manufacturer/packer/importer detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of manufacturer/packer/importer name and address',
      input: { manufacturer: manufacturer?.value, packer: packer?.value, importer: importer?.value },
      expected: 'At least one of manufacturer/packer/importer with address',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.manufacturer.reason,
    });

    if (!hasAny) {
      findings.push(this.createFinding('PCR_R6_01', 'FAIL', 'manufacturer', null,
        'Manufacturer/Packer/Importer name and address', confidence));
    }
  }

  /**
   * Check product name (Rule 6.3)
   */
  checkProductName(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_03');
    const productName = fields.productName;

    const detected = productName?.status === 'DETECTED';
    const status = detected ? 'PASS' : 'FAIL';
    const confidence = productName?.confidence || 0;

    declarations.productName = {
      field: 'productName',
      required: true,
      detected,
      value: productName?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_03',
      reason: detected ? 'Product name detected' : 'Product name not detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of common or generic name',
      input: productName?.value,
      expected: 'Common or generic name of commodity',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.productName.reason,
    });

    if (!detected) {
      findings.push(this.createFinding('PCR_R6_03', 'FAIL', 'productName', null,
        'Common or generic name of commodity', confidence));
    }
  }

  /**
   * Check net quantity (Rule 6.4)
   */
  checkNetQuantity(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_04');
    const netQuantity = fields.netQuantity;

    const detected = netQuantity?.status === 'DETECTED';
    const status = detected ? 'PASS' : 'FAIL';
    const confidence = netQuantity?.confidence || 0;

    declarations.netQuantity = {
      field: 'netQuantity',
      required: true,
      detected,
      value: netQuantity?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_04',
      reason: detected ? 'Net quantity detected' : 'Net quantity not detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of net quantity declaration',
      input: netQuantity?.normalizedValue,
      expected: 'Net quantity in weight, measure or number',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.netQuantity.reason,
    });

    if (!detected) {
      findings.push(this.createFinding('PCR_R6_04', 'FAIL', 'netQuantity', null,
        'Net quantity in terms of weight, measure or number', confidence));
    }
  }

  /**
   * Check manufacturing/packing date (Rule 6.5)
   */
  checkManufacturingDate(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_05');
    const mfgDate = fields.mfgDate;
    const packingDate = fields.packingDate;

    const detected = mfgDate?.status === 'DETECTED' || packingDate?.status === 'DETECTED';
    const status = detected ? 'PASS' : 'FAIL';
    const confidence = Math.max(mfgDate?.confidence || 0, packingDate?.confidence || 0);

    declarations.date = {
      field: 'date',
      required: true,
      detected,
      value: mfgDate?.value || packingDate?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_05',
      reason: detected ? 'Manufacturing/packing date detected' : 'No date detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of manufacturing/packing date',
      input: { mfgDate: mfgDate?.value, packingDate: packingDate?.value },
      expected: 'Month and year of manufacture/packing/import',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.date.reason,
    });

    if (!detected) {
      findings.push(this.createFinding('PCR_R6_05', 'FAIL', 'date', null,
        'Month and year of manufacture/packing/import', confidence));
    }
  }

  /**
   * Check MRP (Rule 6.6)
   */
  checkMRP(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_06');
    const mrp = fields.mrp;

    const detected = mrp?.status === 'DETECTED';
    let status = 'PASS';

    if (!detected) {
      status = 'FAIL';
    } else if (mrp.status === 'AMBIGUOUS') {
      status = 'REVIEW';
    } else if (mrp.status === 'LOW_CONFIDENCE') {
      status = 'REVIEW';
    }

    const confidence = mrp?.confidence || 0;

    declarations.mrp = {
      field: 'mrp',
      required: true,
      detected,
      value: mrp?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_06',
      reason: detected ? 'MRP detected' : 'MRP not detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of MRP declaration',
      input: mrp?.normalizedValue,
      expected: 'Retail sale price inclusive of all taxes',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.mrp.reason,
    });

    if (status === 'FAIL') {
      findings.push(this.createFinding('PCR_R6_06', 'FAIL', 'mrp', null,
        'Retail sale price (MRP) inclusive of all taxes', confidence));
    } else if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_06', 'REVIEW', 'mrp', mrp?.value,
        'MRP detected but requires verification', confidence));
    }
  }

  /**
   * Check consumer care (Rule 6.10)
   */
  checkConsumerCare(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_10');
    const consumerCare = fields.consumerCare;

    const detected = consumerCare?.status === 'DETECTED';
    const status = detected ? 'PASS' : 'FAIL';
    const confidence = consumerCare?.confidence || 0;

    declarations.consumerCare = {
      field: 'consumerCare',
      required: true,
      detected,
      value: consumerCare?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_10',
      reason: detected ? 'Consumer care details detected' : 'Consumer care details not detected',
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Presence of customer care details',
      input: consumerCare?.value,
      expected: 'Customer care contact details',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: declarations.consumerCare.reason,
    });

    if (!detected) {
      findings.push(this.createFinding('PCR_R6_10', 'FAIL', 'consumerCare', null,
        'Customer care contact details', confidence));
    }
  }

  /**
   * Check visual quality (Rule 9)
   */
  checkVisualQuality(detections) {
    const visualChecks = {};

    // Legibility check (Rule 9.1) - based on OCR confidence
    const avgConfidence = detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
    const lowConfidenceCount = detections.filter(d => d.confidence < 0.75).length;

    visualChecks.legibility = {
      check: 'legibility',
      status: avgConfidence >= 0.75 ? 'PASS' : lowConfidenceCount > 3 ? 'FAIL' : 'REVIEW',
      details: `Average OCR confidence: ${(avgConfidence * 100).toFixed(1)}%, Low confidence detections: ${lowConfidenceCount}`,
      confidence: avgConfidence,
      ruleId: 'PCR_R9_01',
    };

    // Contrast check (Rule 9.2) - placeholder (requires image analysis)
    visualChecks.contrast = {
      check: 'contrast',
      status: 'REVIEW',
      details: 'Contrast analysis requires image processing',
      confidence: 0.5,
      ruleId: 'PCR_R9_02',
    };

    // Principal display panel (Rule 7.1) - placeholder
    visualChecks.principalDisplayPanel = {
      check: 'principalDisplayPanel',
      status: 'REVIEW',
      details: 'Principal display panel identification requires layout analysis',
      confidence: 0.5,
      ruleId: 'PCR_R7_01',
    };

    // Font height (Rule 7.2, 7.4) - requires calibration
    visualChecks.fontHeight = {
      check: 'fontHeight',
      status: 'REVIEW',
      details: 'Font height measurement requires camera calibration',
      confidence: 0,
      ruleId: 'PCR_R7_02',
    };

    return visualChecks;
  }

  /**
   * Check quantity expression (Rule 12)
   */
  checkQuantityExpression(fields, results, findings) {
    const rule = this.ruleDb.getRule('PCR_R12_01');
    const netQuantity = fields.netQuantity;

    if (!netQuantity || netQuantity.status !== 'DETECTED') {
      return; // Already handled by Rule 6.4
    }

    const text = netQuantity.value.toLowerCase();
    const prohibited = ['approximately', 'about', 'minimum', 'not less than', 'approx'];
    const hasProhibited = prohibited.some(term => text.includes(term));

    const status = hasProhibited ? 'FAIL' : 'PASS';
    const confidence = netQuantity.confidence;

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Quantity expression format',
      input: netQuantity.value,
      expected: 'Exact quantity without approximations',
      confidence,
      status,
      legalReference: rule.legal_reference,
      reason: hasProhibited ? 'Contains prohibited approximation terms' : 'Proper quantity expression',
    });

    if (hasProhibited) {
      findings.push(this.createFinding('PCR_R12_01', 'FAIL', 'netQuantity', netQuantity.value,
        'Quantity must not use approximation terms', confidence));
    }
  }

  /**
   * Check units (Rule 13)
   */
  checkUnits(fields, results, findings) {
    const rule = this.ruleDb.getRule('PCR_R13_01');
    const netQuantity = fields.netQuantity;

    if (!netQuantity || netQuantity.status !== 'DETECTED' || !netQuantity.normalizedValue) {
      return;
    }

    const qty = netQuantity.normalizedValue;
    const permittedUnits = ['kg', 'g', 'l', 'ml', 'pieces', 'nos'];
    const unitValid = permittedUnits.includes(qty.unit);

    let status = 'PASS';
    let reason = 'Valid unit';

    if (!unitValid) {
      status = 'FAIL';
      reason = `Non-standard unit: ${qty.unit}`;
    } else {
      // Check unit rules (e.g., < 1kg should be in grams)
      if (qty.unit === 'kg' && qty.value < 1) {
        status = 'REVIEW';
        reason = 'Quantity less than 1 kg should preferably be in grams';
      } else if (qty.unit === 'l' && qty.value < 1) {
        status = 'REVIEW';
        reason = 'Quantity less than 1 litre should preferably be in millilitres';
      }
    }

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Unit validation',
      input: qty,
      expected: 'Standard SI units',
      confidence: netQuantity.confidence,
      status,
      legalReference: rule.legal_reference,
      reason,
    });

    if (status === 'FAIL') {
      findings.push(this.createFinding('PCR_R13_01', 'FAIL', 'netQuantity', netQuantity.value,
        'Non-standard unit used', netQuantity.confidence));
    }
  }

  /**
   * Phase 2: Check if manufacturer differs from packer (Rule 5)
   */
  checkManufacturerDifferentFromPacker(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R5_01');
    if (!rule) return;

    const manufacturer = fields.manufacturer?.value || null;
    const packer = fields.packer?.value || null;

    const hasBoth = manufacturer && packer;
    const different = hasBoth && manufacturer !== packer;
    const status = different ? 'REVIEW' : (hasBoth ? 'PASS' : 'NOT_APPLICABLE');

    // If different, needs explicit declaration — but from image we can only see they exist
    declarations.manufacturerPackerDistinction = {
      field: 'manufacturer/packer',
      required: false,
      detected: hasBoth,
      value: { manufacturer, packer },
      confidence: Math.max(fields.manufacturer?.confidence || 0, fields.packer?.confidence || 0),
      status,
      ruleId: 'PCR_R5_01',
      reason: different
        ? 'Manufacturer and packer appear different — verify declaration explicitly states both or one'
        : (hasBoth ? 'Both present' : 'Only one present — rule 5 applies when different'),
    };

    results.push({
      ruleId: rule.rule_id,
      source: rule.source,
      rule: rule.rule,
      title: rule.title,
      category: rule.category,
      check: 'Manufacturer ≠ Packer declaration',
      input: { manufacturer, packer },
      expected: 'Explicit declaration when different',
      confidence: Math.max(fields.manufacturer?.confidence || 0, fields.packer?.confidence || 0),
      status,
      legalReference: rule.legal_reference,
      reason: declarations.manufacturerPackerDistinction.reason,
    });
  }

  /**
   * Phase 2: Food declarations (Second Schedule)
   */
  checkFoodDeclarations(fields, product, results, declarations, findings) {
    const isFood = product?.isFood === true;
    if (!isFood) return;

    // Second Schedule rules — many require inspector verification (ingredients, nutrition)
    const rules = [
      { id: 'PCR_2SCH_01', title: 'Food product name and trade name', input: fields.productName, required: true },
      { id: 'PCR_2SCH_02', title: 'List of ingredients', required: true, reviewOnly: true },
      { id: 'PCR_2SCH_04', title: 'Veg/Non-Veg symbol', required: true, reviewOnly: true },
      { id: 'PCR_2SCH_07', title: 'Batch/Lot identification', input: fields.batchNumber, required: true },
      { id: 'PCR_2SCH_08', title: 'Date of manufacture/packing', input: fields.mfgDate || fields.packingDate, required: true },
    ];

    rules.forEach(r => {
      const rule = this.ruleDb.getRule(r.id);
      if (!rule) return;
      const detected = r.required && r.input && r.input.status === 'DETECTED';
      const status = r.reviewOnly ? 'REVIEW' : (detected ? 'PASS' : 'FAIL');

      results.push({
        ruleId: r.id,
        source: rule.source,
        rule: rule.rule,
        title: r.title,
        category: rule.category,
        check: r.title,
        input: r.input?.value || null,
        expected: r.required ? 'Required declaration' : 'Optional/conditional',
        confidence: r.input?.confidence || 0.5,
        status,
        legalReference: rule.legal_reference,
        reason: r.reviewOnly
          ? 'Requires inspector verification — image alone cannot confirm ingredients, nutrition, veg/non-veg symbol'
          : (detected ? 'Detected from OCR' : 'Not detected'),
      });
    });
  }

  /**
   * Phase 2: Commodity-specific rules (Fourth Schedule, 14-17)
   */
  checkCommoditySpecificRules(fields, product, results, findings) {
    if (!product?.category) return;

    // Rule 14 — liquid commodities check
    const liquidRule = this.ruleDb.getRule('PCR_R14_01');
    if (liquidRule) {
      const qty = fields.netQuantity?.normalizedValue;
      const isLiquid = qty && (qty.unit === 'l' || qty.unit === 'ml');
      results.push({
        ruleId: 'PCR_R14_01',
        source: liquidRule.source,
        rule: liquidRule.rule,
        title: liquidRule.title,
        category: liquidRule.category,
        check: 'Liquid commodity volume declaration',
        input: qty,
        expected: 'Volume in l or ml',
        confidence: fields.netQuantity?.confidence || 0,
        status: isLiquid ? 'PASS' : 'NOT_APPLICABLE',
        legalReference: liquidRule.legal_reference,
        reason: isLiquid ? 'Liquid declared correctly' : 'Not liquid commodity',
      });
    }

    // Rule 16 — count declaration
    const countRule = this.ruleDb.getRule('PCR_R16_01');
    if (countRule) {
      const qty = fields.netQuantity?.normalizedValue;
      const isCount = qty && qty.unit === 'pieces';
      results.push({
        ruleId: 'PCR_R16_01',
        source: countRule.source,
        rule: countRule.rule,
        title: countRule.title,
        category: countRule.category,
        check: 'Count declaration',
        input: qty,
        expected: 'Count declared when sold by number',
        confidence: fields.netQuantity?.confidence || 0,
        status: isCount ? 'PASS' : 'NOT_APPLICABLE',
        legalReference: countRule.legal_reference,
        reason: isCount ? 'Count declared' : 'Not count-based',
      });
    }
  }

  /**
   * Phase 3: Physical inspection rules (19, 21-22, schedules)
   * Always REVIEW because they require calibrated measurement
   */
  checkPhysicalInspectionRules(fields, results, findings) {
    // Rules that ALWAYS need calibration — never claim PASS/FAIL from image alone
    const physicalRules = [
      { id: 'PCR_R19_01', title: 'MPE — quantity accuracy', category: 'physical_inspection', ref: 'Rule 19 & First Schedule' },
      { id: 'PCR_R21_01', title: 'Number of packages verification', category: 'physical_inspection', ref: 'Rule 21' },
      { id: 'PCR_R22_01', title: 'Verification of standard packages', category: 'physical_inspection', ref: 'Rule 22' },
      { id: 'PCR_5SCH_01', title: 'MPE for weight commodities', category: 'physical_inspection', ref: 'Fifth Schedule Part I' },
      { id: 'PCR_5SCH_02', title: 'MPE for volume commodities', category: 'physical_inspection', ref: 'Fifth Schedule Part II' },
      { id: 'PCR_1SCH_01', title: 'Standard net quantity', category: 'physical_inspection', ref: 'First Schedule' },
    ];

    physicalRules.forEach(r => {
      const rule = this.ruleDb.getRule(r.id);
      if (!rule) return;

      results.push({
        ruleId: r.id,
        source: rule.source,
        rule: rule.rule,
        title: r.title,
        category: r.category,
        check: r.title,
        input: fields.netQuantity?.normalizedValue || null,
        expected: 'Calibrated measurement required',
        confidence: 0,
        status: 'REVIEW',
        legalReference: r.ref,
        reason: 'Physical measurement requires calibrated instruments (MPE, reference standards). Image alone cannot determine quantity accuracy. Inspector verification required.',
      });

      // Add finding linking to quantity field
      findings.push({
        findingId: `F-PH-${r.id}-${Date.now()}`,
        ruleId: r.id,
        status: 'REVIEW',
        field: 'netQuantity',
        detectedText: fields.netQuantity?.value || null,
        expected: 'Calibrated verification of declared quantity',
        confidence: 0,
        imageId: 'unknown',
        inspectionTime: new Date().toISOString(),
        inspectorStatus: 'PENDING',
      });
    });
  }

  /**
   * Phase 4: Enforcement/Registry rules (20, 27-30)
   * Always REVIEW — never CONFIRMED_VIOLATION without inspector verification
   */
  checkEnforcementRegistryRules(fields, product, results, findings) {
    const registryRules = [
      { id: 'PCR_R20_01', title: 'Registration of packaged commodity', category: 'enforcement_registry' },
      { id: 'PCR_R27_01', title: 'Import permit', category: 'enforcement_registry' },
      { id: 'PCR_R28_01', title: 'Dealer obligations — verification', category: 'enforcement_registry' },
      { id: 'PCR_R29_01', title: 'Packer responsibility — accuracy', category: 'enforcement_registry' },
      { id: 'PCR_R30_01', title: 'Penalty provisions', category: 'enforcement_registry' },
    ];

    registryRules.forEach(r => {
      const rule = this.ruleDb.getRule(r.id);
      if (!rule) return;

      const isImport = fields.importer?.status === 'DETECTED';
      const shouldApply = (r.id === 'PCR_R27_01' && isImport) ||
                          (r.id !== 'PCR_R27_01');

      results.push({
        ruleId: r.id,
        source: rule.source,
        rule: rule.rule,
        title: r.title,
        category: r.category,
        check: r.title,
        input: null,
        expected: 'Registry/enforcement verification — inspector action',
        confidence: 0,
        status: shouldApply ? 'REVIEW' : 'NOT_APPLICABLE',
        legalReference: rule.legal_reference,
        reason: 'Enforcement/registry checks require access to government databases (registration numbers, import permits) and physical inspector verification. Never automated.',
      });

      if (shouldApply) {
        findings.push({
          findingId: `F-ENF-${r.id}-${Date.now()}`,
          ruleId: r.id,
          status: 'REVIEW',
          field: null,
          detectedText: null,
          expected: 'Inspector verification with registry access',
          confidence: 0,
          imageId: 'unknown',
          inspectionTime: new Date().toISOString(),
          inspectorStatus: 'PENDING',
        });
      }
    });
  }

  /**
   * Create a finding object
   */
  createFinding(ruleId, status, field, detectedText, expected, confidence) {
    return {
      findingId: `F-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId,
      status,
      field,
      detectedText,
      expected,
      confidence,
      imageId: 'unknown',
      inspectionTime: new Date().toISOString(),
      inspectorStatus: 'PENDING',
    };
  }
}

module.exports = { RuleEngine };
