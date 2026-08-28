/**
 * compliance/ruleDatabase.js
 * ---------------------------
 * Rule database for Legal Metrology (Packaged Commodities) Rules, 2011
 * Phases 1-4: All rule definitions with phase, evidence, and verification metadata
 *
 * Key principles:
 * - NEVER fabricate data. Physical/measurement rules always REVIEW when uncalibrated.
 * - Rule outcomes are DETERMINED BY RULES, not AI confidence.
 * - Every rule links to source detection IDs for evidence traceability.
 */

const RULES = {

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Image-Verifiable Rules (already implemented)
  // ═══════════════════════════════════════════════════════════

  "PCR_R6_01": {
    rule_id: "PCR_R6_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "1",
    title: "Manufacturer/Packer/Importer name and address",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["manufacturer", "packer", "importer"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(1) — Name and address of manufacturer/packer/importer"
  },

  "PCR_R6_03": {
    rule_id: "PCR_R6_03",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "3",
    title: "Common or generic name of commodity",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["productName"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(3) — Common or generic name of commodity"
  },

  "PCR_R6_04": {
    rule_id: "PCR_R6_04",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "4",
    title: "Net quantity in terms of weight, measure or number",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: { type: "presence_and_format", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(4) — Net quantity in terms of weight, measure or number"
  },

  "PCR_R6_05": {
    rule_id: "PCR_R6_05",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "5",
    title: "Month and year of manufacture/packing/import",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["mfgDate", "packingDate"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(5) — Month and year of manufacture/packing/import"
  },

  "PCR_R6_06": {
    rule_id: "PCR_R6_06",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "6",
    title: "Retail sale price (MRP)",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["mrp"],
    validation: { type: "presence_and_format", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(6) — Retail sale price inclusive of all taxes"
  },

  "PCR_R6_10": {
    rule_id: "PCR_R6_10",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "10",
    title: "Customer care details",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["consumerCare", "phone", "email"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(10) — Customer care details"
  },

  "PCR_R7_01": {
    rule_id: "PCR_R7_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "7",
    subrule: "1",
    title: "Principal display panel identification",
    category: "visual_layout",
    phase: 1,
    version: "2011-baseline",
    input_fields: [],
    validation: { type: "layout_detection", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 7(1) — Declarations on principal display panel"
  },

  "PCR_R7_02": {
    rule_id: "PCR_R7_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "7",
    subrule: "2",
    title: "Numeral height for quantity",
    category: "visual_font",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "font_measurement",
      required: true,
      requires_calibration: true,
      baseline: {
        "up_to_200": { normal: "1mm", blown_formed: "2mm" },
        "200_to_500": { normal: "2mm", blown_formed: "4mm" },
        "above_500": { normal: "4mm", blown_formed: "6mm" }
      }
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 7(2) — Height of numerals for quantity declaration"
  },

  "PCR_R7_04": {
    rule_id: "PCR_R7_04",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "7",
    subrule: "4",
    title: "Letter height for declarations",
    category: "visual_font",
    phase: 1,
    version: "2011-baseline",
    input_fields: [],
    validation: {
      type: "font_measurement",
      required: true,
      requires_calibration: true,
      minimum: "1mm"
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 7(4) — Height of letters for declarations minimum 1mm"
  },

  "PCR_R9_01": {
    rule_id: "PCR_R9_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "9",
    subrule: "1",
    title: "Legibility of declarations",
    category: "visual_quality",
    phase: 1,
    version: "2011-baseline",
    input_fields: [],
    validation: { type: "ocr_confidence", threshold: 0.75 },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 9(1) — Declarations shall be legible and prominent"
  },

  "PCR_R9_02": {
    rule_id: "PCR_R9_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "9",
    subrule: "2",
    title: "Contrast for MRP and quantity",
    category: "visual_quality",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["mrp", "netQuantity"],
    validation: { type: "contrast_analysis", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 9(2) — MRP and quantity in contrasting color"
  },

  "PCR_R9_05": {
    rule_id: "PCR_R9_05",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "9",
    subrule: "5",
    title: "Language — Hindi or English",
    category: "mandatory_declaration",
    phase: 1,
    version: "2011-baseline",
    input_fields: [],
    validation: { type: "language_detection", required_languages: ["hi", "en"] },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 9(5) — Declarations in Hindi or English"
  },

  "PCR_R12_01": {
    rule_id: "PCR_R12_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "12",
    subrule: "1",
    title: "Expression of quantity",
    category: "quantity_format",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "quantity_format",
      prohibited_terms: ["approximately", "about", "minimum", "not less than"]
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 12(1) — Quantity in weight, measure or number"
  },

  "PCR_R13_01": {
    rule_id: "PCR_R13_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "13",
    subrule: "1",
    title: "Standard units of quantity",
    category: "quantity_format",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "unit_validation",
      permitted_units: {
        weight: ["g", "kg"],
        volume: ["ml", "l"],
        count: ["pieces", "nos"]
      },
      unit_rules: {
        "less_than_1kg": "g",
        "less_than_1l": "ml"
      }
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 13 — Units shall be in accordance with SI system"
  },

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Product-Aware Rules
  // ═══════════════════════════════════════════════════════════

  "PCR_R5_01": {
    rule_id: "PCR_R5_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "5",
    subrule: "1",
    title: "Declaration when manufacturer ≠ packer",
    category: "mandatory_declaration",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["manufacturer", "packer"],
    validation: {
      type: "conditional_presence",
      condition: "when_manufacturer_differs_from_packer"
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 5 — Every package shall bear name and address of manufacturer OR packer (distinct obligation)"
  },

  "PCR_R6_02": {
    rule_id: "PCR_R6_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "2",
    title: "Address completeness",
    category: "mandatory_declaration",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["manufacturer", "packer", "importer"],
    validation: {
      type: "address_completeness",
      required_elements: ["street", "city", "state", "pincode"],
      country_required_for_imported: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(2) — Address shall include street, city, state, PIN code; country for imported goods"
  },

  "PCR_R6_07": {
    rule_id: "PCR_R6_07",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "7",
    title: "Size of package",
    category: "quantity_format",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "standardized_sizes",
      permitted_sizes: {
        weight: [5, 10, 25, 50, 100, 200, 500, 1000, 5000, 10000], // grams
        volume: [5, 10, 25, 50, 100, 200, 250, 500, 1000, 5000, 10000] // ml
      },
      tolerance_allowed: true
    },
    evidence_required: false,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(7) read with Second Schedule — Standardized net quantity sizes"
  },

  "PCR_R6_08": {
    rule_id: "PCR_R6_08",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "8",
    title: "Country of origin for imported packages",
    category: "mandatory_declaration",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["countryOfOrigin", "importer"],
    validation: {
      type: "conditional_presence",
      condition: "when_imported"
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(8) — Country of origin for imported packages"
  },

  "PCR_R6_09": {
    rule_id: "PCR_R6_09",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "9",
    title: "Importer details",
    category: "mandatory_declaration",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["importer"],
    validation: {
      type: "conditional_presence",
      condition: "when_imported"
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(9) — Name and address of importer for imported packages"
  },

  "PCR_R6_11": {
    rule_id: "PCR_R6_11",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "6",
    subrule: "11",
    title: "Net quantity when sold by number",
    category: "quantity_format",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["netQuantity", "batchNumber"],
    validation: {
      type: "number_declaration",
      requires_batch_or_count: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 6(11) — When commodity is sold by number, number shall be declared"
  },

  // ── Second Schedule: Mandatory Declarations for Prepackaged Food ──
  "PCR_2SCH_01": {
    rule_id: "PCR_2SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "1",
    title: "Food product name and trade name",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["productName"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Every pre-packaged food shall carry name of food, trade name (if any)"
  },

  "PCR_2SCH_02": {
    rule_id: "PCR_2SCH_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "2",
    title: "List of ingredients",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["ingredients"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — List of ingredients in descending order of weight"
  },

  "PCR_2SCH_03": {
    rule_id: "PCR_2SCH_03",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "3",
    title: "Nutritional information (Nutrition Facts)",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline-amended",
    product_scope: ["food"],
    input_fields: ["nutritionInfo"],
    validation: { type: "presence_conditional", required_when: [" fortified", " claims", " nutrition"] },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Nutritional information per 100g/100ml or per serving"
  },

  "PCR_2SCH_04": {
    rule_id: "PCR_2SCH_04",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "4",
    title: "Veg/Non-Veg symbol",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["vegNonVegSymbol"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Second Schedule Part I — Every package of pre-packaged food shall bear veg (green) or non-veg (brown) symbol"
  },

  "PCR_2SCH_05": {
    rule_id: "PCR_2SCH_05",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "5",
    title: "Food additives information",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["additives"],
    validation: { type: "presence_conditional", required_when: ["additive", "preservative", "colour", "flavour"] },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Food additives to be declared by name or INS/FCI number"
  },

  "PCR_2SCH_06": {
    rule_id: "PCR_2SCH_06",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "6",
    title: "Net quantity for food",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["netQuantity"],
    validation: { type: "presence_and_format", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Net quantity of food article"
  },

  "PCR_2SCH_07": {
    rule_id: "PCR_2SCH_07",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "7",
    title: "Batch/Lot identification",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["batchNumber"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Batch identification (date of manufacture/packing)"
  },

  "PCR_2SCH_08": {
    rule_id: "PCR_2SCH_08",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "8",
    title: "Date of manufacture/packing",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["mfgDate", "packingDate"],
    validation: { type: "presence", required: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Date of manufacture/packing and best before date"
  },

  "PCR_2SCH_09": {
    rule_id: "PCR_2SCH_09",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "9",
    title: "Storage instructions",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["storageInstructions"],
    validation: { type: "presence_conditional", required_when: ["store", "refrigerat", "keep cool"] },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Storage instructions where necessary"
  },

  "PCR_2SCH_10": {
    rule_id: "PCR_2SCH_10",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Second Schedule",
    rule: "Second Schedule",
    subrule: "10",
    title: "Country of origin for imported food",
    category: "food_declaration",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["food"],
    input_fields: ["countryOfOrigin"],
    validation: { type: "conditional_presence", condition: "when_imported" },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Second Schedule Part I — Country of origin for imported food"
  },

  // ── Fourth Schedule: Declarations for packages of specific commodities ──
  "PCR_4SCH_01": {
    rule_id: "PCR_4SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Fourth Schedule",
    rule: "Fourth Schedule",
    subrule: "1",
    title: "Edible oil — Category and type",
    category: "commodity_specific",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["edible_oil"],
    input_fields: ["productName", "oilType"],
    validation: { type: "commodity_type_declaration" },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Fourth Schedule — Edible oil shall declare category (refined, cold pressed, etc.)"
  },

  "PCR_4SCH_02": {
    rule_id: "PCR_4SCH_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Fourth Schedule",
    rule: "Fourth Schedule",
    subrule: "2",
    title: "Package dimensions declaration",
    category: "commodity_specific",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["textile"],
    input_fields: ["dimensions"],
    validation: { type: "conditional_presence", condition: "textile_declaration" },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Fourth Schedule — Textile packages shall declare dimensions in cm/inches"
  },

  "PCR_4SCH_03": {
    rule_id: "PCR_4SCH_03",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Fourth Schedule",
    rule: "Fourth Schedule",
    subrule: "3",
    title: "Milk product — Solids-not-fat and fat content",
    category: "commodity_specific",
    phase: 2,
    version: "2011-baseline",
    product_scope: ["milk_powder"],
    input_fields: ["fatContent", "snfContent"],
    validation: { type: "nutritional_content_declaration" },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Fourth Schedule — Milk powder: solids-not-fat min 34%, fat content as per category"
  },

  // ── Rules 14-17: Specific measurement rules ──
  "PCR_R14_01": {
    rule_id: "PCR_R14_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "14",
    subrule: "1",
    title: "Liquid commodities — volume in litres/millilitres",
    category: "measurement_unit",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: { type: "liquid_unit_check", permitted: ["l", "ml"] },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 14(1) — Liquid commodities shall declare volume in litres or millilitres"
  },

  "PCR_R15_01": {
    rule_id: "PCR_R15_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "15",
    subrule: "1",
    title: "Aerosol containers — net weight declaration",
    category: "measurement_unit",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["netQuantity", "aerosolType"],
    validation: { type: "aerosol_declaration", requires_net_weight: true },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 15 — Aerosol containers shall declare net weight of contents"
  },

  "PCR_R16_01": {
    rule_id: "PCR_R16_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "16",
    subrule: "1",
    title: "Commodities sold by count — number declaration",
    category: "quantity_format",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: { type: "count_declaration", requires_number: true },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 16 — Commodities sold by count shall declare the number"
  },

  "PCR_R17_01": {
    rule_id: "PCR_R17_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "17",
    subrule: "1",
    title: "Declaration of dimensions",
    category: "commodity_specific",
    phase: 2,
    version: "2011-baseline",
    input_fields: ["dimensions"],
    validation: { type: "conditional_presence", condition: "dimensioned_commodities" },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 17 — Dimensions for commodities where size is relevant"
  },

  // ═══════════════════════════════════════════════════════════
  // PHASE 3: Physical Inspection Rules
  // These ALWAYS require calibrated measurement — report REVIEW if uncalibrated
  // ═══════════════════════════════════════════════════════════

  "PCR_R19_01": {
    rule_id: "PCR_R19_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "19",
    subrule: "1",
    title: "MPE (Maximum Permissible Error) — quantity accuracy",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "mpe_check",
      requires_calibration: true,
      requires_reference_standard: true,
      // MPE varies by quantity — from First Schedule
      mpe_table: "First Schedule"
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 19 & First Schedule — Quantity in package shall not be less than declared quantity minus MPE"
  },

  "PCR_R21_01": {
    rule_id: "PCR_R21_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "21",
    subrule: "1",
    title: "Number of packages — count verification",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["declaredCount"],
    validation: {
      type: "count_verification",
      requires_calibration: true
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 21 — Number of packages shall not be less than declared"
  },

  "PCR_R22_01": {
    rule_id: "PCR_R22_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "22",
    subrule: "1",
    title: "Verification of standard packages",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["packageType", "netQuantity"],
    validation: {
      type: "standard_package_verification",
      requires_calibration: true,
      requires_reference_standard: true
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 22 — Standard packages shall be verified against reference standards"
  },

  // ── Fifth Schedule: MPE for pre-packaged commodities ──
  "PCR_5SCH_01": {
    rule_id: "PCR_5SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Fifth Schedule",
    rule: "Fifth Schedule",
    subrule: "1",
    title: "MPE for weight commodities",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "mpe_table_check",
      commodity_type: "weight",
      requires_calibration: true,
      // Simplified MPE: for e.g., 100-200g: MPE -4g; 200-300g: MPE -5g
      mpe_rules: {
        "0_to_50g":   { mpe: "2g",  mpe_percent: 4 },
        "50_to_100g": { mpe: "3g",  mpe_percent: 3 },
        "100_to_200g":{ mpe: "4g",  mpe_percent: 2 },
        "200_to_300g":{ mpe: "5g",  mpe_percent: 1.67 },
        "300_to_500g":{ mpe: "6g",  mpe_percent: 1.2 },
        "500g_to_1kg":{ mpe: "10g", mpe_percent: 1 },
        "1_to_5kg":   { mpe: "20g", mpe_percent: 0.5 },
        "5_to_10kg":  { mpe: "50g", mpe_percent: 0.5 },
        "above_10kg": { mpe: "100g", mpe_percent: 0.5 }
      }
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Fifth Schedule Part I — MPE for pre-packed commodities by weight"
  },

  "PCR_5SCH_02": {
    rule_id: "PCR_5SCH_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Fifth Schedule",
    rule: "Fifth Schedule",
    subrule: "2",
    title: "MPE for volume commodities",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "mpe_table_check",
      commodity_type: "volume",
      requires_calibration: true,
      mpe_rules: {
        "0_to_50ml":   { mpe: "2ml",  mpe_percent: 4 },
        "50_to_100ml": { mpe: "3ml",  mpe_percent: 3 },
        "100_to_200ml":{ mpe: "4ml",  mpe_percent: 2 },
        "200_to_300ml":{ mpe: "5ml",  mpe_percent: 1.67 },
        "300_to_500ml":{ mpe: "6ml",  mpe_percent: 1.2 },
        "500ml_to_1l": { mpe: "10ml", mpe_percent: 1 },
        "1_to_5l":     { mpe: "20ml", mpe_percent: 0.5 },
        "5_to_10l":    { mpe: "50ml", mpe_percent: 0.5 },
        "above_10l":   { mpe: "100ml", mpe_percent: 0.5 }
      }
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Fifth Schedule Part II — MPE for pre-packed commodities by volume"
  },

  // ── Sixth Schedule: Material measure requirements ──
  "PCR_6SCH_01": {
    rule_id: "PCR_6SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Sixth Schedule",
    rule: "Sixth Schedule",
    subrule: "1",
    title: "Material measure accuracy",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: [],
    validation: { type: "material_measure", requires_calibration: true },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Sixth Schedule — Requirements for material measures used in packaged commodities"
  },

  // ── Seventh Schedule: Requirements for weighing and measuring instruments ──
  "PCR_7SCH_01": {
    rule_id: "PCR_7SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — Seventh Schedule",
    rule: "Seventh Schedule",
    subrule: "1",
    title: "Weighing instrument accuracy",
    category: "physical_inspection",
    phase: 3,
    version: "2011-baseline",
    input_fields: [],
    validation: { type: "instrument_accuracy", requires_calibration: true },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: false,
    legal_reference: "Seventh Schedule — Requirements for weighing instruments used in packaging"
  },

  // ── First Schedule: Standard quantities ──
  "PCR_1SCH_01": {
    rule_id: "PCR_1SCH_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011 — First Schedule",
    rule: "First Schedule",
    subrule: "1",
    title: "Standard net quantity — standardized sizes",
    category: "quantity_format",
    phase: 3,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "standard_quantity_check",
      requires_calibration: true
    },
    evidence_required: true,
    physical_verification_required: true,
    human_review_on_ambiguity: true,
    legal_reference: "First Schedule — Standard net quantities in which commodities may be pre-packed"
  },

  // ═══════════════════════════════════════════════════════════
  // PHASE 4: Enforcement & Registry Rules
  // These are REGISTRY/DOCUMENT checks — always REVIEW, never CONFIRMED
  // ═══════════════════════════════════════════════════════════

  "PCR_R20_01": {
    rule_id: "PCR_R20_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "20",
    subrule: "1",
    title: "Registration of packaged commodity",
    category: "enforcement_registry",
    phase: 4,
    version: "2011-baseline",
    input_fields: ["registrationNumber"],
    validation: {
      type: "registry_check",
      registry_url: null, // Set at runtime
      requires_api_call: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 20 — Every manufacturer/packer/importer shall register with Legal Metrology Authority"
  },

  "PCR_R27_01": {
    rule_id: "PCR_R27_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "27",
    subrule: "1",
    title: "Import of packaged commodities — import permit",
    category: "enforcement_registry",
    phase: 4,
    version: "2011-baseline",
    input_fields: ["importer", "importPermitNumber"],
    validation: {
      type: "conditional_presence",
      condition: "when_imported",
      registry_check: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 27 — Imported packages require import permit from Legal Metrology"
  },

  "PCR_R28_01": {
    rule_id: "PCR_R28_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "28",
    subrule: "1",
    title: "Dealer obligations — verification of declarations",
    category: "enforcement_registry",
    phase: 4,
    version: "2011-baseline",
    input_fields: [],
    validation: {
      type: "dealer_verification",
      inspector_action_required: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 28 — Dealer shall verify that declarations on packages are complete"
  },

  "PCR_R29_01": {
    rule_id: "PCR_R29_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "29",
    subrule: "1",
    title: "Packer responsibility — accuracy of quantity",
    category: "enforcement_registry",
    phase: 4,
    version: "2011-baseline",
    input_fields: [],
    validation: {
      type: "packer_responsibility",
      inspector_action_required: true
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 29 — Packer responsible for accuracy of quantity in pre-packed commodity"
  },

  "PCR_R30_01": {
    rule_id: "PCR_R30_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "30",
    subrule: "1",
    title: "Penalty provisions",
    category: "enforcement_registry",
    phase: 4,
    version: "2011-baseline",
    input_fields: [],
    validation: {
      type: "penalty_check",
      inspector_action_required: true,
      // Note: Penalty application is legal authority, not automated
      automated: false
    },
    evidence_required: true,
    physical_verification_required: false,
    human_review_on_ambiguity: false,
    legal_reference: "Rule 30 — Penalty for contravention of Rules"
  },

  // ═══════════════════════════════════════════════════════════
  // Rule 3: Applicability (not a compliance rule, but foundational)
  // ═══════════════════════════════════════════════════════════

  "PCR_R3_01": {
    rule_id: "PCR_R3_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "3",
    subrule: "1",
    title: "Chapter II applicability — quantity limits",
    category: "applicability",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "applicability_check",
      // Packages >25kg/l excluded (except cement/fertilizers)
      threshold_kg: 25,
      threshold_l: 25,
      exclusions: ["cement", "fertilizer"]
    },
    evidence_required: false,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 3 — Chapter II applies to packages containing not more than 25 kg or 25 litres"
  },

  // ═══════════════════════════════════════════════════════════
  // Rule 26: Exemptions
  // ═══════════════════════════════════════════════════════════

  "PCR_R26_01": {
    rule_id: "PCR_R26_01",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "26",
    subrule: "1",
    title: "Exemption — packages less than 10g or 10ml",
    category: "exemption",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["netQuantity"],
    validation: {
      type: "exemption_check",
      exemption_threshold_g: 10,
      exemption_threshold_ml: 10,
      non_exempt_products: ["milk_powder", "baby_food", "weaning_food", "infant_formula"]
    },
    evidence_required: false,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 26 — Packages containing less than 10g or 10ml exempt (except milk powder, baby food)"
  },

  "PCR_R26_02": {
    rule_id: "PCR_R26_02",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "26",
    subrule: "2",
    title: "Exemption — packages meant for institutional consumers",
    category: "exemption",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["packageType"],
    validation: {
      type: "exemption_check",
      exemption_type: "institutional"
    },
    evidence_required: false,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 26 — Packages meant for institutional consumers exempt"
  },

  "PCR_R26_03": {
    rule_id: "PCR_R26_03",
    source: "Legal Metrology (Packaged Commodities) Rules, 2011",
    rule: "26",
    subrule: "3",
    title: "Exemption — agricultural produce in gunny bags",
    category: "exemption",
    phase: 1,
    version: "2011-baseline",
    input_fields: ["packageType", "productName"],
    validation: {
      type: "exemption_check",
      exemption_type: "agricultural_gunny"
    },
    evidence_required: false,
    physical_verification_required: false,
    human_review_on_ambiguity: true,
    legal_reference: "Rule 26 — Agricultural produce in gunny bags exempt"
  }
};

/**
 * Rule database class
 */
class RuleDatabase {
  constructor() {
    this.rules = RULES;
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId) {
    return this.rules[ruleId] || null;
  }

  /**
   * Get all rules for a category
   */
  getRulesByCategory(category) {
    return Object.values(this.rules).filter(r => r.category === category);
  }

  /**
   * Get rules by phase
   */
  getRulesByPhase(phase) {
    return Object.values(this.rules).filter(r => r.phase === phase);
  }

  /**
   * Get Phase 1 rules (image-verifiable — no calibration needed)
   */
  getPhase1Rules() {
    return Object.values(this.rules).filter(r => r.phase === 1);
  }

  /**
   * Get Phase 2 rules (product-aware)
   */
  getPhase2Rules() {
    return Object.values(this.rules).filter(r => r.phase === 2);
  }

  /**
   * Get Phase 3 rules (physical inspection — requires calibration)
   */
  getPhase3Rules() {
    return Object.values(this.rules).filter(r => r.phase === 3);
  }

  /**
   * Get Phase 4 rules (enforcement/registry)
   */
  getPhase4Rules() {
    return Object.values(this.rules).filter(r => r.phase === 4);
  }

  /**
   * Get all applicable rules for a product category
   */
  getRulesForProductCategory(category) {
    return Object.values(this.rules).filter(r => {
      if (!r.product_scope || r.product_scope.length === 0) return true;
      return r.product_scope.includes(category);
    });
  }

  /**
   * Get rules that require calibration
   */
  getCalibrationRequiredRules() {
    return Object.values(this.rules).filter(r =>
      r.physical_verification_required || r.validation?.requires_calibration
    );
  }

  /**
   * Get all rule IDs
   */
  getAllRuleIds() {
    return Object.keys(this.rules);
  }

  /**
   * Get rule count by phase
   */
  getRuleCountByPhase() {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    Object.values(this.rules).forEach(r => {
      if (counts[r.phase] !== undefined) counts[r.phase]++;
    });
    return counts;
  }
}

module.exports = { RuleDatabase };
