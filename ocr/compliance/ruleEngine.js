/**
 * compliance/ruleEngine.js
 * -------------------------
 * Legal Metrology rule validation engine
 * Validates extracted fields against 2011-baseline rules
 *
 * Critical semantics:
 *   - NOT_DETECTED (field absent from all surfaces) → REVIEW
 *   - NOT_VISIBLE (single-surface photo, field not on this surface) → REVIEW
 *   - AMBIGUOUS / LOW_CONFIDENCE → REVIEW
 *   - DETECTED → evaluate rule (PASS/FAIL/REVIEW)
 *   - Phase 3/4 rules (physical/enforcement) → always REVIEW, grouped into single cards
 *   - Never auto-FAIL for missing evidence; inspector verifies
 */

const { RuleDatabase } = require('./ruleDatabase');

class RuleEngine {
  constructor() {
    this.ruleDb = new RuleDatabase();
  }

  /**
   * Run Phase 1 compliance checks
   * @param {Object} fields - Extracted fields with status: DETECTED/NOT_DETECTED/NOT_VISIBLE/AMBIGUOUS/LOW_CONFIDENCE
   * @param {Object} product - Product classification
   * @param {Object} packageType - Package classification
   * @param {Array} detections - Original OCR detections
   * @returns {Object} Compliance results with groupedRules for UI
   */
  runPhase1Checks(fields, product, packageType, detections) {
    const results = [];
    const findings = [];
    const declarations = {};

    // Phase 1: Mandatory declarations (Rule 6)
    this.checkManufacturerPackerImporter(fields, results, declarations, findings);
    this.checkProductName(fields, results, declarations, findings);
    this.checkNetQuantity(fields, results, declarations, findings);
    this.checkManufacturingDate(fields, results, declarations, findings);
    this.checkMRP(fields, results, declarations, findings);
    this.checkConsumerCare(fields, results, declarations, findings);

    // Visual/legibility (Rule 9)
    const visualChecks = this.checkVisualQuality(detections);

    // Quantity format (Rule 12)
    this.checkQuantityExpression(fields, results, findings);

    // Units (Rule 13)
    this.checkUnits(fields, results, findings);

    // Phase 2: Product-aware checks (Rule 5, Second Schedule, Rules 14-17)
    this.checkManufacturerDifferentFromPacker(fields, results, declarations, findings);
    this.checkFoodDeclarations(fields, product, results, declarations, findings);
    this.checkCommoditySpecificRules(fields, product, results, findings);

    // Phase 3 & 4: Physical/enforcement — ALWAYS REVIEW, grouped
    const groupedRules = this.createGroupedPhysicalEnforcementChecks(fields, product);

    // Add grouped rules to results (for summary counts)
    groupedRules.forEach(group => {
      group.rules.forEach(rule => results.push(rule));
    });

    return {
      ruleResults: results,
      findings,
      declarations,
      visualChecks,
      groupedRules,
    };
  }

  // ── Phase 1: Mandatory Declarations ────────────────────────────────────────

  checkManufacturerPackerImporter(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_01');
    const manufacturer = fields.manufacturer;
    const packer = fields.packer;
    const importer = fields.importer;

    const hasAny = manufacturer?.status === 'DETECTED' ||
                   packer?.status === 'DETECTED' ||
                   importer?.status === 'DETECTED';

    // Check if any is NOT_VISIBLE (single surface photo)
    const anyNotVisible = [manufacturer, packer, importer].some(f => f?.status === 'NOT_VISIBLE');

    let status = 'PASS';
    let reason = 'At least one entity detected';

    if (!hasAny) {
      if (anyNotVisible) {
        status = 'REVIEW';
        reason = 'Manufacturer/Packer/Importer not visible on photographed surface. Inspector should verify all surfaces.';
      } else {
        status = 'REVIEW';
        reason = 'No manufacturer/packer/importer detected. Inspector verification required.';
      }
    }

    const confidence = Math.max(
      manufacturer?.confidence || 0,
      packer?.confidence || 0,
      importer?.confidence || 0
    );

    declarations.manufacturer = {
      field: 'manufacturer',
      required: true,
      detected: hasAny,
      value: manufacturer?.value || packer?.value || importer?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_01',
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_01', 'REVIEW', 'manufacturer', null,
        'Manufacturer/Packer/Importer name and address', confidence, reason));
    }
  }

  checkProductName(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_03');
    const productName = fields.productName;

    const detected = productName?.status === 'DETECTED';
    let status = detected ? 'PASS' : 'REVIEW';
    let reason = detected ? 'Product name detected' : 'Product name not detected — inspector verification required';

    if (productName?.status === 'NOT_VISIBLE') {
      status = 'REVIEW';
      reason = 'Product name not visible on photographed surface';
    }

    const confidence = productName?.confidence || 0;

    declarations.productName = {
      field: 'productName',
      required: true,
      detected,
      value: productName?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_03',
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_03', 'REVIEW', 'productName', null,
        'Common or generic name of commodity', confidence, reason));
    }
  }

  checkNetQuantity(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_04');
    const netQuantity = fields.netQuantity;

    const detected = netQuantity?.status === 'DETECTED';
    let status = detected ? 'PASS' : 'REVIEW';
    let reason = detected ? 'Net quantity detected' : 'Net quantity not detected — inspector verification required';

    if (netQuantity?.status === 'NOT_VISIBLE') {
      status = 'REVIEW';
      reason = 'Net quantity not visible on photographed surface';
    } else if (netQuantity?.status === 'AMBIGUOUS') {
      status = 'REVIEW';
      reason = 'Multiple quantity candidates detected — inspector should verify the correct net quantity declaration';
    } else if (netQuantity?.status === 'LOW_CONFIDENCE') {
      status = 'REVIEW';
      reason = 'Low confidence extraction — inspector verification required';
    }

    const confidence = netQuantity?.confidence || 0;

    declarations.netQuantity = {
      field: 'netQuantity',
      required: true,
      detected,
      value: netQuantity?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_04',
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_04', 'REVIEW', 'netQuantity', netQuantity?.value,
        'Net quantity in terms of weight, measure or number', confidence, reason));
    }
  }

  checkManufacturingDate(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_05');
    const mfgDate = fields.mfgDate;
    const packingDate = fields.packingDate;

    const detected = mfgDate?.status === 'DETECTED' || packingDate?.status === 'DETECTED';
    let status = detected ? 'PASS' : 'REVIEW';
    let reason = detected ? 'Manufacturing/packing date detected' : 'No date detected — inspector verification required';

    if (!detected && (mfgDate?.status === 'NOT_VISIBLE' || packingDate?.status === 'NOT_VISIBLE')) {
      status = 'REVIEW';
      reason = 'Date not visible on photographed surface';
    } else if (!detected && (mfgDate?.status === 'AMBIGUOUS' || packingDate?.status === 'AMBIGUOUS')) {
      status = 'REVIEW';
      reason = 'Multiple date patterns detected — inspector should verify manufacturing/packing date';
    }

    const confidence = Math.max(mfgDate?.confidence || 0, packingDate?.confidence || 0);

    declarations.date = {
      field: 'date',
      required: true,
      detected,
      value: mfgDate?.value || packingDate?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_05',
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_05', 'REVIEW', 'date', mfgDate?.value || packingDate?.value,
        'Month and year of manufacture/packing/import', confidence, reason));
    }
  }

  checkMRP(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_06');
    const mrp = fields.mrp;

    const detected = mrp?.status === 'DETECTED';
    let status = detected ? 'PASS' : 'REVIEW';
    let reason = detected ? 'MRP detected' : 'MRP not detected';

    // NOT_VISIBLE is the critical case: single-surface photo, MRP on other side → REVIEW not FAIL
    if (mrp?.status === 'NOT_VISIBLE') {
      status = 'REVIEW';
      reason = 'MRP not found on photographed surface. Inspector should photograph all sides and verify MRP is present.';
    } else if (mrp?.status === 'AMBIGUOUS') {
      status = 'REVIEW';
      reason = 'Multiple price values detected — inspector should verify the correct MRP declaration';
    } else if (mrp?.status === 'LOW_CONFIDENCE') {
      status = 'REVIEW';
      reason = 'Low confidence MRP extraction — inspector verification required';
    } else if (!detected) {
      status = 'REVIEW';
      reason = 'MRP not detected from OCR — inspector verification required';
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
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_06', 'REVIEW', 'mrp', mrp?.value,
        'Retail sale price (MRP) inclusive of all taxes', confidence, reason));
    }
  }

  checkConsumerCare(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R6_10');
    const consumerCare = fields.consumerCare;

    const detected = consumerCare?.status === 'DETECTED';
    let status = detected ? 'PASS' : 'REVIEW';
    let reason = detected ? 'Consumer care details detected' : 'Consumer care details not detected — inspector verification required';

    if (consumerCare?.status === 'NOT_VISIBLE') {
      status = 'REVIEW';
      reason = 'Consumer care details not visible on photographed surface';
    }

    const confidence = consumerCare?.confidence || 0;

    declarations.consumerCare = {
      field: 'consumerCare',
      required: true,
      detected,
      value: consumerCare?.value || null,
      confidence,
      status,
      ruleId: 'PCR_R6_10',
      reason,
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
      reason,
    });

    if (status === 'REVIEW') {
      findings.push(this.createFinding('PCR_R6_10', 'REVIEW', 'consumerCare', consumerCare?.value,
        'Customer care contact details', confidence, reason));
    }
  }

  // ── Visual Quality (Rule 9) ────────────────────────────────────────────────

  checkVisualQuality(detections) {
    const visualChecks = {};

    // Legibility check (Rule 9.1) - based on OCR confidence
    const avgConfidence = detections.length > 0
      ? detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
      : 0;
    const lowConfidenceCount = detections.filter(d => d.confidence < 0.75).length;

    visualChecks.legibility = {
      check: 'legibility',
      status: avgConfidence >= 0.75 ? 'PASS' : lowConfidenceCount > 3 ? 'REVIEW' : 'REVIEW',
      details: `Average OCR confidence: ${(avgConfidence * 100).toFixed(1)}%, Low confidence detections: ${lowConfidenceCount}`,
      confidence: avgConfidence,
      ruleId: 'PCR_R9_01',
    };

    // Contrast check (Rule 9.2) - requires image analysis
    visualChecks.contrast = {
      check: 'contrast',
      status: 'REVIEW',
      details: 'Contrast analysis requires image processing — inspector should verify declarations are clearly distinguishable from background',
      confidence: 0.5,
      ruleId: 'PCR_R9_02',
    };

    // Principal display panel (Rule 7.1)
    visualChecks.principalDisplayPanel = {
      check: 'principalDisplayPanel',
      status: 'REVIEW',
      details: 'Principal display panel identification requires layout analysis — inspector verification required',
      confidence: 0.5,
      ruleId: 'PCR_R7_01',
    };

    return visualChecks;
  }

  // ── Quantity Expression (Rule 12) ──────────────────────────────────────────

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
        'Quantity must not use approximation terms', confidence, 'Prohibited terms detected: ' + prohibited.filter(t => text.includes(t)).join(', ')));
    }
  }

  // ── Units (Rule 13) ────────────────────────────────────────────────────────

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
        'Non-standard unit used', netQuantity.confidence, reason));
    }
  }

  // ── Phase 2: Product-Aware Checks ──────────────────────────────────────────

  checkManufacturerDifferentFromPacker(fields, results, declarations, findings) {
    const rule = this.ruleDb.getRule('PCR_R5_01');
    if (!rule) return;

    const manufacturer = fields.manufacturer?.value || null;
    const packer = fields.packer?.value || null;

    const hasBoth = manufacturer && packer;
    const different = hasBoth && manufacturer !== packer;
    const status = different ? 'REVIEW' : (hasBoth ? 'PASS' : 'NOT_APPLICABLE');

    declarations.manufacturerPackerDistinction = {
      field: 'manufacturer/packer',
      required: false,
      detected: hasBoth,
      value: { manufacturer, packer },
      confidence: Math.max(fields.manufacturer?.confidence || 0, fields.packer?.confidence || 0),
      status,
      ruleId: 'PCR_R5_01',
      reason: different
        ? 'Manufacturer and packer appear different — verify declaration explicitly states both'
        : (hasBoth ? 'Both present and same' : 'Only one present'),
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

  checkFoodDeclarations(fields, product, results, declarations, findings) {
    const isFood = product?.isFood === true;
    if (!isFood) return;

    // Second Schedule rules
    const rules = [
      { id: 'PCR_2SCH_02', title: 'List of ingredients', required: true, reviewOnly: true },
      { id: 'PCR_2SCH_04', title: 'Veg/Non-Veg symbol', required: true, reviewOnly: true },
      { id: 'PCR_2SCH_07', title: 'Batch/Lot identification', input: fields.batchNumber, required: true },
    ];

    rules.forEach(r => {
      const rule = this.ruleDb.getRule(r.id);
      if (!rule) return;

      const detected = r.input ? r.input.status === 'DETECTED' : false;
      const status = r.reviewOnly ? 'REVIEW' : (detected ? 'PASS' : 'REVIEW');

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
          : (detected ? 'Detected from OCR' : 'Not detected — inspector verification required'),
      });
    });
  }

  checkCommoditySpecificRules(fields, product, results, findings) {
    if (!product?.category) return;

    // Rule 14 — liquid commodities
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

  // ── Phase 3 & 4: Grouped Physical/Enforcement Checks ───────────────────────

  /**
   * Create grouped physical inspection and enforcement rules.
   * Returns an array of groups, each with a category and list of rules.
   * These are rendered as single cards in the UI.
   */
  createGroupedPhysicalEnforcementChecks(fields, product) {
    const groups = [];

    // ── Group 1: Physical Inspection Rules (Phase 3) ────────────────────────
    const physicalRules = [
      { id: 'PCR_R19_01', title: 'MPE — quantity accuracy', ref: 'Rule 19 & First Schedule' },
      { id: 'PCR_R21_01', title: 'Number of packages verification', ref: 'Rule 21' },
      { id: 'PCR_R22_01', title: 'Verification of standard packages', ref: 'Rule 22' },
      { id: 'PCR_5SCH_01', title: 'MPE for weight commodities', ref: 'Fifth Schedule Part I' },
      { id: 'PCR_5SCH_02', title: 'MPE for volume commodities', ref: 'Fifth Schedule Part II' },
      { id: 'PCR_1SCH_01', title: 'Standard net quantity', ref: 'First Schedule' },
      { id: 'PCR_R7_02', title: 'Numeral height for quantity', ref: 'Rule 7(2)' },
    ];

    const physicalRuleResults = physicalRules.map(r => {
      const rule = this.ruleDb.getRule(r.id) || { rule_id: r.id, source: 'Legal Metrology (Packaged Commodities) Rules, 2011', rule: r.ref.split(' ')[1], title: r.title, category: 'physical_inspection', legal_reference: r.ref };
      return {
        ruleId: r.id,
        source: rule.source,
        rule: rule.rule,
        title: r.title,
        category: 'physical_inspection',
        check: r.title,
        input: fields.netQuantity?.normalizedValue || null,
        expected: 'Calibrated measurement required',
        confidence: 0,
        status: 'REVIEW',
        legalReference: r.ref,
        reason: 'Physical measurement requires calibrated instruments (MPE, reference standards, calipers for font height). Image alone cannot determine accuracy. Inspector verification required.',
      };
    });

    groups.push({
      groupId: 'physical-inspection',
      category: 'Physical Inspection Rules (Phase 3)',
      description: 'These rules require calibrated instruments and cannot be verified from an uncalibrated photograph. Inspector must use weighing equipment, measuring cylinders, calipers, and reference standards.',
      status: 'REVIEW',
      rules: physicalRuleResults,
    });

    // ── Group 2: Enforcement & Registry Rules (Phase 4) ──────────────────────
    const enforcementRules = [
      { id: 'PCR_R20_01', title: 'Registration of packaged commodity', ref: 'Rule 20' },
      { id: 'PCR_R27_01', title: 'Import permit', ref: 'Rule 27', onlyForImports: true },
      { id: 'PCR_R28_01', title: 'Dealer obligations — verification', ref: 'Rule 28' },
      { id: 'PCR_R29_01', title: 'Packer responsibility — accuracy', ref: 'Rule 29' },
      { id: 'PCR_R30_01', title: 'Penalty provisions', ref: 'Rule 30' },
    ];

    const isImport = fields.importer?.status === 'DETECTED';

    const enforcementRuleResults = enforcementRules
      .filter(r => !r.onlyForImports || isImport)
      .map(r => {
        const rule = this.ruleDb.getRule(r.id) || { rule_id: r.id, source: 'Legal Metrology (Packaged Commodities) Rules, 2011', rule: r.ref.split(' ')[1], title: r.title, category: 'enforcement_registry', legal_reference: r.ref };
        return {
          ruleId: r.id,
          source: rule.source,
          rule: rule.rule,
          title: r.title,
          category: 'enforcement_registry',
          check: r.title,
          input: null,
          expected: 'Registry/enforcement verification — inspector action',
          confidence: 0,
          status: 'REVIEW',
          legalReference: r.ref,
          reason: 'Enforcement/registry checks require access to government databases (registration numbers, import permits, compliance history) and physical inspector verification. Never automated.',
        };
      });

    groups.push({
      groupId: 'enforcement-registry',
      category: 'Enforcement & Registry Rules (Phase 4)',
      description: 'These rules require inspector access to government databases and cannot be verified from an image. Inspector must verify registration, import permits, dealer obligations, and compliance history.',
      status: 'REVIEW',
      rules: enforcementRuleResults,
    });

    return groups;
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  createFinding(ruleId, status, field, detectedText, expected, confidence, reason) {
    return {
      findingId: `F-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId,
      status,
      field,
      detectedText,
      expected,
      confidence,
      reason,
      imageId: 'unknown',
      inspectionTime: new Date().toISOString(),
      inspectorStatus: 'PENDING',
    };
  }
}

module.exports = { RuleEngine };
