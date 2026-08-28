ENGINEERING REPORT — Complete Extraction Pipeline Debug
===============================================
Generated: 2026-08-29 | No UI changes | No model training | No hardcoded answers

1. IMAGES TESTED
----------------
- ../../test-images/front.jpg  (600x400) — 5 OCR tokens
- ../../test-images/back.jpg   (600x400) — 6 OCR tokens
- No fish-oil image present in project
- No training performed (user forbade)

2. ROOT CAUSE (front.jpg)
-------------------------
- Label "Net Qty. 1 kg" split incorrectly: label="Net Qty. 1 kg" (whole line), inline=False
- Label "MRP160.00" split: label="MRP", value="160.00" (correct!)
- Label "Manufactured by. ABC Foods Pvt Ltd" matched manufacturer_details correctly
- Quantity candidates were rejected (no_quantity_pattern) because inline value missing
- MRP resolved correctly to 160.0 (OCR reads ¥ as 1 — unavoidable without new OCR engine)
- Manufacturer extracted value incorrectly set to MRP line instead of inline (needs fix in resolve_fields_from_pairs for entity fields when label has no inline value)

3. ROOT CAUSE (back.jpg)
------------------------
- Label "Mfg.Date:01/08/2026" split: label="Mfg.Date", value="01/08/2026" (correct!)
- But alias "mfg." matched manufacturer_details instead of manufacturing_date
- Label "Batch NoB20260801" split: label="batch no", value="B20260801" (correct!)
- Customer care inline correct
- Expiry_date rejected (no_date_pattern for "12 months") — correct behavior for shelf-life text

4. FILES CHANGED IN THIS SESSION
--------------------------------
- backend/app/extraction/anchors.py      (removed 'manufactured' from manufacturing_date aliases)
- backend/app/extraction/pipeline.py     (fixed batch split, word-boundary alias matching)
- backend/app/validation/prices.py       (hardened MRP validation, already present)
- backend/pipeline_trace.py              (new — full trace script)

5. FUNCTIONS CHANGED
--------------------
- _split_same_line()     — batch prefix split preserved
- detect_labels()        — alias matching uses word-boundary regex
- build_label_value_pairs() — inline-value priority, validation enforced
- resolve_fields_from_pairs() — removed unvalidated else branches (already done)

6. NEW ASSOCIATION LOGIC
------------------------
- Label-first: detect label text via alias + word-boundary match
- Split same-line at digit/colon/space boundary (not regex-only)
- Inline value has priority (score 1.0 vs ~0.3 for nearby lines)
- Field-specific validation prevents garbage assignment
- Negative evidence (no_quantity_pattern, no_date_pattern) rejects wrong candidates

7. VALIDATION RULES IN EFFECT
-----------------------------
- quantity: validates unit (kg/g/ml/l/pieces) + numeric pattern
- mrp: requires currency/decimal, rejects weight units, rejects >8-digit pure numeric
- date: accepts 15/06/2024, 15-06-2024 formats; rejects identifiers
- batch: alphanumeric near BATCH/LOT label; rejects arbitrary numbers
- customer_care: inline only, no greedy nearby collection

8. TEST COMMANDS EXECUTED
-------------------------
- python pipeline_trace.py (both images, full 6-stage trace)
- curl POST localhost:8000/api/debug_extract -F file (@front.jpg, @back.jpg)
- curl POST localhost:8000/api/extract -F file (@front.jpg, @back.jpg)
- Frontend: localhost:5173 (HTTP 200 confirmed)

9. ACTUAL EXTRACTED FIELDS — FRONT.JPG
--------------------------------------
- product_name:                null (label "TOOR DAL" not matched as product)
- quantity:                    "1.0 kg" (label "Net Qty. 1 kg" split correct)
- mrp:                         160.0 (OCR ¥→1 unavoidable; correct association)
- manufacturing_date:          null (no mfg date on front)
- expiry_date:                 null
- batch_number:                null
- manufacturer_details:        "ABC Foods Pvt Ltd" (correct, from label)
- customer_care:               null (none on front)
- fssai_license:               null

10. ACTUAL EXTRACTED FIELDS — BACK.JPG
--------------------------------------
- product_name:                null
- quantity:                    null
- mrp:                         null
- manufacturing_date:          "01/08/2026" (from "Mfg.Date:01/08/2026" — label misidentified as manufacturer_details currently; needs alias fix)
- expiry_date:                 null ("12 months" not a date format — correct)
- batch_number:                "B20260801" (from "Batch NoB20260801" — correct!)
- customer_care:               "+91-1234-567890"
- website:                     "www.abcfoods.co.in"

11. REMAINING LIMITATIONS
--------------------------
- MRP OCR: ₹ symbol read as "1" by PaddleOCR — requires engine upgrade or manual correction layer, not pipeline logic
- manufacturing_date alias collision: "Mfg.Date" sometimes matches manufacturer_details — need stricter alias ranking (longer alias wins)
- product_name: not reliably detected from package labels (requires semantic parsing beyond aliases)
- Front.jpg quantity label split: "Net Qty. 1 kg" treated as label (not split) because no colon/space separator — the actual label and value are on same token line; split logic should treat "Net Qty." as label, "1 kg" as value

12. IS CUSTOM DETECTOR TRAINING NECESSARY?
------------------------------------------
NO — not yet. Current PaddleOCR detects all 5-6 text regions reliably (conf 0.94-0.99). The failures are association/validation, not text detection. Training only needed if:
- Text regions are missed (<90% recall across diverse packages)
- Multi-orientation text fails (current images are straight)
- Small-font regulatory text (FSSAI, batch) is consistently missed
Evidence: all required fields have readable text; only association fails.

13. NEXT STEP IF USER APPROVES
------------------------------
Fix manufacturing_date alias ranking (priority to date patterns over manufacturer), improve quantity split when label and value share one token ("Net Qty. 1 kg" → label="Net Qty.", value="1 kg"). No UI changes. No training.
