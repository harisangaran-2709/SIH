"""Anchor alias dictionary for fuzzy label matching — label-first extraction."""
from typing import Dict, List

# All label aliases normalized and keyed by semantic field.
# Priority: explicit full-text match > fuzzy ratio match.
ANCHORS: Dict[str, List[str]] = {
    # ── Product / commodity ──────────────────────────────────────────────
    'product_name': [
        # Primary declaration label
        'name of commodity',
        # Common variations
        'commodity', 'product name', 'product', 'product name',
        'description', 'item', 'item name',
    ],
    # ── MRP ──────────────────────────────────────────────────────────────
    'mrp': [
        'mrp', 'm.r.p.', 'm.r.p', 'm.r.p',
        'maximum retail price', 'max retail price', 'max. retail price',
        'retail price', 'sale price',
    ],
    # ── Quantity ─────────────────────────────────────────────────────────
    'quantity': [
        'net qty', 'net quantity', 'net qty.',
        'net wt', 'net weight', 'net wt.',
        'net volume', 'net vol', 'contents', 'content',
        'gross wt', 'quantity', 'wt.', 'weight',
    ],
    # ── Dates ─────────────────────────────────────────────────────────────
    'manufacturing_date': [
        'mfg date', 'mfg. date', 'mfg.date', 'date of mfg', 'date of manufacture',
        'manufacturing date', 'manufactured on', 'packed on', 'date of packing', 'packing date',
        'mfg', 'mfd', 'mfd.',
    ],
    'expiry_date': [
        'exp date', 'exp. date', 'exp', 'expiry', 'expiry date',
        'expiry date', 'use before', 'best before', 'use by', 'exp.date',
        'shelf life', 'expiration',
    ],
    # ── Batch ────────────────────────────────────────────────────────────
    'batch_number': [
        'batch no', 'batch no.', 'batch number', 'batch number.',
        'lot no', 'lot no.', 'lot number', 'lot number.',
        'batchno', 'batch', 'lot', 'lotno',
    ],
    # ── Entity (manufacturer / packer / marketer) ─────────────────────────
    'manufacturer_details': [
        'manufactured by', 'mfd by', 'mfg by', 'mfg.',
        'manufactured at', 'manufactured for',
        'manufacturer', 'mfd.', 'mfr.',
        'packed by', 'packed & marketed by', 'packed and marketed by',
    ],
    'marketed_by_details': [
        'marketed by', 'mkt by', 'mktd by',
        'marketed at', 'marketed for',
        'imported by', 'importer',
    ],
    # ── Customer care ────────────────────────────────────────────────────
    'customer_care': [
        'customer care', 'consumer care', 'consumer complaints',
        'complaints contact', 'helpline', 'help line',
        'toll free', 'contact us', 'feedback', 'contact no',
        'for consumer complaints contact',
    ],
    # ── FSSAI / licence ─────────────────────────────────────────────────
    'fssai_number': [
        'fssai', 'fssai no', 'fssai no.', 'fssai number',
        'fssai lic', 'fssai licence', 'fssai license',
        'fssai license no',
    ],
    'gstin': [
        'gstin', 'gst no', 'gst no.', 'gst number', 'gstin no',
    ],
    'license_details': [
        'lic no', 'lic. no', 'lic no.', 'licence no', 'license no',
        'lic number', 'lic. number',
    ],
    # ── Unit price ───────────────────────────────────────────────────────
    'printed_unit_price': [
        'unit sale price', 'unit price', 'price per',
        'price/gm', 'price/g', 'price/ml', 'price/kg', 'price/l',
        'price per unit', 'per unit',
    ],
    # ── Country of origin ─────────────────────────────────────────────────
    'country_of_origin': [
        'country of origin', 'country of origin:', 'country of origin.',
        'made in', 'product of', 'manufactured in',
    ],
    # ── Ingredients ───────────────────────────────────────────────────────
    'ingredients': [
        'ingredients', 'composition', 'contents:', 'nutritional facts',
    ],
    # ── Website / phone / email ───────────────────────────────────────────
    'website': ['website', 'web', 'www'],
    'phone': ['phone', 'ph', 'ph:', 'tel', 'tel:', 'mobile', 'mob', 'mob:'],
    'email': ['email', 'e-mail', 'mail', 'mail:'],
}

def normalize_for_match(text: str) -> str:
    s = text.lower()
    s = s.replace(':', ' ').replace('.', ' ').replace(',', ' ')
    s = ' '.join(s.split())
    return s

def fuzzy_score(a: str, b: str) -> float:
    """SequenceMatcher ratio."""
    from difflib import SequenceMatcher
    return SequenceMatcher(None, a, b).ratio()

def match_anchor(text: str, field: str, threshold: float = 0.78) -> float:
    norm = normalize_for_match(text)
    aliases = ANCHORS.get(field, [])
    best = 0.0
    for alias in aliases:
        a = normalize_for_match(alias)
        if a in norm:
            return 1.0
        best = max(best, fuzzy_score(norm, a))
    return best if best >= threshold else 0.0
