"""Full end-to-end pipeline trace for all test images."""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(__file__))

import cv2
import numpy as np
from io import BytesIO

from app.ocr.base import OCREngine
from app.layout.line_grouping import group_lines
from app.extraction.anchors import ANCHORS
from app.extraction.pipeline import detect_labels, build_label_value_pairs, resolve_fields_from_pairs, _split_same_line
from app.validation.quantities import validate_quantity
from app.validation.prices import validate_mrp
from app.validation.dates import validate_date
from app.validation.batch import validate_batch


def run_trace(img_path: str, label: str):
    print("\n" + "=" * 80)
    print(f"IMAGE: {label} — {img_path}")
    print("=" * 80)

    # Load image
    img = cv2.imread(img_path)
    if img is None:
        print(f"ERROR: cannot load image: {img_path}")
        return
    h, w = img.shape[:2]
    print(f"Image: {w}x{h}")

    # ── STAGE 1: OCR ────────────────────────────────────────────────────────
    print("\n### STAGE 1: RAW OCR ###")
    engine = OCREngine("paddle")
    tokens = engine.recognize(np.asarray(img))
    print(f"Tokens: {len(tokens)}")
    for t in tokens:
        print(f"  conf={t['confidence']:.3f}  bbox={t['bbox']}  text=\"{t['text']}\"")

    # ── STAGE 2: Line grouping ──────────────────────────────────────────────
    print("\n### STAGE 2: LINE GROUPING ###")
    lines = group_lines(tokens)
    print(f"Lines: {len(lines)}")
    for ln in lines:
        print(f"  y={ln['bbox'][1]:4d}-{ln['bbox'][3]:4d}  x={ln['bbox'][0]:4d}-{ln['bbox'][2]:4d}  \"{ln['text'][:60]}\"")

    # ── STAGE 3: Label detection ────────────────────────────────────────────
    print("\n### STAGE 3: LABEL DETECTION ###")
    labels = detect_labels(lines)
    print(f"Labels detected: {len(labels)}")
    for lbl in labels:
        print(f"  field={lbl['field']:30s}  label=\"{lbl['label_text'][:40]}\"  score={lbl['match_score']:.2f}  alias=\"{lbl['matched_alias']}\"")
        print(f"    inline={lbl.get('has_inline_value',False)}  value=\"{lbl.get('inline_value','')[:30]}\"")
        print(f"    bbox={lbl['label_bbox']}")

    # ── STAGE 4: Candidate scoring ──────────────────────────────────────────
    print("\n### STAGE 4: CANDIDATE SCORING ###")
    pairs = build_label_value_pairs(lines, labels)
    for f, plist in pairs.items():
        print(f"\n  Field: {f}  (candidates: {len(plist)})")
        for p in plist[:3]:
            v = p['value']
            print(f"    val=\"{v['text'][:40]}\"  pos={v.get('position','?')}  score={p['final_score']:.3f}  hard_reject={p.get('hard_rejected',False)}")
            print(f"    label=\"{p['label']['text'][:40]}\"  alias=\"{p['label']['matched_alias']}\"")
            print(f"    pos_ev={p.get('positive_evidence',[])}")
            print(f"    neg_ev={p.get('negative_evidence',[])}")

    # ── STAGE 5: Field resolution ───────────────────────────────────────────
    print("\n### STAGE 5: FIELD RESOLUTION ###")
    fields = resolve_fields_from_pairs(pairs, lines)
    for fld, info in fields.items():
        if isinstance(info, dict):
            val = info.get('value', 'N/A')
            conf = info.get('confidence', 0)
            reason = info.get('reason', 'N/A')
            print(f"  {fld:30s}  val={repr(val)[:40]}  conf={conf:.2f}")
            print(f"    reason: {reason[:80]}")
        else:
            print(f"  {fld}: {info}")

    # ── STAGE 6: Validation spot checks ──────────────────────────────────────
    print("\n### STAGE 6: VALIDATION SPOT CHECKS ###")
    # Check a few fields against their validators
    for t in tokens:
        txt = t['text']
        # Try quantity
        qv = validate_quantity(txt)
        if qv.get('valid'):
            print(f"  quantity_candidate: \"{txt}\" -> VALID value={qv}")
        # Try MRP
        mv = validate_mrp(txt)
        if mv.get('valid'):
            print(f"  mrp_candidate: \"{txt}\" -> VALID value={mv}")
        # Try date
        dv = validate_date(txt)
        if dv.get('valid'):
            print(f"  date_candidate: \"{txt}\" -> VALID value={dv}")
        # Try batch
        bv = validate_batch(txt)
        if bv.get('valid'):
            print(f"  batch_candidate: \"{txt}\" -> VALID value={bv}")

    print("\n### END TRACE ###\n")


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))
    test_images = [
        (os.path.join(base, "../../test-images/front.jpg"), "FRONT"),
        (os.path.join(base, "../../test-images/back.jpg"), "BACK"),
    ]
    for img_path, label in test_images:
        try:
            run_trace(img_path, label)
        except Exception as e:
            print(f"ERROR processing {label}: {e}")
            traceback.print_exc()
