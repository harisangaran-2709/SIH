/**
 * schemas/complianceSchema.js
 * ----------------------------
 * Zod schemas for Legal Metrology compliance analysis
 *
 * All schemas maintain traceability to original OCR detections.
 */

const { z } = require("zod");

// Field extraction status
const FieldStatus = z.enum(["DETECTED", "MISSING", "AMBIGUOUS", "LOW_CONFIDENCE"]);

// Extracted field with OCR traceability
const ExtractedFieldSchema = z.object({
  field: z.string(),
  value: z.string().nullable(),
  normalizedValue: z.any().nullable(),
  confidence: z.number().min(0).max(1),
  status: FieldStatus,
  sourceDetectionIds: z.array(z.string()).default([]),
  boundingBox: z.array(z.tuple([z.number(), z.number()])).length(4).optional(),
  rawText: z.string().optional(),
});

// Product classification
const ProductClassificationSchema = z.object({
  category: z.string(), // food, pulses, cereals, etc.
  subcategory: z.string().optional(),
  confidence: z.number().min(0).max(1),
  isFood: z.boolean().default(false),
});

// Package classification
const PackageClassificationSchema = z.object({
  type: z.enum([
    "retail_package",
    "wholesale_package",
    "export_package",
    "imported_package",
    "multi_component_package",
    "industrial_package",
    "institutional_package",
    "unknown"
  ]),
  confidence: z.number().min(0).max(1),
});

// Rule check result status
const RuleStatus = z.enum(["PASS", "FAIL", "REVIEW", "NOT_APPLICABLE"]);

// Individual rule check result
const RuleResultSchema = z.object({
  ruleId: z.string(),
  source: z.string(),
  rule: z.string(),
  title: z.string(),
  category: z.string(),
  check: z.string(),
  input: z.any().nullable(),
  expected: z.string(),
  aiCheck: z.string().optional(),
  evidence: z.array(z.string()).default([]), // evidence IDs
  confidence: z.number().min(0).max(1),
  status: RuleStatus,
  legalReference: z.string(),
  reason: z.string().optional(),
});

// Compliance finding (violation or issue)
const ComplianceFindingSchema = z.object({
  findingId: z.string(),
  ruleId: z.string(),
  status: RuleStatus,
  field: z.string().optional(),
  detectedText: z.string().nullable(),
  expected: z.string(),
  confidence: z.number().min(0).max(1),
  imageId: z.string(),
  cropId: z.string().optional(),
  boundingBox: z.array(z.tuple([z.number(), z.number()])).length(4).optional(),
  inspectionTime: z.string(),
  inspectorStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).default("PENDING"),
  inspectorNotes: z.string().optional(),
});

// Declaration check result
const DeclarationResultSchema = z.object({
  field: z.string(),
  required: z.boolean(),
  detected: z.boolean(),
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: RuleStatus,
  ruleId: z.string(),
  reason: z.string().optional(),
});

// Visual check result (font, legibility, contrast, etc.)
const VisualCheckResultSchema = z.object({
  check: z.string(),
  status: RuleStatus,
  details: z.string().optional(),
  confidence: z.number().min(0).max(1),
  ruleId: z.string().optional(),
});

// Applicability check
const ApplicabilityResultSchema = z.object({
  chapterTwoApplies: z.boolean(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  packQuantity: z.object({
    value: z.number().nullable(),
    unit: z.string().nullable(),
  }).optional(),
});

// Exemption check
const ExemptionResultSchema = z.object({
  isExempt: z.boolean(),
  exemptionType: z.string().nullable(),
  reason: z.string(),
  ruleId: z.string().optional(),
});

// Summary statistics
const ComplianceSummarySchema = z.object({
  pass: z.number().int().nonnegative(),
  fail: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
  notApplicable: z.number().int().nonnegative(),
});

// Full compliance analysis response
const ComplianceResponseSchema = z.object({
  success: z.boolean(),

  product: ProductClassificationSchema.optional(),
  packageType: PackageClassificationSchema.optional(),

  inspectionDate: z.string(),
  ruleVersion: z.string().default("2011-baseline"),

  applicability: ApplicabilityResultSchema.optional(),
  exemption: ExemptionResultSchema.optional(),

  declarations: z.record(DeclarationResultSchema).default({}),
  visualChecks: z.record(VisualCheckResultSchema).default({}),

  ruleResults: z.array(RuleResultSchema).default([]),
  findings: z.array(ComplianceFindingSchema).default([]),

  summary: ComplianceSummarySchema,
  finalStatus: z.enum(["PASS", "POTENTIAL_NON_COMPLIANCE", "REVIEW"]),

  error: z.string().optional(),
});

module.exports = {
  FieldStatus,
  ExtractedFieldSchema,
  ProductClassificationSchema,
  PackageClassificationSchema,
  RuleStatus,
  RuleResultSchema,
  ComplianceFindingSchema,
  DeclarationResultSchema,
  VisualCheckResultSchema,
  ApplicabilityResultSchema,
  ExemptionResultSchema,
  ComplianceSummarySchema,
  ComplianceResponseSchema,
};
