"""Offline evaluation of a detector on a COCO-format held-out test set.

Three separate measurements, which must not be confused with each other:

1. Detection quality (COCO protocol, pycocotools): mAP@50, mAP@50:95, per-class AP.
2. Detection precision / recall at the operating confidence threshold
   (IoU >= 0.5, same class, greedy one-to-one matching by confidence).
3. Operational image-level outcome: ground truth "defective" (has >= 1 actionable
   annotation) vs. the PASS / REVIEW / REJECT decision of the policy.
   This is NOT a per-class confusion matrix and NOT a substitute for mAP.
"""
from __future__ import annotations

import contextlib
import io
from collections import defaultdict

import numpy as np

from .policy import DecisionPolicy
from .schemas import Detection


def iou_xywh(a: list[float], b: list[float]) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def used_categories(coco: dict) -> dict[int, str]:
    """Categories that actually have annotations (drops e.g. Roboflow's empty supercategory)."""
    used = {a["category_id"] for a in coco["annotations"]}
    return {c["id"]: c["name"] for c in coco["categories"] if c["id"] in used}


def to_coco_detections(image: dict, dets: list[Detection], name_to_cat: dict[str, int]) -> tuple[list[dict], set[str]]:
    out, unmatched = [], set()
    w, h = image["width"], image["height"]
    for d in dets:
        cat = name_to_cat.get(d.label.lower())
        if cat is None:
            unmatched.add(d.label)
            continue
        x1, y1, x2, y2 = d.bbox
        out.append({"image_id": image["id"], "category_id": cat, "score": d.confidence,
                    "bbox": [x1 * w, y1 * h, (x2 - x1) * w, (y2 - y1) * h]})
    return out, unmatched


def coco_map(coco_gt: dict, coco_dets: list[dict]) -> dict:
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval

    cats = used_categories(coco_gt)
    gt = COCO()
    gt.dataset = {**coco_gt, "annotations": [{**a, "iscrowd": a.get("iscrowd", 0), "area": a.get("area", a["bbox"][2] * a["bbox"][3])}
                                             for a in coco_gt["annotations"]]}
    with contextlib.redirect_stdout(io.StringIO()):
        gt.createIndex()
        if not coco_dets:
            return {"map50": 0.0, "map50_95": 0.0, "per_class": {n: {"ap50": 0.0, "ap50_95": 0.0} for n in cats.values()}}
        dt = gt.loadRes(coco_dets)
        ev = COCOeval(gt, dt, "bbox")
        ev.params.catIds = sorted(cats)
        ev.evaluate()
        ev.accumulate()
        ev.summarize()
    precision = ev.eval["precision"]  # [T(iou), R, K(cat), A(area), M(maxdets)]

    def ap(k: int | slice, t: int | slice) -> float:
        p = precision[t, :, k, 0, -1]
        p = p[p > -1]
        return float(p.mean()) if p.size else float("nan")

    per_class = {cats[c]: {"ap50": ap(k, 0), "ap50_95": ap(k, slice(None))} for k, c in enumerate(ev.params.catIds)}
    return {"map50": float(ev.stats[1]), "map50_95": float(ev.stats[0]), "per_class": per_class}


def pr_at_threshold(coco_gt: dict, coco_dets: list[dict], threshold: float, iou_thr: float = 0.5) -> dict:
    cats = used_categories(coco_gt)
    gts = defaultdict(list)
    for a in coco_gt["annotations"]:
        if a["category_id"] in cats:
            gts[(a["image_id"], a["category_id"])].append(a["bbox"])
    dets = defaultdict(list)
    for d in coco_dets:
        if d["score"] >= threshold:
            dets[(d["image_id"], d["category_id"])].append(d)
    stats = {cid: {"tp": 0, "fp": 0, "fn": 0} for cid in cats}
    for key in set(gts) | set(dets):
        cid = key[1]
        if cid not in stats:
            continue
        remaining = list(gts.get(key, []))
        for d in sorted(dets.get(key, []), key=lambda d: -d["score"]):
            ious = [iou_xywh(d["bbox"], g) for g in remaining]
            if ious and max(ious) >= iou_thr:
                remaining.pop(int(np.argmax(ious)))
                stats[cid]["tp"] += 1
            else:
                stats[cid]["fp"] += 1
        stats[cid]["fn"] += len(remaining)

    def summarize(s: dict) -> dict:
        tp, fp, fn = s["tp"], s["fp"], s["fn"]
        p = tp / (tp + fp) if tp + fp else None
        r = tp / (tp + fn) if tp + fn else None
        f1 = 2 * p * r / (p + r) if p and r else None
        return {**s, "precision": p, "recall": r, "f1": f1}

    total = {k: sum(s[k] for s in stats.values()) for k in ("tp", "fp", "fn")}
    return {"threshold": threshold, "iou": iou_thr, "overall": summarize(total),
            "per_class": {cats[c]: summarize(s) for c, s in stats.items()}}


def image_level_outcomes(coco_gt: dict, predictions: dict[int, list[Detection]], policy: DecisionPolicy,
                         ignore_labels: set[str]) -> dict:
    cats = used_categories(coco_gt)
    defective = {a["image_id"] for a in coco_gt["annotations"]
                 if a["category_id"] in cats and cats[a["category_id"]].lower() not in ignore_labels}
    matrix = {"defective": {"PASS": 0, "REVIEW": 0, "REJECT": 0},
              "no_defect_annotated": {"PASS": 0, "REVIEW": 0, "REJECT": 0}}
    per_image = {}
    for img in coco_gt["images"]:
        status, _ = policy.decide(predictions.get(img["id"], []))
        row = "defective" if img["id"] in defective else "no_defect_annotated"
        matrix[row][status] += 1
        per_image[img["id"]] = (row, status)
    d = matrix["defective"]
    n = matrix["no_defect_annotated"]
    n_def, n_clean = sum(d.values()), sum(n.values())
    return {
        "matrix": matrix,
        "defective_images": n_def,
        "no_defect_images": n_clean,
        # Share of defective images NOT passed (rejected or sent to review).
        "defect_catch_rate": (d["REJECT"] + d["REVIEW"]) / n_def if n_def else None,
        "defect_escape_rate": d["PASS"] / n_def if n_def else None,
        "false_reject_rate": n["REJECT"] / n_clean if n_clean else None,
        "review_rate": (d["REVIEW"] + n["REVIEW"]) / (n_def + n_clean) if n_def + n_clean else None,
        "per_image": per_image,
    }


def latency_summary(values: list[float]) -> dict | None:
    if not values:
        return None
    a = np.asarray(values)
    return {"n": int(a.size), "mean_ms": float(a.mean()), "median_ms": float(np.median(a)),
            "p95_ms": float(np.percentile(a, 95)), "note": "First call excluded (warm-up)."}
