/**
 * compliance/productClassifier.js
 * --------------------------------
 * Classifies products and packages based on extracted fields
 */

/**
 * Product categories and keywords
 */
const PRODUCT_CATEGORIES = {
  pulses: {
    keywords: ['dal', 'toor', 'moong', 'urad', 'chana', 'masoor', 'pulse', 'lentil'],
    isFood: true,
    subcategories: ['toor_dal', 'moong_dal', 'urad_dal', 'chana_dal', 'masoor_dal'],
  },
  cereals: {
    keywords: ['rice', 'wheat', 'cereal', 'grain', 'basmati', 'sona', 'masoori'],
    isFood: true,
    subcategories: ['rice', 'wheat'],
  },
  flour: {
    keywords: ['atta', 'flour', 'maida', 'rawa', 'suji', 'besan'],
    isFood: true,
    subcategories: ['wheat_flour', 'rice_flour', 'gram_flour'],
  },
  edible_oil: {
    keywords: ['oil', 'ghee', 'vanaspati', 'butter', 'refined'],
    isFood: true,
    subcategories: ['sunflower_oil', 'mustard_oil', 'coconut_oil', 'palm_oil', 'ghee'],
  },
  fish_oil: {
    keywords: ['fish oil', 'omega-3', 'omega 3', 'cod liver oil', 'salmon oil'],
    isFood: true,
    isFoodSupplement: true,
  },
  animal_oil: {
    keywords: ['animal oil', 'lard', 'tallow', 'animal fat'],
    isFood: true,
  },
  food_supplement: {
    keywords: ['supplement', 'dietary supplement', 'vitamin', 'capsule', 'tablet', 'nutraceutical'],
    isFood: true,
    isFoodSupplement: true,
  },
  pharmaceutical: {
    keywords: ['medicine', 'drug', 'pharmaceutical', 'tablet', 'capsule', 'syrup', 'injection'],
    isFood: false,
    isPharmaceutical: true,
  },
  salt: {
    keywords: ['salt', 'namak', 'iodised', 'iodized'],
    isFood: true,
  },
  sugar: {
    keywords: ['sugar', 'shakkar', 'jaggery', 'gur'],
    isFood: true,
  },
  spices: {
    keywords: ['masala', 'spice', 'turmeric', 'chilli', 'pepper', 'cumin', 'coriander'],
    isFood: true,
  },
  tea: {
    keywords: ['tea', 'chai', 'green tea', 'black tea'],
    isFood: true,
  },
  coffee: {
    keywords: ['coffee'],
    isFood: true,
  },
  biscuits: {
    keywords: ['biscuit', 'cookie', 'cracker'],
    isFood: true,
  },
  beverages: {
    keywords: ['juice', 'drink', 'beverage', 'soft drink', 'aerated', 'cola'],
    isFood: true,
    subcategories: ['fruit_juice', 'soft_drink', 'aerated_water'],
  },
  milk_powder: {
    keywords: ['milk powder', 'dairy', 'paneer'],
    isFood: true,
  },
  detergent: {
    keywords: ['detergent', 'washing powder', 'surf'],
    isFood: false,
  },
  soap: {
    keywords: ['soap', 'bathing bar'],
    isFood: false,
  },
  cosmetics: {
    keywords: ['cream', 'lotion', 'shampoo', 'cosmetic', 'beauty'],
    isFood: false,
    subcategories: ['skin_cream', 'hair_oil', 'shampoo', 'lotion'],
  },
  paint: {
    keywords: ['paint', 'enamel', 'distemper', 'varnish'],
    isFood: false,
  },
  cement: {
    keywords: ['cement', 'concrete'],
    isFood: false,
  },
  textile: {
    keywords: ['fabric', 'cloth', 'textile', 'cotton', 'polyester'],
    isFood: false,
    subcategories: ['bed_sheet', 'towel', 'dhoti', 'saree'],
  },
};

/**
 * Package type indicators
 */
const PACKAGE_INDICATORS = {
  retail_package: {
    keywords: ['retail', 'consumer', 'mrp', 'maximum retail price'],
    quantityRange: { min: 0, max: 25, unit: 'kg' },
  },
  wholesale_package: {
    keywords: ['wholesale', 'bulk', 'distributor'],
    quantityRange: { min: 25, max: null, unit: 'kg' },
  },
  export_package: {
    keywords: ['export', 'for export only', 'not for retail sale'],
  },
  imported_package: {
    keywords: ['imported by', 'importer', 'country of origin'],
  },
  industrial_package: {
    keywords: ['industrial use', 'not for human consumption'],
  },
  institutional_package: {
    keywords: ['institutional', 'hospital', 'canteen'],
  },
};

/**
 * Product classifier class
 */
class ProductClassifier {
  /**
   * Classify product based on extracted fields
   * @param {Object} fields - Extracted fields
   * @returns {Object} Product classification
   */
  classifyProduct(fields) {
    const productName = fields.productName?.value || '';
    const manufacturer = fields.manufacturer?.value || '';
    const allText = `${productName} ${manufacturer}`.toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    // Match against categories.
    // Iterate in priority order: specific categories first so their longer
    // keywords take precedence over the generic "oil" / "supplement" keywords.
    const PRIORITY_ORDER = [
      'fish_oil', 'animal_oil', 'food_supplement', 'pharmaceutical',
      'pulses', 'cereals', 'flour', 'edible_oil', 'salt', 'sugar',
      'spices', 'tea', 'coffee', 'biscuits', 'beverages', 'milk_powder',
      'detergent', 'soap', 'cosmetics', 'paint', 'cement', 'textile',
    ];

    for (const category of PRIORITY_ORDER) {
      const config = PRODUCT_CATEGORIES[category];
      if (!config) continue;

      let score = 0;
      // Sort keywords longest-first so "fish oil" beats "oil" on the same text
      const sortedKeywords = [...config.keywords].sort((a, b) => b.length - a.length);
      for (const keyword of sortedKeywords) {
        if (allText.includes(keyword.toLowerCase())) {
          score += 1;
          // Bonus: exact match of a long keyword (>5 chars) scores +1 extra
          if (keyword.length > 5) score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { category, config };
      }
    }

    if (!bestMatch) {
      return {
        category: 'unknown',
        confidence: 0,
        isFood: false,
      };
    }

    // Try to determine subcategory
    let subcategory = null;
    if (bestMatch.config.subcategories) {
      for (const sub of bestMatch.config.subcategories) {
        const subKeyword = sub.replace(/_/g, ' ');
        if (allText.includes(subKeyword)) {
          subcategory = sub;
          break;
        }
      }
    }

    // Confidence based on field quality
    let confidence = Math.min(0.5 + (bestScore * 0.2), 1.0);
    if (fields.productName?.status === 'DETECTED') {
      confidence = Math.min(confidence + 0.2, 1.0);
    }

    // If confidence is low, mark status as REVIEW
    const status = confidence < 0.5 ? 'REVIEW' : 'DETECTED';
    const reason = confidence < 0.5
      ? 'Low confidence product classification — inspector should verify product category'
      : `Classified as ${bestMatch.category} based on keyword match`;

    return {
      category: bestMatch.category,
      subcategory,
      confidence,
      isFood: bestMatch.config.isFood,
      isFoodSupplement: bestMatch.config.isFoodSupplement || false,
      isPharmaceutical: bestMatch.config.isPharmaceutical || false,
      status,
      reason,
    };
  }

  /**
   * Classify package type
   * @param {Object} fields - Extracted fields
   * @returns {Object} Package classification
   */
  classifyPackage(fields) {
    const allText = Object.values(fields)
      .map(f => f.value || '')
      .join(' ')
      .toLowerCase();

    const scores = {};

    // Score each package type
    for (const [type, config] of Object.entries(PACKAGE_INDICATORS)) {
      let score = 0;

      // Keyword matching
      if (config.keywords) {
        for (const keyword of config.keywords) {
          if (allText.includes(keyword.toLowerCase())) {
            score += 2;
          }
        }
      }

      // Quantity-based inference
      if (config.quantityRange && fields.netQuantity?.normalizedValue) {
        const qty = fields.netQuantity.normalizedValue;
        if (qty.unit === 'kg' || qty.unit === 'l') {
          const value = qty.value;
          const min = config.quantityRange.min;
          const max = config.quantityRange.max;

          if ((min === null || value >= min) && (max === null || value <= max)) {
            score += 1;
          }
        }
      }

      scores[type] = score;
    }

    // Find best match
    let bestType = 'retail_package'; // default
    let bestScore = scores.retail_package || 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Special case: if MRP is detected, very likely retail
    if (fields.mrp?.status === 'DETECTED' && bestType !== 'export_package') {
      bestType = 'retail_package';
      bestScore += 2;
    }

    // Confidence calculation
    let confidence = bestScore > 0 ? Math.min(0.6 + (bestScore * 0.1), 0.95) : 0.5;

    return {
      type: bestType,
      confidence,
    };
  }

  /**
   * Detect if package is export-only
   */
  isExportPackage(fields) {
    const exportKeywords = ['export', 'for export only', 'not for retail sale'];
    const allText = Object.values(fields)
      .map(f => f.value || '')
      .join(' ')
      .toLowerCase();

    for (const keyword of exportKeywords) {
      if (allText.includes(keyword)) {
        return true;
      }
    }

    return false;
  }
}

module.exports = { ProductClassifier };
