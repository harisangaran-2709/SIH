/**
 * schemas/ocrSchema.js
 * --------------------
 * Zod schemas that describe every object the OCR API sends or receives.
 *
 * Bounding box coordinate system
 * --------------------------------
 *   - Four corner points:  [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
 *   - Order: top-left, top-right, bottom-right, bottom-left
 *   - Origin: top-left of the original image (before preprocessing)
 *   - X → right,  Y → down,  units = pixels
 *   - Coordinates reference the original image dimensions
 */

const { z } = require("zod");

// One detected text region
const OCRDetectionSchema = z.object({
  text: z.string(),
  rawText: z.string(),
  confidence: z.number().min(0).max(1),
  boundingBox: z
    .array(z.tuple([z.number(), z.number()]))
    .length(4, "boundingBox must have exactly 4 [x,y] points"),
  belowThreshold: z.boolean(),
});

// OCR result for a single image
const OCRImageResultSchema = z.object({
  imageId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  processingTimeMs: z.number().int().nonnegative(),
  preprocessingSteps: z.array(z.string()).default([]),
  detections: z.array(OCRDetectionSchema),
  error: z.string().optional(),
});

// Full response sent to clients
const OCRResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(OCRImageResultSchema).optional(),
  error: z.string().optional(),
});

module.exports = { OCRDetectionSchema, OCRImageResultSchema, OCRResponseSchema };
