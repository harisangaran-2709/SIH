"""Price / MRP validators."""
import re

CURRENCY_SYMBOLS = {'₹': 'INR', 'rs': 'INR', 'rs.': 'INR', 'inr': 'INR'}

def validate_mrp(text: str) -> dict:
    """Validate a string as MRP. Requires currency marker OR explicit price shape.
    Real MRP strings: '₹60', 'Rs. 60.00', 'INR 60', or 'MRP: 60.00'.
    Strings like '1 kg' or '8904463' must NOT validate as MRP.
    """
    t = text.strip()
    if not t:
        return {'valid': False, 'reason': 'Empty'}
    # Reject if it contains a weight/volume unit — that's a quantity, not MRP
    if re.search(r'\b(kg|g|gm|gram|grams|ml|l|litre|liter|pcs?|pieces?|caps?|tabs?|nos?|count)\b', t, re.I):
        return {'valid': False, 'reason': 'Contains weight/volume unit — not a price'}
    # Reject long pure-numeric strings (likely barcodes, dates, identifiers)
    digits_only = re.sub(r'\D', '', t)
    if len(digits_only) >= 8 and len(digits_only) == len(t):
        return {'valid': False, 'reason': 'Long pure-numeric string — not a price'}
    # Must have currency marker OR a clear decimal price shape
    has_currency = bool(re.search(r'(₹|rs\.?|inr|\$|usd|eur|gbp)', t, re.I))
    has_decimal_price = bool(re.search(r'\b\d{1,4}\.\d{2}\b', t))  # e.g. 60.00, 5.50
    if not has_currency and not has_decimal_price:
        return {'valid': False, 'reason': 'No currency marker and no decimal price shape'}
    # Extract numeric value
    cleaned = t.replace('₹', 'Rs').replace('INR', 'Rs')
    m = re.search(r'(?:Rs\.?\s*)?(\d+(?:[.,]\d{1,2})?)', cleaned, re.I)
    if not m:
        return {'valid': False, 'reason': 'No numeric price found'}
    try:
        value = float(m.group(1).replace(',', ''))
    except ValueError:
        return {'valid': False, 'reason': 'Invalid float'}
    if value <= 0:
        return {'valid': False, 'reason': 'Non-positive MRP'}
    if value > 1_000_000:
        return {'valid': False, 'reason': 'Unrealistically high MRP'}
    currency = 'INR'
    for sym, cur in CURRENCY_SYMBOLS.items():
        if sym in t:
            currency = cur; break
    return {'valid': True, 'value': value, 'currency': currency}

def validate_unit_price(text: str) -> dict:
    # ₹2.00/ml, ₹0.50/g, etc.
    m = re.search(r'(?:Rs\.?\s*)?(\d+(?:[.,]\d+)?)\s*(/\s*(ml|g|kg|l|gm|ml|litre|liter))', text, re.I)
    if m:
        try:
            val = float(m.group(1).replace(',', ''))
        except ValueError:
            return {'valid': False, 'reason': 'Invalid float'}
        unit = m.group(3).lower()
        return {'valid': True, 'value': val, 'unit': unit, 'currency': 'INR'}
    return {'valid': False, 'reason': 'No unit price pattern (e.g. ₹2.00/ml)'}
