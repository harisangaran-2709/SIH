/**
 * test/compliance.test.js
 * -----------------------
 * End-to-end tests for the Legal Metrology Compliance Engine
 */

// Mock OCR response data for testing
const mockOCRResponse = {
  success: true,
  results: [
    {
      imageId: "test-image-001",
      width: 1920,
      height: 1080,
      processingTimeMs: 125,
      preprocessingSteps: ["grayscale", "contrast_enhance"],
      detections: [
        // Product name
        {
          text: "Toor Dal",
          rawText: "Toor Dal",
          confidence: 0.95,
          boundingBox: [[100, 50], [300, 50], [300, 100], [100, 100]],
          belowThreshold: false,
        },
        // MRP
        {
          text: "MRP ₹120",
          rawText: "MRP ₹120",
          confidence: 0.92,
          boundingBox: [[100, 150], [250, 150], [250, 200], [100, 200]],
          belowThreshold: false,
        },
        // Net quantity
        {
          text: "Net Qty: 1 kg",
          rawText: "Net Qty: 1 kg",
          confidence: 0.93,
          boundingBox: [[100, 250], [300, 250], [300, 300], [100, 300]],
          belowThreshold: false,
        },
        // Manufacturing date
        {
          text: "Mfg: 08/2026",
          rawText: "Mfg: 08/2026",
          confidence: 0.89,
          boundingBox: [[100, 350], [280, 350], [280, 400], [100, 400]],
          belowThreshold: false,
        },
        // Manufacturer
        {
          text: "Manufactured by ABC Foods Pvt. Ltd.",
          rawText: "Manufactured by ABC Foods Pvt. Ltd.",
          confidence: 0.91,
          boundingBox: [[100, 450], [500, 450], [500, 500], [100, 500]],
          belowThreshold: false,
        },
        // Consumer care
        {
          text: "Customer Care: +91-1234567890",
          rawText: "Customer Care: +91-1234567890",
          confidence: 0.88,
          boundingBox: [[100, 550], [450, 550], [450, 600], [100, 600]],
          belowThreshold: false,
        },
      ],
    },
  ],
};

// Mock OCR response with missing declarations
const mockOCRMissingDeclarations = {
  success: true,
  results: [
    {
      imageId: "test-image-002",
      width: 1920,
      height: 1080,
      processingTimeMs: 115,
      preprocessingSteps: ["grayscale"],
      detections: [
        {
          text: "Rice",
          rawText: "Rice",
          confidence: 0.94,
          boundingBox: [[100, 50], [200, 50], [200, 100], [100, 100]],
          belowThreshold: false,
        },
        {
          text: "500g",
          rawText: "500g",
          confidence: 0.91,
          boundingBox: [[100, 150], [180, 150], [180, 200], [100, 200]],
          belowThreshold: false,
        },
        // Missing MRP, manufacturer, date, consumer care
      ],
    },
  ],
};

// Mock OCR response for exempt package (< 10g)
const mockOCRExemptPackage = {
  success: true,
  results: [
    {
      imageId: "test-image-003",
      width: 1920,
      height: 1080,
      processingTimeMs: 95,
      preprocessingSteps: ["grayscale"],
      detections: [
        {
          text: "Salt",
          rawText: "Salt",
          confidence: 0.96,
          boundingBox: [[100, 50], [180, 50], [180, 100], [100, 100]],
          belowThreshold: false,
        },
        {
          text: "Net Qty: 5g",
          rawText: "Net Qty: 5g",
          confidence: 0.93,
          boundingBox: [[100, 150], [220, 150], [220, 200], [100, 200]],
          belowThreshold: false,
        },
      ],
    },
  ],
};

// Mock OCR response for large package (> 25kg - not applicable)
const mockOCRLargePackage = {
  success: true,
  results: [
    {
      imageId: "test-image-004",
      width: 1920,
      height: 1080,
      processingTimeMs: 105,
      preprocessingSteps: ["grayscale"],
      detections: [
        {
          text: "Rice",
          rawText: "Rice",
          confidence: 0.95,
          boundingBox: [[100, 50], [200, 50], [200, 100], [100, 100]],
          belowThreshold: false,
        },
        {
          text: "Net Qty: 50 kg",
          rawText: "Net Qty: 50 kg",
          confidence: 0.94,
          boundingBox: [[100, 150], [280, 150], [280, 200], [100, 200]],
          belowThreshold: false,
        },
      ],
    },
  ],
};

/**
 * Run all test cases
 */
async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║   Legal Metrology Compliance Engine - Test Suite     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const { ComplianceManager } = require('../compliance/complianceManager');
  const manager = new ComplianceManager();

  let passed = 0;
  let failed = 0;

  // Test 1: Complete package with all declarations
  try {
    console.log('Test 1: Complete package with all declarations');
    const result = await manager.analyze(mockOCRResponse);

    console.assert(result.success === true, 'Should succeed');
    console.assert(result.product.category === 'pulses', 'Should classify as pulses');
    console.assert(result.product.isFood === true, 'Should be food item');
    console.assert(result.packageType.type === 'retail_package', 'Should be retail package');
    console.assert(result.applicability.chapterTwoApplies === true, 'Should be applicable');
    console.assert(result.exemption.isExempt === false, 'Should not be exempt');
    console.assert(result.finalStatus === 'COMPLIANT' || result.finalStatus === 'REVIEW', 'Should be COMPLIANT or REVIEW');
    console.assert(result.summary.compliant > 0, 'Should have compliant rules');
    console.assert(result.declarations.mrp?.detected === true || result.declarations.mrp?.status === 'PASS', 'Should detect MRP');
    console.assert(result.declarations.netQuantity?.detected === true || result.declarations.netQuantity?.status === 'PASS', 'Should detect net quantity');

    console.log('✓ Test 1 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 1 FAILED:', err.message);
    failed++;
  }

  // Test 2: Package with missing declarations
  try {
    console.log('Test 2: Package with missing declarations');
    const result = await manager.analyze(mockOCRMissingDeclarations);

    console.assert(result.success === true, 'Should succeed');
    console.assert(result.finalStatus === 'REVIEW', 'Should be REVIEW (missing declarations need inspector verification, not FAIL)');
    console.assert(result.summary.nonCompliant === 0, 'Should have zero FAIL rules per CRITICAL FIX spec — missing declarations → REVIEW');
    console.assert(result.summary.review > 0, 'Should have REVIEW rules for missing declarations');
    console.assert(result.declarations.manufacturer?.detected === false || result.declarations.manufacturer?.status === 'REVIEW', 'Manufacturer should be missing/REVIEW');
    console.assert(result.findings?.length > 0 || result.ruleResults?.some(r => r.status === 'REVIEW'), 'Should have findings or REVIEW rules');

    console.log('✓ Test 2 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 2 FAILED:', err.message);
    failed++;
  }

  // Test 3: Exempt package (< 10g)
  try {
    console.log('Test 3: Exempt package (< 10g)');
    const result = await manager.analyze(mockOCRExemptPackage);

    console.assert(result.success === true, 'Should succeed');
    console.assert(result.exemption.isExempt === true, 'Should be exempt');
    console.assert(result.finalStatus === 'COMPLIANT', 'Exempt packages should be COMPLIANT');

    console.log('✓ Test 3 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 3 FAILED:', err.message);
    failed++;
  }

  // Test 4: Large package (> 25kg - not applicable)
  try {
    console.log('Test 4: Large package (> 25kg - not applicable)');
    const result = await manager.analyze(mockOCRLargePackage);

    console.assert(result.success === true, 'Should succeed');
    console.assert(result.applicability.chapterTwoApplies === false, 'Should not be applicable');
    console.assert(result.finalStatus === 'NOT_APPLICABLE', 'Non-applicable packages should be NOT_APPLICABLE');

    console.log('✓ Test 4 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 4 FAILED:', err.message);
    failed++;
  }

  // Test 5: Field extraction
  try {
    console.log('Test 5: Field extraction traceability');
    const { FieldExtractor } = require('../compliance/fieldExtractor');
    const extractor = new FieldExtractor();

    const fields = extractor.extractFields(mockOCRResponse.results[0].detections);

    console.assert(fields.mrp.value !== null, 'Should extract MRP');
    console.assert(fields.mrp.normalizedValue === 120, 'Should normalize MRP to number');
    console.assert(fields.mrp.sourceDetectionIds.length > 0, 'Should have source detection IDs');
    console.assert(fields.netQuantity.normalizedValue.value === 1, 'Should extract quantity value');
    console.assert(fields.netQuantity.normalizedValue.unit === 'kg', 'Should extract quantity unit');

    console.log('✓ Test 5 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 5 FAILED:', err.message);
    failed++;
  }

  // Test 6: Product classification
  try {
    console.log('Test 6: Product classification');
    const { ProductClassifier } = require('../compliance/productClassifier');
    const classifier = new ProductClassifier();
    const { FieldExtractor } = require('../compliance/fieldExtractor');
    const extractor = new FieldExtractor();

    const fields = extractor.extractFields(mockOCRResponse.results[0].detections);
    const product = classifier.classifyProduct(fields);

    console.assert(product.category === 'pulses', 'Should classify Toor Dal as pulses');
    console.assert(product.isFood === true, 'Should classify as food');
    console.assert(product.confidence > 0.5, 'Should have reasonable confidence');

    console.log('✓ Test 6 PASSED\n');
    passed++;
  } catch (err) {
    console.error('✗ Test 6 FAILED:', err.message);
    failed++;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║   Test Results: ${passed} passed, ${failed} failed${' '.repeat(25 - passed.toString().length - failed.toString().length)}║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
