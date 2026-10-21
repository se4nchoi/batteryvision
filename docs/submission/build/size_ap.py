r"""AP@50 by box size (COCO small / medium / large) on the 1st test set, FP16 models.

Run with backend\\.venv python. Writes size_ap.json next to this file.
COCO buckets on these 640x640 photos: small < 32x32 px, medium 32x32-96x96 px, large > 96x96 px.
"""
import contextlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
from app.evaluation import to_coco_detections, used_categories  # noqa: E402
from app.inference.openvino_provider import OpenVINOInferenceProvider  # noqa: E402

TEST = ROOT / "datasets/battery/test"
coco_json = json.loads((TEST / "_annotations.coco.json").read_text(encoding="utf-8"))
name_to_cat = {n.lower(): c for c, n in used_categories(coco_json).items()}

with contextlib.redirect_stdout(io.StringIO()):
    gt = COCO(str(TEST / "_annotations.coco.json"))

out = {"buckets_px": {"small": "< 32x32", "medium": "32x32 - 96x96", "large": "> 96x96"}, "models": {}}
cat_ids = sorted(name_to_cat.values())
n_gt = {}
for a_name, (lo, hi) in {"small": (0, 32 ** 2), "medium": (32 ** 2, 96 ** 2), "large": (96 ** 2, 1e10)}.items():
    n_gt[a_name] = sum(1 for a in gt.dataset["annotations"] if lo <= a["bbox"][2] * a["bbox"][3] < hi)
out["boxes_per_bucket"] = n_gt

for model in ["atss_mbv2_fp16", "yolox_s_fp16", "yolox_tiny_fp16"]:
    p = OpenVINOInferenceProvider(ROOT / "models" / model / "model.xml", "CPU", min_confidence=0.01)
    dets = []
    for img in coco_json["images"]:
        with Image.open(TEST / img["file_name"]) as im:
            pred = p.predict_image(im.convert("RGB"))
        dets += to_coco_detections(img, pred.detections, name_to_cat)[0]
    with contextlib.redirect_stdout(io.StringIO()):
        ev = COCOeval(gt, gt.loadRes(dets), "bbox")
        ev.params.catIds = cat_ids
        ev.evaluate()
        ev.accumulate()
    prec = ev.eval["precision"]  # [iou, recall, cat, area, maxdet]
    res = {}
    for ai, a_name in enumerate(ev.params.areaRngLbl):  # all, small, medium, large
        pr = prec[0, :, :, ai, 2]  # IoU 0.5, maxDets 100
        valid = pr[pr > -1]
        res[a_name] = round(float(valid.mean()), 3) if valid.size else None
    out["models"][model] = res
    print(model, res)

json.dump(out, open(Path(__file__).parent / "size_ap.json", "w"), indent=1)
print("boxes per bucket", n_gt)
