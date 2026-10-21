r"""Pick heatmap examples for the XAI slide: a correct detection, a false detection and a miss.

Run with backend\.venv python. Uses YOLOX-S FP16+XAI (finer 40x40 saliency grid) on the 1st test set,
review threshold 0.30, IoU >= 0.5. Overlay = scratch-class channel. TP = scratch hit (peak in box) with the most heat concentrated in the box.
Writes img/xai_tp.jpg, img/xai_fp.jpg, img/xai_fn.jpg and
img/xai_examples.json (which files were picked and why). Boxes: white = annotated defect,
coloured = model detection.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.inference.openvino_provider import OpenVINOInferenceProvider, normalize_result  # noqa: E402

OUT = Path(__file__).parent / "img"
TEST = ROOT / "datasets/battery/test"
REVIEW = 0.30
SCRATCH = 0  # saliency channel order follows model labels: ['scratch', 'crack']
coco = json.loads((TEST / "_annotations.coco.json").read_text(encoding="utf-8"))
cat = {c["id"]: c["name"] for c in coco["categories"]}
anns = {}
for a in coco["annotations"]:
    anns.setdefault(a["image_id"], []).append(a)

p = OpenVINOInferenceProvider(ROOT / "models/yolox_s_fp16_xai/model.xml", "CPU", min_confidence=0.05)


def scratch_map(res):
    return np.asarray(res.saliency_map, dtype=np.float32)[0, SCRATCH]


def peak_in(res, box, W, H, pad=8):
    sal = scratch_map(res)
    gy, gx = np.unravel_index(int(sal.argmax()), sal.shape)
    cx, cy = (gx + 0.5) * W / sal.shape[1], (gy + 0.5) * H / sal.shape[0]
    return box[0] - pad <= cx <= box[2] + pad and box[1] - pad <= cy <= box[3] + pad


def box_share(res, box, W, H):
    """Share of the scratch heat inside the box, divided by the box's share of the image."""
    sal = scratch_map(res)
    sal = sal - sal.min()
    big = np.asarray(Image.fromarray(sal).resize((W, H), Image.BILINEAR))
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    inside = big[y0:y1, x0:x1].sum() / max(float(big.sum()), 1e-6)
    return inside / (((x1 - x0) * (y1 - y0)) / (W * H))


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u else 0.0


cases = {"tp": [], "fp": [], "fn": []}
for im in coco["images"]:
    src = Image.open(TEST / im["file_name"]).convert("RGB")
    W, H = src.size
    res = p.model(np.asarray(src))
    dets = [d for d in normalize_result(res, W, H, set()) if d.confidence >= REVIEW]
    dboxes = [(d, [d.bbox[0] * W, d.bbox[1] * H, d.bbox[2] * W, d.bbox[3] * H]) for d in dets]
    gts = [(cat[a["category_id"]], [a["bbox"][0], a["bbox"][1], a["bbox"][0] + a["bbox"][2], a["bbox"][1] + a["bbox"][3]])
           for a in anns.get(im["id"], [])]
    matched_det = set()
    for gname, gb in gts:
        hit = [(i, d) for i, (d, db) in enumerate(dboxes) if d.label == gname and iou(gb, db) >= 0.5]
        if hit:
            i, d = max(hit, key=lambda t: t[1].confidence)
            matched_det.add(i)
            if gname == "scratch" and peak_in(res, gb, W, H):
                cases["tp"].append((box_share(res, gb, W, H), im, res))
        elif gname == "scratch":
            cases["fn"].append((max((d.confidence for d in dets), default=0.0), im, res))
    for i, (d, db) in enumerate(dboxes):
        if i not in matched_det and not gts and d.label == "scratch":
            cases["fp"].append((d.confidence, im, res))


def overlay(sal, W, H, keep=0.90):
    """Heat overlay showing only the strongest responses (top 10% of the map's range)."""
    t = (sal - sal.min()) / max(float(sal.max() - sal.min()), 1e-6)
    t = np.clip((t - keep) / (1 - keep), 0, 1)
    rgba = np.zeros((*t.shape, 4), np.uint8)
    rgba[..., 0] = 255
    rgba[..., 1] = (200 * t).astype(np.uint8)
    rgba[..., 3] = (210 * t ** 0.8).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA").resize((W, H), Image.BILINEAR)


def render(im, res, name):
    src = Image.open(TEST / im["file_name"]).convert("RGB")
    W, H = src.size
    ov = overlay(scratch_map(res), W, H)
    out = Image.alpha_composite(src.convert("RGBA"), ov).convert("RGB") if ov is not None else src
    d = ImageDraw.Draw(out)
    for a in anns.get(im["id"], []):
        x, y, w, h = a["bbox"]
        d.rectangle([x, y, x + w, y + h], outline=(255, 255, 255), width=4)
    for det in normalize_result(res, W, H, set()):
        if det.confidence >= REVIEW:
            b = det.bbox
            d.rectangle([b[0] * W, b[1] * H, b[2] * W, b[3] * H], outline=(235, 104, 52), width=4)
    out.save(OUT / name, quality=88)


picked = {}
for key, name, pick in [("tp", "xai_tp.jpg", max), ("fp", "xai_fp.jpg", max), ("fn", "xai_fn.jpg", min)]:
    lst = cases[key]
    print(key, len(lst))
    if not lst:
        continue
    conf, im, res = pick(lst, key=lambda t: t[0])
    render(im, res, name)
    picked[key] = {"file": im["file_name"], "score": round(float(conf), 3), "candidates": len(lst)}
json.dump(picked, open(OUT / "xai_examples.json", "w"), indent=1)
print(picked)
