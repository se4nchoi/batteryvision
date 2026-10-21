r"""Build every image the deck and summary use (run with backend\.venv python).

Reads the local dataset (git-ignored), models/ and docs/results; writes img/*.jpg.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.inference.openvino_provider import OpenVINOInferenceProvider, saliency_overlay  # noqa: E402

OUT = Path(__file__).parent / "img"
OUT.mkdir(exist_ok=True)
TEST = ROOT / "datasets/battery/test"
COL = {"crack": (239, 83, 80), "scratch": (255, 193, 7)}


def load_coco(path):
    coco = json.loads(Path(path).read_text(encoding="utf-8"))
    cat = {c["id"]: c["name"] for c in coco["categories"]}
    anns = {}
    for a in coco["annotations"]:
        anns.setdefault(a["image_id"], []).append(a)
    return coco, cat, anns


coco, cat, anns = load_coco(TEST / "_annotations.coco.json")
by_id = {im["id"]: im for im in coco["images"]}


def boxed(path, boxes, width=5):
    img = Image.open(path).convert("RGB")
    d = ImageDraw.Draw(img)
    for name, (x, y, w, h) in boxes:
        d.rectangle([x, y, x + w, y + h], outline=COL[name], width=width)
    return img


def test_img(i, draw=True):
    im = by_id[i]
    boxes = [(cat[a["category_id"]], a["bbox"]) for a in anns.get(i, [])] if draw else []
    return boxed(TEST / im["file_name"], boxes), anns.get(i, [])


def crop_around(img, bbox, pad=2.2, size=520):
    x, y, w, h = bbox
    cx, cy, s = x + w / 2, y + h / 2, max(w, h) * pad
    s = max(s, 140)
    box = [cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2]
    return img.crop([int(v) for v in box]).resize((size, size), Image.LANCZOS)


def save(img, name):
    img.save(OUT / name, quality=88)


# cover + backgrounds (whole photos, GT boxes drawn)
for i, name in [(99, "cover_crack.jpg"), (1, "cover_scratch.jpg"), (56, "cover_good.jpg"),
                (56, "bg_green.jpg"), (22, "bg_grey.jpg"), (68, "bg_wood.jpg")]:
    save(test_img(i)[0], name)

# slide 2 close-ups: a crack and a thin scratch
img, a = test_img(16)
save(crop_around(img, a[0]["bbox"]), "zoom_crack.jpg")
img, a = test_img(85)
save(crop_around(img, a[0]["bbox"]), "zoom_scratch.jpg")

# slide 4: near-duplicate pair (moved test image vs its training match)
nd = json.loads((ROOT / "datasets/battery/test_near_duplicates/_annotations.coco.json").read_text(encoding="utf-8"))
pair = min(nd["near_duplicates"], key=lambda d: d["distance"])
save(Image.open(ROOT / "datasets/battery/test_near_duplicates" / pair["test"]).convert("RGB"), "dup_test.jpg")
save(Image.open(ROOT / "datasets/battery/train" / pair["train"]).convert("RGB"), "dup_train.jpg")

# slide 6: saliency of ATSS vs YOLOX-S on the same scratch photo
heat_id = 1
src = Image.open(TEST / by_id[heat_id]["file_name"]).convert("RGB")
peaks = {}
for model, out in [("atss_mbv2_fp16_xai", "heat_atss.jpg"), ("yolox_s_fp16_xai", "heat_yolox.jpg")]:
    p = OpenVINOInferenceProvider(ROOT / "models" / model / "model.xml", "CPU", min_confidence=0.3)
    res = p.model(np.asarray(src))
    ov = saliency_overlay(getattr(res, "saliency_map", None), *src.size)
    img = src.copy().convert("RGBA")
    if ov is not None:
        img = Image.alpha_composite(img, ov)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    for a in anns[heat_id]:
        x, y, w, h = a["bbox"]
        d.rectangle([x, y, x + w, y + h], outline=(255, 255, 255), width=4)
    save(img, out)

# slide 8: a defect ATSS missed in the later session (highest score below the review threshold)
hc, hcat, hanns = load_coco(ROOT / "datasets/battery_later/unseen_clean.coco.json")
p = OpenVINOInferenceProvider(ROOT / "models/atss_mbv2_fp16_xai/model.xml", "CPU", min_confidence=0.01)
best = None
for im in hc["images"]:
    if im["id"] not in hanns:
        continue
    path = ROOT / "datasets/battery_later/images" / im["file_name"]
    top = max((d.confidence for d in p.predict(path).detections), default=0.0)
    if top < 0.30 and (best is None or hanns[im["id"]][0]["bbox"][2] * hanns[im["id"]][0]["bbox"][3] > best[2]):
        best = (path, im["id"], hanns[im["id"]][0]["bbox"][2] * hanns[im["id"]][0]["bbox"][3], top)
path, iid, _, top = best
save(boxed(path, [(hcat[a["category_id"]], a["bbox"]) for a in hanns[iid]]), "holdout_miss.jpg")

# slide 2: meme as a blurred, faded backdrop behind the title (author-supplied img/meme.png)
from PIL import ImageFilter  # noqa: E402
meme = Image.open(OUT / "meme.png").convert("RGB").filter(ImageFilter.GaussianBlur(3))
yy, xx = np.mgrid[0:meme.height, 0:meme.width]
r = np.hypot((xx - meme.width / 2) / (meme.width / 2), (yy - meme.height / 2) / (meme.height / 2))
alpha = (np.clip(1.15 - r, 0, 1) ** 1.4 * 0.58 * 255).astype(np.uint8)  # soft vignette, max ~58% opacity
meme.putalpha(Image.fromarray(alpha))
meme.save(OUT / "meme_bg.png")

# slide 10: dashboard screenshot
Image.open(ROOT / "docs/screenshots/dashboard.png").convert("RGB").save(OUT / "dashboard.jpg", quality=88)

json.dump({"near_duplicate_pair": pair, "heatmap_image": by_id[heat_id]["file_name"],
           "holdout_miss": {"file": path.name, "atss_top_score": round(top, 3)}},
          open(OUT / "sources.json", "w"), indent=1)
print("ok", pair["distance"], path.name, round(top, 3))
