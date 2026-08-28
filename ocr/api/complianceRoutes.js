/**
 * api/complianceRoutes.js
 * ------------------------
 * Compliance analysis API endpoint
 */

const express = require('express');
const router = express.Router();
const { ComplianceManager } = require('../compliance/complianceManager');
const { ComplianceResponseSchema } = require('../schemas/complianceSchema');

const complianceManager = new ComplianceManager();

/**
 * POST /api/compliance/analyze
 * Analyze OCR results for Legal Metrology compliance
 *
 * Request body: OCR response object (from /api/ocr endpoint)
 * Response: Compliance analysis with rule results, findings, and evidence
 */
router.post('/analyze', async (req, res) => {
  try {
    const ocrResults = req.body;

    // Validate OCR input structure
    if (!ocrResults || !ocrResults.results) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input: expected OCR results object with "results" array',
      });
    }

    // Run compliance analysis
    const complianceResult = await complianceManager.analyze(ocrResults);

    // Validate response against Zod schema
    try {
      const validated = ComplianceResponseSchema.parse(complianceResult);
      return res.json(validated);
    } catch (zodError) {
      console.error('[ComplianceRoutes] Schema validation failed:', zodError.errors);
      // Return the unvalidated result with a warning
      return res.json({
        ...complianceResult,
        _schemaValidationWarning: 'Response structure may not match expected schema',
      });
    }
  } catch (error) {
    console.error('[ComplianceRoutes] Analysis error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during compliance analysis',
      summary: { pass: 0, fail: 0, review: 0, notApplicable: 0 },
      finalStatus: 'REVIEW',
    });
  }
});

/**
 * GET /api/compliance/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'compliance-analysis',
    ruleVersion: '2011-baseline',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/compliance/rules
 * List available rules (all phases, or filter by phase)
 */
router.get('/rules', (req, res) => {
  try {
    const ruleDb = complianceManager.ruleEngine.ruleDb;
    const phase = parseInt(req.query.phase) || null;

    let rules;
    if (phase) {
      rules = Object.values(ruleDb.rules).filter(r => r.phase === phase);
    } else {
      rules = Object.values(ruleDb.rules);
    }

    res.json({
      success: true,
      ruleVersion: '2011-baseline',
      phaseFilter: phase || 'all',
      count: rules.length,
      ruleCountByPhase: ruleDb.getRuleCountByPhase(),
      rules: rules.map(r => ({
        ruleId: r.rule_id,
        rule: r.rule,
        phase: r.phase,
        title: r.title,
        category: r.category,
        legalReference: r.legal_reference,
        physicalVerificationRequired: r.physical_verification_required,
        humanReviewOnAmbiguity: r.human_review_on_ambiguity,
      })),
    });
  } catch (error) {
    console.error('[ComplianceRoutes] Rules listing error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/compliance/stats
 * Get rule engine statistics
 */
router.get('/stats', (req, res) => {
  try {
    const ruleDb = complianceManager.ruleEngine.ruleDb;
    res.json({
      success: true,
      ruleVersion: '2011-baseline',
      ruleCountByPhase: ruleDb.getRuleCountByPhase(),
      totalRules: ruleDb.getAllRuleIds().length,
      categories: [...new Set(Object.values(ruleDb.rules).map(r => r.category))],
      calibrationRequired: ruleDb.getCalibrationRequiredRules().length,
    });
  } catch (error) {
    console.error('[ComplianceRoutes] Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
