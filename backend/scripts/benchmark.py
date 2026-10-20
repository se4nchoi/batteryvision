"""Compare every exported model on the same held-out test set.

    .\\.venv\\Scripts\\python scripts\\benchmark.py `
        --coco ..\\datasets\\battery\\test\\_annotations.coco.json `
        --images ..\\datasets\\battery\\test `
        --train-images ..\\datasets\\battery\\train

For each model under models/ (models/<name>/model.xml), this measures:
  - COCO mAP@50 / mAP@50:95 / per-class AP, and P/R/F1 at the reject threshold
  - image-level PASS/REVIEW/REJECT outcomes under the current policy
  - robustness: the same metrics on blurred / darkened / noisy / compressed copies
  - a reject-threshold sweep (defect recall vs false reject rate)
  - latency (mean / median / p95, first call excluded)
plus a train/test near-duplicate (leakage) check if --train-images is given.

Output: docs/results/benchmark.json (read by the dashboard's Models page) and a
timestamped copy. Every number is computed here; meta.json fields are shown as
"reported by Geti" and are never mixed into measured columns.
"""
from __future__ import annotations

import argparse
import json
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Windows consoles may use a legacy code page (e.g. cp949); never crash on printing.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import REPO_ROOT, settings  # noqa: E402
from app.evaluation import (background_group, by_group, coco_map, dataset_summary, dhash,  # noqa: E402
                            image_level_outcomes, latency_summary, near_duplicates, perturbations,
                            pr_at_threshold, threshold_sweep, to_coco_detections, used_categories)
from app.inference.openvino_provider import OpenVINOInferenceProvider  # noqa: E402
from app.inference.registry import discover  # noqa: E402
from app.policy import DecisionPolicy  # noqa: E402

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}


def evaluate_model(provider, coco, images_dir, policy, ignore, perturbs, sweep_thresholds, groups):
    name_to_cat = {n.lower(): c for c, n in used_categories(coco).items()}
    images = {img["id"]: Image.open(images_dir / img["file_name"]).convert("RGB") for img in coco["images"]}
    result, unmatched = {"robustness": {}}, set()
    for pname, fn in perturbs.items():
        coco_dets, preds, latencies = [], {}, []
        for i, img in enumerate(coco["images"]):
            pred = provider.predict_image(fn(images[img["id"]]))
            if i > 0:
                latencies.append(pred.inference_ms)
            dets, um = to_coco_detections(img, pred.detections, name_to_cat)
            coco_dets += dets
            unmatched |= um
            preds[img["id"]] = pred.detections
        print(f"    {pname:<13} {len(coco['images'])} images")
        mp = coco_map(coco, coco_dets)
        pr = pr_at_threshold(coco, coco_dets, policy.reject_threshold)
        policy_preds = {k: [d for d in v if d.confidence >= policy.review_threshold] for k, v in preds.items()}
        ops = image_level_outcomes(coco, policy_preds, policy, ignore)
        result["robustness"][pname] = {
            "map50": mp["map50"], "map50_95": mp["map50_95"],
            "precision": pr["overall"]["precision"], "recall": pr["overall"]["recall"],
            "defect_escape_rate": ops["defect_escape_rate"], "false_reject_rate": ops["false_reject_rate"],
        }
        if pname == "clean":
            per_image = ops.pop("per_image")
            result.update({
                "coco": mp, "pr_at_threshold": pr, "image_level": ops,
                "by_background": by_group(coco, groups, coco_dets, policy_preds, policy, ignore),
                "latency": latency_summary(latencies),
                "threshold_sweep": threshold_sweep(coco, coco_dets, preds, ignore, sweep_thresholds),
                "failures": [
                    {"file": img["file_name"], "ground_truth": per_image[img["id"]][0], "decision": per_image[img["id"]][1],
                     "top": max(([d.label, round(d.confidence, 3)] for d in preds[img["id"]]), key=lambda x: x[1], default=None)}
                    for img in coco["images"]
                    if per_image[img["id"]] in (("defective", "PASS"), ("no_defect_annotated", "REJECT"))
                ][:12],
            })
    result["unmatched_model_labels"] = sorted(unmatched)
    return result


def hash_dir(d: Path) -> dict[str, int]:
    out = {}
    for p in sorted(d.rglob("*")):
        if p.suffix.lower() in IMAGE_EXTS:
            with Image.open(p) as im:
                out[str(p.relative_to(d))] = dhash(im)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--coco", type=Path, required=True, help="COCO annotation JSON of the held-out test split")
    ap.add_argument("--images", type=Path, required=True, help="Folder with the test images")
    ap.add_argument("--train-images", type=Path, help="Training images folder, for the near-duplicate leakage check")
    ap.add_argument("--models-dir", type=Path, default=settings.models_dir)
    ap.add_argument("--only", nargs="*", help="Model names to include (default: all)")
    ap.add_argument("--device", default=settings.device)
    ap.add_argument("--reject", type=float, default=settings.reject_threshold)
    ap.add_argument("--review", type=float, default=settings.review_threshold)
    ap.add_argument("--ignore-labels", default=",".join(settings.ignore_labels))
    ap.add_argument("--no-robustness", action="store_true", help="Clean images only (faster)")
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "docs" / "results")
    args = ap.parse_args()

    ignore = {s.strip().lower() for s in args.ignore_labels.split(",") if s.strip()}
    policy = DecisionPolicy(args.reject, args.review)
    coco = json.loads(args.coco.read_text(encoding="utf-8"))
    for img in coco["images"]:  # fill missing sizes from the files
        if "width" not in img or "height" not in img:
            with Image.open(args.images / img["file_name"]) as im:
                img["width"], img["height"] = im.size

    perturbs = perturbations()
    if args.no_robustness:
        perturbs = {"clean": perturbs["clean"]}
    sweep = [round(0.05 * i, 2) for i in range(1, 20)]

    # Background groups (heuristic, from border colour) for the per-background breakdown.
    groups = {img["id"]: background_group(Image.open(args.images / img["file_name"])) for img in coco["images"]}

    s = type(settings)()
    s.models_dir, s.model_xml = args.models_dir, None
    found = [(n, x) for n, x in discover(s) if not args.only or n in args.only]
    if not found:
        sys.exit(f"No models found in {args.models_dir} (expected <name>/model.xml + model.bin)")

    models = []
    for name, xml in found:
        print(f"[{name}] {xml}")
        meta_file = xml.parent / "meta.json"
        meta = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.is_file() else {}
        try:
            provider = OpenVINOInferenceProvider(xml, args.device, min_confidence=0.01, ignore_labels=list(ignore), name=name,
                                                 input_order=settings.input_order)
        except Exception as exc:
            print(f"    failed to load: {exc}")
            models.append({"name": name, "path": str(xml), "error": f"{type(exc).__name__}: {exc}", "meta": meta})
            continue
        t0 = time.perf_counter()
        res = evaluate_model(provider, coco, args.images, policy, ignore, perturbs, sweep, groups)
        models.append({
            "name": name, "path": str(xml), "sha256_12": provider.sha, "size_mb": provider.size_mb,
            "labels": provider.labels, "wrapper": provider.model_type, "meta": meta,
            "eval_seconds": round(time.perf_counter() - t0, 1), **res,
        })

    leakage = {"checked": False}
    if args.train_images:
        print("Leakage check (dHash 256-bit, Hamming distance <= 8)...")
        test_hashes = {img["file_name"]: dhash(Image.open(args.images / img["file_name"])) for img in coco["images"]}
        dups = near_duplicates(test_hashes, hash_dir(args.train_images))
        leakage = {"checked": True, "train_dir": str(args.train_images), "method": "dHash 256-bit, Hamming <= 8",
                   "near_duplicates": dups[:50], "count": len(dups), "test_images": len(test_hashes)}

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": " ".join(sys.argv),
        "machine": {"cpu": platform.processor() or platform.machine(), "os": platform.platform(), "device": args.device},
        "test_set": {"annotations": str(args.coco), "images": str(args.images), **dataset_summary(coco),
                     "backgrounds": {g: list(groups.values()).count(g) for g in sorted(set(groups.values()))},
                     "background_method": "median border colour (heuristic)"},
        "policy": {"reject_threshold": args.reject, "review_threshold": args.review, "ignore_labels": sorted(ignore)},
        "perturbations": list(perturbs),
        "leakage": leakage,
        "models": models,
    }
    args.out.mkdir(parents=True, exist_ok=True)
    text = json.dumps(report, indent=2)
    (args.out / "benchmark.json").write_text(text, encoding="utf-8")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    (args.out / f"benchmark_{stamp}.json").write_text(text, encoding="utf-8")

    print(f"\n{'model':<22}{'mAP50':>8}{'mAP50:95':>10}{'P@thr':>8}{'R@thr':>8}{'ms':>8}")
    for m in models:
        if "error" in m:
            print(f"{m['name']:<22} failed: {m['error']}")
            continue
        lat = m["latency"]["mean_ms"] if m["latency"] else float("nan")
        p, r = m["pr_at_threshold"]["overall"]["precision"], m["pr_at_threshold"]["overall"]["recall"]
        print(f"{m['name']:<22}{m['coco']['map50']:>8.3f}{m['coco']['map50_95']:>10.3f}"
              f"{(p or 0):>8.3f}{(r or 0):>8.3f}{lat:>8.1f}")
    print(f"\nSaved {args.out / 'benchmark.json'}. Open the dashboard's Models tab to view it.")


if __name__ == "__main__":
    main()
