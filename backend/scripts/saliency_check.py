r"""Does the saliency map point at the annotated defect?

For every test image with defect annotations:
- pointing game: the hottest saliency pixel (for the annotated class) lies inside a GT box (+8 px margin)
- energy in box: share of saliency mass inside GT boxes, vs. the share of image area the boxes cover
Reported per model, per class, and per background group.

    .\.venv\Scripts\python scripts\saliency_check.py ..\datasets\battery\test atss_mbv2_fp16_xai yolox_s_fp16_xai
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

backend = Path(__file__).resolve().parents[1]
split = Path(sys.argv[1])
sys.path.insert(0, str(backend))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from app.evaluation import background_group  # noqa: E402
from model_api.models import Model  # noqa: E402

coco = json.loads((split / "_annotations.coco.json").read_text(encoding="utf-8"))
cats = {c["id"]: c["name"] for c in coco["categories"]}
boxes = defaultdict(list)
for a in coco["annotations"]:
    boxes[a["image_id"]].append((cats[a["category_id"]], a["bbox"]))

for name in sys.argv[2:]:
    model = Model.create_model(str(backend.parent / "models" / name / "model.xml"), device="CPU")
    labels = list(model.params.labels)
    stats = defaultdict(lambda: {"n": 0, "hit": 0, "energy": [], "area": []})
    for img in coco["images"]:
        if img["id"] not in boxes:
            continue
        im = Image.open(split / img["file_name"]).convert("RGB")
        res = model(np.asarray(im))
        sal = np.asarray(res.saliency_map, dtype=np.float32)
        while sal.ndim > 3:
            sal = sal[0]
        cls = boxes[img["id"]][0][0]
        smap = sal[labels.index(cls)] if sal.shape[0] == len(labels) else sal.max(axis=0)
        smap = np.asarray(Image.fromarray(smap).resize((img["width"], img["height"]), Image.BILINEAR))
        smap = smap - smap.min()
        mask = np.zeros_like(smap, dtype=bool)
        for _, (x, y, w, h) in boxes[img["id"]]:
            m = 8
            mask[max(int(y) - m, 0):int(y + h) + m, max(int(x) - m, 0):int(x + w) + m] = True
        yy, xx = np.unravel_index(np.argmax(smap), smap.shape)
        bg = background_group(im)
        for key in ("all", f"class:{cls}", f"background:{bg}"):
            s = stats[key]
            s["n"] += 1
            s["hit"] += bool(mask[yy, xx])
            s["energy"].append(float(smap[mask].sum() / smap.sum()) if smap.sum() > 0 else 0.0)
            s["area"].append(float(mask.mean()))
    print(f"== {name}  (saliency map shape {tuple(np.asarray(res.saliency_map).shape)})")
    for key, s in sorted(stats.items()):
        e, a = np.mean(s["energy"]), np.mean(s["area"])
        print(f"  {key:<24} n={s['n']:>3}  pointing hit {s['hit'] / s['n']:.0%}   energy in box {e:.1%} vs area {a:.1%}  (x{e / a:.1f})")
