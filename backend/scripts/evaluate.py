"""Evaluate an exported Geti/OpenVINO model on a held-out COCO test split.

    .\\.venv\\Scripts\\python scripts\\evaluate.py `
        --model ..\\models\\model.xml `
        --coco ..\\datasets\\battery\\test\\_annotations.coco.json `
        --images ..\\datasets\\battery\\test

Writes docs/results/evaluation_<timestamp>.json and .md. Every number in those files
comes from running the model on the given images; nothing is estimated or filled in.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Windows consoles may use a legacy code page (e.g. cp949); never crash on printing.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import REPO_ROOT, settings  # noqa: E402
from app.evaluation import (cell_binary, coco_map, detection_confusion, image_level_outcomes,  # noqa: E402
                            latency_summary, pr_at_threshold, to_coco_detections, used_categories)
from app.inference.openvino_provider import OpenVINOInferenceProvider  # noqa: E402
from app.policy import DecisionPolicy  # noqa: E402


def fmt(v, pct=False):
    if v is None or v != v:  # None or NaN
        return "n/a"
    return f"{v * 100:.1f}%" if pct else f"{v:.3f}"


def confusion_md(conf: dict) -> list[str]:
    out = []
    for name, c in conf.items():
        labels = c["labels"]
        out += [f"## Detection confusion matrix at confidence >= {c['threshold']} ({name}), IoU >= {c['iou']}", "",
                "Rows: annotated. Columns: predicted. `background` column = missed box; `background` row = false box.", "",
                "| annotated \\ predicted | " + " | ".join(labels) + " |", "|---" * (len(labels) + 1) + "|",
                *[f"| {labels[i]} | " + " | ".join(str(v) for v in row) + " |" for i, row in enumerate(c["matrix"])], ""]
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, default=settings.model_xml)
    ap.add_argument("--coco", type=Path, required=True, help="COCO annotation JSON of the held-out test split")
    ap.add_argument("--images", type=Path, required=True, help="Folder containing the test images")
    ap.add_argument("--device", default=settings.device)
    ap.add_argument("--reject", type=float, default=settings.reject_threshold)
    ap.add_argument("--review", type=float, default=settings.review_threshold)
    ap.add_argument("--ignore-labels", default=",".join(settings.ignore_labels))
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "docs" / "results")
    args = ap.parse_args()

    ignore = {s.strip().lower() for s in args.ignore_labels.split(",") if s.strip()}
    policy = DecisionPolicy(args.reject, args.review)
    coco = json.loads(args.coco.read_text(encoding="utf-8"))
    cats = used_categories(coco)
    name_to_cat = {n.lower(): c for c, n in cats.items()}

    # Low threshold so the precision/recall curve (mAP) sees all candidate boxes.
    provider = OpenVINOInferenceProvider(args.model, args.device, min_confidence=0.01, ignore_labels=list(ignore),
                                         input_order=settings.input_order)
    print(f"Model labels: {provider.labels}\nDataset categories with annotations: {sorted(cats.values())}")

    coco_dets, preds, latencies, unmatched = [], {}, [], set()
    for i, img in enumerate(coco["images"]):
        path = args.images / img["file_name"]
        pred = provider.predict(path)
        if i > 0:
            latencies.append(pred.inference_ms)
        img.setdefault("width", pred.image_width)
        img.setdefault("height", pred.image_height)
        dets, um = to_coco_detections(img, pred.detections, name_to_cat)
        coco_dets += dets
        unmatched |= um
        preds[img["id"]] = [d for d in pred.detections if d.confidence >= args.review]
        print(f"\r{i + 1}/{len(coco['images'])} images", end="", flush=True)
    print()
    if unmatched:
        print(f"WARNING: model labels with no matching dataset category (ignored for mAP): {sorted(unmatched)}")

    mp = coco_map(coco, coco_dets)
    pr = pr_at_threshold(coco, coco_dets, args.reject)
    pr_review = pr_at_threshold(coco, coco_dets, args.review)
    ops = image_level_outcomes(coco, preds, policy, ignore)
    conf = {"review": detection_confusion(coco, coco_dets, args.review),
            "reject": detection_confusion(coco, coco_dets, args.reject)}
    binary = cell_binary(ops)
    lat = latency_summary(latencies)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    args.out.mkdir(parents=True, exist_ok=True)
    meta = {"model": str(args.model), "device": args.device, "test_annotations": str(args.coco),
            "n_images": len(coco["images"]), "n_annotations": len(coco["annotations"]),
            "policy": {"reject": args.reject, "review": args.review, "ignore_labels": sorted(ignore)},
            "unmatched_model_labels": sorted(unmatched)}
    report = {"meta": meta, "coco": mp, "pr_at_threshold": pr, "pr_at_review": pr_review,
              "confusion": conf, "cell_binary": binary,
              "image_level": {k: v for k, v in ops.items() if k != "per_image"}, "latency": lat}
    (args.out / f"evaluation_{stamp}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    m = ops["matrix"]
    lines = [
        f"# Evaluation results ({stamp})", "",
        f"- Model: `{args.model.name}` on {args.device}",
        f"- Test set: `{args.coco}` — {meta['n_images']} images, {meta['n_annotations']} boxes",
        f"- Policy: REJECT >= {args.reject}, REVIEW >= {args.review}", "",
        "## 1. Detection quality (COCO protocol)", "",
        "| Class | AP@50 | AP@50:95 |", "|---|---|---|",
        *[f"| {n} | {fmt(v['ap50'])} | {fmt(v['ap50_95'])} |" for n, v in mp["per_class"].items()],
        f"| **all (mean)** | **{fmt(mp['map50'])}** | **{fmt(mp['map50_95'])}** |", "",
        "## 2. Precision / recall / F1 per class (IoU >= 0.5)", "",
        "| Class | Threshold | TP | FP | FN | Precision | Recall | F1 |", "|---|---|---|---|---|---|---|---|",
        *[f"| {n} | {t} | {s['tp']} | {s['fp']} | {s['fn']} | {fmt(s['precision'])} | {fmt(s['recall'])} | {fmt(s['f1'])} |"
          for t, src in ((f"{args.review} (review)", pr_review), (f"{args.reject} (reject)", pr))
          for n, s in {**src["per_class"], "**all**": src["overall"]}.items()], "",
        *confusion_md(conf),
        "## Cell-level classification (defective vs. good)", "",
        "| 'Defective' means | Accuracy | Precision | Recall | Specificity | F1 | TP / FN / FP / TN |",
        "|---|---|---|---|---|---|---|",
        *[f"| {label} | {fmt(b['accuracy'], True)} | {fmt(b['precision'], True)} | {fmt(b['recall'], True)} | "
          f"{fmt(b['specificity'], True)} | {fmt(b['f1'])} | {b['tp']} / {b['fn']} / {b['fp']} / {b['tn']} |"
          for label, b in (("flagged (REVIEW or REJECT)", binary["flagged"]), ("auto-rejected only", binary["rejected"]))], "",
        "## 3. Image-level operational outcome (policy decision vs. annotation)", "",
        "Rows: whether the image has >= 1 actionable defect annotation. Columns: policy decision.",
        "This measures the PASS/REVIEW/REJECT routing, not detection localization.", "",
        "| Ground truth \\ Decision | PASS | REVIEW | REJECT |", "|---|---|---|---|",
        f"| defective | {m['defective']['PASS']} | {m['defective']['REVIEW']} | {m['defective']['REJECT']} |",
        f"| no defect annotated | {m['no_defect_annotated']['PASS']} | {m['no_defect_annotated']['REVIEW']} | {m['no_defect_annotated']['REJECT']} |", "",
        f"- Defect catch rate (REVIEW or REJECT): {fmt(ops['defect_catch_rate'], True)}",
        f"- Defect escape rate (PASSED while defective): {fmt(ops['defect_escape_rate'], True)}",
        f"- False reject rate (no-defect images rejected): {fmt(ops['false_reject_rate'], True)}",
        f"- Review rate: {fmt(ops['review_rate'], True)}", "",
    ]
    if ops["no_defect_images"] == 0:
        lines += ["> The test set has no images without defect annotations, so PASS correctness "
                  "(false reject rate) cannot be assessed.", ""]
    lines += ["## 4. Latency (ModelAPI call, this machine)", "",
              f"n={lat['n']}, mean {lat['mean_ms']:.1f} ms, median {lat['median_ms']:.1f} ms, p95 {lat['p95_ms']:.1f} ms. {lat['note']}"
              if lat else "Not enough images to measure.", ""]
    fails = [(img["file_name"], *ops["per_image"][img["id"]]) for img in coco["images"]
             if ops["per_image"][img["id"]] in (("defective", "PASS"), ("no_defect_annotated", "REJECT"))]
    fail_lines = [f"- `{f}` — {gt}, decided {st}" for f, gt, st in fails[:20]] or ["- none"]
    lines += ["## 5. Failure examples (for the report)", "", *fail_lines, ""]
    md = args.out / f"evaluation_{stamp}.md"
    md.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"\nSaved {md}")


if __name__ == "__main__":
    main()
