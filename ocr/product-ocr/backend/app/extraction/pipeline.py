"""Label-driven extraction pipeline.
1. Detect semantic labels (NAME OF COMMODITY, NET QUANTITY, MRP, etc.)
2. Spatially associate each label with a value (same line right/left, next line, previous line, nearby)
3. Score each label-value pair (spatial + semantic + positive/negative evidence)
4. Resolve final fields from the best label-value pairs per field
5. Every field carries: value, bbox, label_evidence, value_evidence, reason
"""
import re
from typing import List, Dict, Any, Optional
from app.extraction.anchors import ANCHORS, normalize_for_match, fuzzy_score
from app.extraction.negative_classifier import (
    classify_for_field, is_location_text, is_numeric_identifier, is_address_block,
)
from app.validation.dates import validate_date
from app.validation.quantities import validate_quantity
from app.validation.prices import validate_mrp
from app.validation.batch import validate_batch
from app.validation.gstin import validate_gstin
from app.validation.fssai import validate_fssai


# ── Geometry helpers ──────────────────────────────────────────────────────

def bbox_center(b):
    return ((b[0]+b[2])/2, (b[1]+b[3])/2)

def bbox_horizontal_distance(a, b):
    """Distance between right edge of a and left edge of b (positive if a is left of b)."""
    if a[2] <= b[0]:
        return b[0] - a[2]
    if b[2] <= a[0]:
        return a[0] - b[2]
    return 0  # overlap

def bbox_vertical_distance(a, b):
    if a[3] <= b[1]:
        return b[1] - a[3]
    if b[3] <= a[1]:
        return a[1] - b[3]
    return 0

def bbox_is_same_line(a, b, tol=15):
    cy_a = (a[1] + a[3]) / 2
    cy_b = (b[1] + b[3]) / 2
    return abs(cy_a - cy_b) < tol

def bbox_is_below(a, b):
    return a[3] <= b[1] and (b[1] - a[3]) < 150

def bbox_is_above(a, b):
    return b[3] <= a[1] and (a[1] - b[3]) < 150

def bbox_distance(a, b):
    return (b[0]-a[2])**2 + (b[1]-a[1])**2 if b[0] > a[2] else (a[0]-b[2])**2 + (a[1]-b[1])**2


def _split_same_line(text: str) -> tuple:
    """Split 'LABEL : VALUE' or 'LABEL VALUE' or 'MRP160.00' or 'NetQty.1 kg' into (label, value)."""
    t = text.strip()
    # 1. Colon split (highest priority)
    if ':' in t:
        parts = t.split(':', 1)
        left = parts[0].strip()
        right = parts[1].strip()
        if left and right:
            return left, right
    # 2. Double-space / dash separator
    for sep in ['  ', ' - ', ' — ']:
        if sep in t:
            parts = t.split(sep, 1)
            left = parts[0].strip()
            right = parts[1].strip()
            if left and right:
                return left, right
    # 3. Label glued to value: split at the first digit or decimal
    #    Matches: "MRP160.00", "NetQty.1 kg", "NetQuantity500g"
    #    Strategy: find first position where letter→digit or digit→letter transition occurs
    #    and try splitting there
    #    We know label_part should be alpha-only or contain only alpha/punct
    import re as _re
    # Try to split on first digit when preceded by at least 3 letters (label)
    m = _re.match(r'^([A-Za-z.]{3,20}?)(\d[\d.,]*[a-zA-Z%]*)$', t)
    if m:
        left, right = m.group(1), m.group(2)
        if left and right:
            return left, right
    # Also try split on first space after alphanumeric word + number
    m2 = _re.match(r'^([A-Za-z.]+)(\d[\d.,]*\s*[a-zA-Z%]*)', t)
    if m2:
        left, right = m2.group(1).rstrip('.'), m2.group(2).strip()
        if left and right:
            return left, right
    # 4. Batch-style glued: "Batch NoB20260801" — label followed by alphanumeric batch value
    #    Detect known label prefixes followed by alphanumeric
    KNOWN_LABEL_PREFIXES = ['batch no', 'batch', 'lot no', 'lot', 'batch no.', 'lot no.']
    for prefix in KNOWN_LABEL_PREFIXES:
        if t.lower().startswith(prefix):
            rest = t[len(prefix):].strip()
            # If rest starts with "No" followed by alphanumeric (e.g., "NoB202..."), treat "No" as label suffix
            if rest.lower().startswith('no'):
                after_no = rest[2:].strip()
                if after_no and (after_no[0].isdigit() or after_no[0].isalpha()):
                    # Label = prefix + " No" (or full "Batch No"), value = after_no
                    full_label = prefix.title() if prefix.lower() == 'batch' else (prefix.title() if prefix.lower().startswith('batch') else prefix.title())
                    # Normalize label to include "No"
                    if 'no' not in full_label.lower():
                        full_label += ' No'
                    return full_label, after_no
            if rest:
                return (prefix.title() if prefix.lower() in ('batch','lot') else prefix), rest
    return t, ''


# ── Label detection ───────────────────────────────────────────────────────

def detect_labels(lines: List[Dict]) -> List[Dict]:
    """For each line, identify which field it is a label for.
    First tries to split label : value on same line.
    Returns list of {field, label_text, label_bbox, match_score, matched_alias,
                    has_inline_value, inline_value, inline_value_bbox}."""
    labels = []
    for ln in lines:
        # ── Step 1: Try to split label : value on this line ───────────────
        label_part, value_part = _split_same_line(ln['text'])
        label_norm = normalize_for_match(label_part)
        if not label_norm:
            continue

        # ── Step 2: Score the label part against anchors ─────────────────
        best_field = None
        best_score = 0.0
        best_alias = None
        for field, aliases in ANCHORS.items():
            for alias in aliases:
                alias_norm = normalize_for_match(alias)
                if alias_norm and alias_norm in label_norm:
                    # Substring match is strong only if alias is at a word boundary
                    # Prevent "exp" from matching "export", "extra", etc.
                    import re as _re
                    # Build a pattern that matches alias as complete word
                    word_boundary_pattern = r'(?<![A-Za-z])' + re.escape(alias_norm) + r'(?![A-Za-z])'
                    if _re.search(word_boundary_pattern, label_norm):
                        score = 0.95 if len(alias_norm) >= 6 else (0.85 if len(alias_norm) >= 3 else 0.75)
                        if score > best_score:
                            best_score = score
                            best_field = field
                            best_alias = alias
                        best_score = score
                        best_field = field
                        best_alias = alias
                elif alias_norm:
                    fz = fuzzy_score(label_norm, alias_norm)
                    if fz >= 0.78 and fz > best_score:
                        best_score = fz
                        best_field = field
                        best_alias = alias

        if best_field:
            # ── Step 3: If label matched, determine if value is inline ────
            inline_val = ''
            inline_bbox = None
            if value_part and len(value_part) >= 1:
                # Inline value found — estimate its bbox as right portion of line bbox
                # We can't know exact split, so mark as inline
                inline_val = value_part
                # Use the full line bbox; the value portion is roughly right 60%
                lx1, ly1, lx2, ly2 = ln['bbox']
                est_x1 = lx1 + int((lx2 - lx1) * 0.4)
                inline_bbox = [est_x1, ly1, lx2, ly2]

            labels.append({
                'field': best_field,
                'label_text': label_part,          # just the label portion
                'label_bbox': ln['bbox'],
                'label_confidence': ln.get('confidence', 0),
                'match_score': best_score,
                'matched_alias': best_alias,
                'has_inline_value': bool(inline_val),
                'inline_value': inline_val,
                'inline_value_bbox': inline_bbox,
                'full_line_text': ln['text'],       # original full token (for debug)
            })

    return labels


# ── Value association ─────────────────────────────────────────────────────

def find_value_candidates(label_bbox, lines: List[Dict], exclude_lines: List[Dict]) -> List[Dict]:
    """For a given label bbox, find candidate value lines.
    Priority:
      1. same line, immediately right
      2. same line, immediately left
      3. next line below
      4. previous line above
      5. nearest spatially (bbox distance)
    Returns sorted by association score (best first)."""
    candidates = []
    exclude_set = {id(l) for l in exclude_lines}
    for ln in lines:
        if id(ln) in exclude_set:
            continue
        if ln.get('bbox') == label_bbox:
            continue
        text = ln['text'].strip()
        if not text:
            continue
        # Compute spatial position relative to label
        score = 0.0
        pos = ''
        if bbox_is_same_line(label_bbox, ln['bbox']):
            if label_bbox[2] < ln['bbox'][0]:
                # Label left, value right — same line
                hd = bbox_horizontal_distance(label_bbox, ln['bbox'])
                # Closer = higher
                score = 0.95 - min(0.5, hd / 600)
                pos = 'same_line_right'
            elif ln['bbox'][2] < label_bbox[0]:
                hd = bbox_horizontal_distance(ln['bbox'], label_bbox)
                score = 0.85 - min(0.4, hd / 600)
                pos = 'same_line_left'
        elif bbox_is_below(label_bbox, ln['bbox']):
            vd = bbox_vertical_distance(label_bbox, ln['bbox'])
            score = 0.80 - min(0.4, vd / 200)
            pos = 'line_below'
        elif bbox_is_above(label_bbox, ln['bbox']):
            vd = bbox_vertical_distance(ln['bbox'], label_bbox)
            score = 0.65 - min(0.3, vd / 200)
            pos = 'line_above'
        else:
            # Nearby
            dx = label_bbox[0] - ln['bbox'][0]
            dy = label_bbox[1] - ln['bbox'][1]
            d = (dx*dx + dy*dy) ** 0.5
            if d < 250:
                score = 0.40 - min(0.3, d / 800)
                pos = 'nearby'
        if score > 0:
            candidates.append({
                'text': text,
                'bbox': ln['bbox'],
                'confidence': ln.get('confidence', 0),
                'position': pos,
                'spatial_score': round(score, 2),
            })
    candidates.sort(key=lambda c: -c['spatial_score'])
    return candidates


# ── Field-specific value validation & scoring ─────────────────────────────

def _val_product_name(value_text, field, value_bbox=None, label_bbox=None):
    """Score candidate value for product_name field."""
    cls = classify_for_field(value_text, 'product_name')
    pos = []
    neg = list(cls['negative_evidence'])
    if cls['product_vocab_matches']:
        pos.append(f"product_vocab:{cls['product_vocab_matches']}")
    # Pure number or identifier → reject
    if cls['identifier_score'] > 0.3:
        neg.append(f"identifier_rejected:{cls['identifier_score']}")
    # Location → reject
    if cls['location_score'] > 0.3:
        neg.append(f"location_rejected:{cls['location_score']}")
    # Brand-y shape: starts uppercase, 1-4 words, alpha-heavy
    words = value_text.split()
    if 1 <= len(words) <= 6 and re.match(r'^[A-Z]', value_text):
        pos.append("brand_shape")
    if re.search(r'[A-Za-z]{3,}', value_text):
        pos.append("has_alpha")
    return {'pos': pos, 'neg': neg, 'vocab': cls['product_vocab_matches']}

def _val_quantity(value_text):
    v = validate_quantity(value_text)
    if v.get('valid'):
        return {'pos': ['valid_quantity_pattern'], 'neg': [], 'value': v}
    return {'pos': [], 'neg': ['no_quantity_pattern'], 'value': v}

def _val_mrp(value_text):
    v = validate_mrp(value_text)
    if v.get('valid'):
        return {'pos': ['valid_mrp_pattern'], 'neg': [], 'value': v}
    return {'pos': [], 'neg': ['no_mrp_pattern'], 'value': v}

def _val_date(value_text):
    v = validate_date(value_text)
    if v.get('valid'):
        return {'pos': ['valid_date_pattern'], 'neg': [], 'value': v}
    return {'pos': [], 'neg': ['no_date_pattern'], 'value': v}

def _val_batch(value_text):
    v = validate_batch(value_text)
    if v.get('valid'):
        return {'pos': ['valid_batch_pattern'], 'neg': [], 'value': v}
    return {'pos': [], 'neg': ['no_batch_pattern'], 'value': v}


# ── Build label-value pairs per field ─────────────────────────────────────

def build_label_value_pairs(lines: List[Dict], labels: List[Dict]) -> Dict[str, List[Dict]]:
    """For each detected label, find best value candidates and score them.
    Prioritises inline label:value pairs over nearby-line candidates.
    Returns dict: { field: [ {label, value, scores, evidence} ] }"""
    pairs: Dict[str, List[Dict]] = {}

    for label_info in labels:
        field = label_info['field']

        # ── Step 1: If label has inline value, create a high-priority pair ──
        if label_info.get('has_inline_value') and label_info.get('inline_value'):
            inline_val = label_info['inline_value']
            inline_bbox = label_info.get('inline_value_bbox') or label_info['label_bbox']

            fval = {}
            if field == 'product_name':
                fval = _val_product_name(inline_val, field)
            elif field == 'quantity':
                fval = _val_quantity(inline_val)
            elif field == 'mrp':
                fval = _val_mrp(inline_val)
            elif field in ('manufacturing_date', 'expiry_date'):
                fval = _val_date(inline_val)
            elif field == 'batch_number':
                fval = _val_batch(inline_val)
            elif field == 'fssai_number':
                fval = {'pos': ['near_label'], 'neg': [], 'value': validate_fssai(inline_val)}
            elif field == 'gstin':
                fval = {'pos': ['near_label'], 'neg': [], 'value': validate_gstin(inline_val)}
            else:
                fval = {'pos': ['inline_label_value'], 'neg': []}

            hard_reject = any('rejected' in n for n in fval.get('neg', []))
            neg_penalty = min(0.9, len(fval.get('neg', [])) * 0.20)
            pos_boost = min(0.5, len(fval.get('pos', [])) * 0.10)
            final = max(0.0, min(1.0, 0.97 + pos_boost - neg_penalty))
            if hard_reject:
                final = min(final, 0.10)

            pairs.setdefault(field, []).append({
                'field': field,
                'label': {
                    'text': label_info['label_text'],
                    'bbox': label_info['label_bbox'],
                    'confidence': label_info['label_confidence'],
                    'match_score': label_info['match_score'],
                    'matched_alias': label_info['matched_alias'],
                },
                'value': {
                    'text': inline_val,
                    'bbox': inline_bbox,
                    'confidence': label_info['label_confidence'],
                    'position': 'inline',
                },
                'spatial_score': 0.97,
                'positive_evidence': fval.get('pos', []),
                'negative_evidence': fval.get('neg', []),
                'final_score': round(final, 3),
                'hard_rejected': hard_reject,
                'field_validation': {k: fval.get(k) for k in ('value',) if fval.get(k)},
            })
            continue  # Skip nearby-line search for labels with inline values

        # ── Step 2: Find nearby-line candidates ──────────────────────────
        candidates = find_value_candidates(
            label_info['label_bbox'], lines, exclude_lines=[]
        )
        scored_pairs = []
        for cand in candidates:
            fval = {}
            if field == 'product_name':
                fval = _val_product_name(cand['text'], field)
            elif field == 'quantity':
                fval = _val_quantity(cand['text'])
            elif field == 'mrp':
                fval = _val_mrp(cand['text'])
            elif field in ('manufacturing_date', 'expiry_date'):
                fval = _val_date(cand['text'])
            elif field == 'batch_number':
                fval = _val_batch(cand['text'])
            else:
                fval = {'pos': ['near_label'], 'neg': []}

            spatial = cand['spatial_score']
            neg_penalty = min(0.9, len(fval['neg']) * 0.20)
            pos_boost = min(0.5, len(fval['pos']) * 0.10)
            hard_reject = any('rejected' in n for n in fval['neg'])
            final = max(0.0, min(1.0, spatial + pos_boost - neg_penalty))
            if hard_reject:
                final = min(final, 0.10)

            scored_pairs.append({
                'field': field,
                'label': {
                    'text': label_info['label_text'],
                    'bbox': label_info['label_bbox'],
                    'confidence': label_info['label_confidence'],
                    'match_score': label_info['match_score'],
                    'matched_alias': label_info['matched_alias'],
                },
                'value': {
                    'text': cand['text'],
                    'bbox': cand['bbox'],
                    'confidence': cand['confidence'],
                    'position': cand['position'],
                },
                'spatial_score': spatial,
                'positive_evidence': fval.get('pos', []),
                'negative_evidence': fval.get('neg', []),
                'final_score': round(final, 3),
                'hard_rejected': hard_reject,
                'field_validation': {k: fval.get(k) for k in ('value',) if fval.get(k)},
            })
        scored_pairs.sort(key=lambda p: -p['final_score'])
        pairs.setdefault(field, []).extend(scored_pairs)

    for f in pairs:
        pairs[f].sort(key=lambda p: -p['final_score'])
    return pairs


# ── Resolve final fields from pairs ───────────────────────────────────────

def resolve_fields_from_pairs(pairs: Dict[str, List[Dict]], lines: List[Dict]) -> Dict[str, Any]:
    """Pick best pair per field, build final result with evidence."""
    results = {}

    # Helper: choose best pair. Must have valid field_validation for structured fields.
    def pick(field):
        candidates = pairs.get(field, [])
        # For fields with structured validators: require validated pair
        needs_validation = field in ('quantity', 'mrp', 'manufacturing_date', 'expiry_date',
                                     'batch_number', 'fssai_number', 'gstin')
        for p in candidates:
            if p['hard_rejected']:
                continue
            # Structured fields: only accept if validation passes (or inline)
            if needs_validation:
                fval = p.get('field_validation', {})
                val = fval.get('value', {}) if isinstance(fval.get('value'), dict) else fval.get('value')
                if val and val.get('valid'):
                    if p['final_score'] >= 0.30:
                        return p
                # If inline (high score) and validation fails, still accept if very high
                if p['value']['position'] == 'inline' and p['final_score'] >= 0.95:
                    return p
            else:
                if p['final_score'] >= 0.30:
                    return p
        # For structured fields with no validated candidate, return None (missing/needs review)
        return None

    # ── product_name ──────────────────────────────────────────────
    pair = pick('product_name')
    if pair:
        results['product_name'] = {
            'value': pair['value']['text'],
            'source': 'label_association',
            'bbox': pair['value']['bbox'],
            'label_evidence': {
                'text': pair['label']['text'],
                'bbox': pair['label']['bbox'],
            },
            'value_evidence': {
                'text': pair['value']['text'],
                'bbox': pair['value']['bbox'],
            },
            'position': pair['value']['position'],
            'spatial_score': pair['spatial_score'],
            'positive_evidence': pair['positive_evidence'],
            'negative_evidence': pair['negative_evidence'],
            'reason': f"Value associated with explicit label '{pair['label']['text']}' (alias '{pair['label']['matched_alias']}'). {pair['value']['position']}.",
        }

    # ── quantity ──────────────────────────────────────────────────
    pair = pick('quantity')
    if pair:
        fv = pair.get('field_validation', {})
        qty = fv.get('value', {}) if fv else {}
        if qty.get('valid'):
            results['quantity'] = {
                'value': f"{qty['value']} {qty['unit']}",
                'unit': qty['unit'],
                'normalized_value': qty.get('normalized_value'),
                'source': 'label_association',
                'bbox': pair['value']['bbox'],
                'label_evidence': {
                    'text': pair['label']['text'],
                    'bbox': pair['label']['bbox'],
                },
                'value_evidence': {
                    'text': pair['value']['text'],
                    'bbox': pair['value']['bbox'],
                },
                'reason': f"Quantity value associated with label '{pair['label']['text']}'.",
            }

    # ── MRP ───────────────────────────────────────────────────────
    pair = pick('mrp')
    if pair:
        fv = pair.get('field_validation', {})
        mrp_v = fv.get('value', {}) if fv else {}
        if mrp_v.get('valid'):
            results['mrp'] = {
                'value': mrp_v['value'],
                'currency': mrp_v.get('currency', '₹'),
                'source': 'label_association',
                'bbox': pair['value']['bbox'],
                'label_evidence': {
                    'text': pair['label']['text'],
                    'bbox': pair['label']['bbox'],
                },
                'value_evidence': {
                    'text': pair['value']['text'],
                    'bbox': pair['value']['bbox'],
                },
                'reason': f"MRP value associated with label '{pair['label']['text']}'.",
            }
    # ── Dates ─────────────────────────────────────────────────────
    for field_key, anchor_fields in [
        ('manufacturing_date', ['manufacturing_date']),
        ('expiry_date', ['expiry_date']),
    ]:
        for af in anchor_fields:
            pair = pick(af)
            if pair:
                fv = pair.get('field_validation', {})
                dv = fv.get('value', {}) if fv else {}
                if dv.get('valid'):
                    results[field_key] = {
                        'value': dv['value'],
                        'source': 'label_association',
                        'bbox': pair['value']['bbox'],
                        'label_evidence': {
                            'text': pair['label']['text'],
                            'bbox': pair['label']['bbox'],
                        },
                        'value_evidence': {
                            'text': pair['value']['text'],
                            'bbox': pair['value']['bbox'],
                        },
                        'reason': f"Date associated with label '{pair['label']['text']}'.",
                    }
                # pick() already requires validation for structured fields
                break

    # ── Batch ─────────────────────────────────────────────────────
    pair = pick('batch_number')
    if pair:
        fv = pair.get('field_validation', {})
        bv = fv.get('value', {}) if fv else {}
        if bv.get('valid'):
            results['batch_number'] = {
                'value': bv['value'],
                'source': 'label_association',
                'bbox': pair['value']['bbox'],
                'label_evidence': {
                    'text': pair['label']['text'],
                    'bbox': pair['label']['bbox'],
                },
                'value_evidence': {
                    'text': pair['value']['text'],
                    'bbox': pair['value']['bbox'],
                },
                'reason': f"Batch value associated with label '{pair['label']['text']}'.",
            }

    # ── Entity (manufacturer / marketed) ──────────────────────────
    for fld, keys in [
        ('manufacturer_details', ['manufacturer_details']),
        ('marketed_by_details', ['marketed_by_details']),
    ]:
        pair = pick(fld)
        if pair:
            inline_val = pair['value']['text'].strip()
            if not inline_val or len(inline_val) < 2:
                inline_val = ''
            # Try to extract company name from label text after "by"
            company_name = ''
            lower_lbl = pair['label']['text'].lower()
            for marker in ['by.', 'by ', 'packed & marketed by:', 'manufactured by:']:
                idx = lower_lbl.find(marker)
                if idx >= 0:
                    rest = pair['label']['text'][idx+len(marker):].strip()
                    if len(rest) > 2:
                        company_name = rest
                        break
            # Prefer inline value, else extracted company name, else pair value
            final_value = inline_val if inline_val else (company_name if company_name else pair['value']['text'])
            results[fld] = {
                'value': final_value,
                'source': 'label_association',
                'bbox': pair['value']['bbox'],
                'label_evidence': {
                    'text': pair['label']['text'],
                    'bbox': pair['label']['bbox'],
                },
                'value_evidence': {
                    'text': final_value,
                    'bbox': pair['value']['bbox'],
                },
                'reason': f"Manufacturer extracted from label '{pair['label']['text']}'.",
            }

    # ── Customer care ─────────────────────────────────────────────
    pair = pick('customer_care')
    if pair:
        val_text = pair['value']['text'].strip()
        if val_text:
            results['customer_care'] = {
                'value': val_text,
                'source': 'label_association',
                'bbox': pair['value']['bbox'],
                'label_evidence': {
                    'text': pair['label']['text'],
                    'bbox': pair['label']['bbox'],
                },
                'value_evidence': {
                    'text': val_text,
                    'bbox': pair['value']['bbox'],
                },
                'reason': f"Contact info from inline label-value near '{pair['label']['text']}'.",
            }

    # ── FSSAI / GSTIN / licence ───────────────────────────────────
    for fld, validator in [
        ('fssai_number', validate_fssai),
        ('gstin', validate_gstin),
    ]:
        pair = pick(fld)
        if pair:
            v = validator(pair['value']['text'])
            if v.get('valid'):
                results[fld] = {
                    'value': v['value'],
                    'source': 'label_association',
                    'bbox': pair['value']['bbox'],
                    'label_evidence': {
                        'text': pair['label']['text'],
                        'bbox': pair['label']['bbox'],
                    },
                    'value_evidence': {
                        'text': pair['value']['text'],
                        'bbox': pair['value']['bbox'],
                    },
                    'reason': f"{fld} associated with label '{pair['label']['text']}'.",
                }

    return results


# ── Public entry: build candidates (callers wrap as result schema) ────────

def build_candidates(lines: List[Dict], ocr_result: Dict) -> Dict[str, Any]:
    """Label-driven candidate generation.
    Returns dict with: final fields, all pairs (for debug), and rejected candidates.
    """
    labels = detect_labels(lines)
    pairs = build_label_value_pairs(lines, labels)
    final = resolve_fields_from_pairs(pairs, lines)

    # Rejected candidates (top scoring ones that were hard-rejected)
    rejected = []
    for field, plist in pairs.items():
        for p in plist[:5]:
            if p['hard_rejected']:
                rejected.append({
                    'field': field,
                    'value_text': p['value']['text'],
                    'value_bbox': p['value']['bbox'],
                    'label_text': p['label']['text'],
                    'spatial_score': p['spatial_score'],
                    'final_score': p['final_score'],
                    'rejection_reasons': p['negative_evidence'],
                })

    return {
        'final': final,
        'pairs': pairs,
        'labels': labels,
        'rejected': rejected,
    }
