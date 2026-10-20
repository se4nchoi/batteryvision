"""Write sample_data/demo/benchmark_example.json: EXAMPLE data for previewing the Models page.

Every number in that file is invented to look plausible. It is NOT a measurement of any model,
the dashboard shows it under an "Example data" banner, and it must never be reported as a result.
Real results come from scripts/benchmark.py and are written to docs/results/benchmark.json.

    .\\.venv\\Scripts\\python scripts\\make_example_benchmark.py      (from backend/)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.evaluation import cell_binary  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "sample_data" / "demo" / "benchmark_example.json"

N_DEFECTIVE, N_CLEAN = 140, 30
PERTURB_DROP = {"clean": 0.0, "blur": 0.13, "dark": 0.08, "bright": 0.05, "low_contrast": 0.11, "noise": 0.16, "jpeg_q20": 0.04}

# name: (architecture, precision, mAP50, mAP50:95, P, R, latency_ms, size_mb, robustness factor, Geti score)
MODELS = {
    "example_yolox_tiny_fp16": ("YOLOX-Tiny", "FP16", 0.862, 0.521, 0.874, 0.808, 18.4, 10.2, 1.15, 0.84),
    "example_yolox_s_fp16": ("YOLOX-S", "FP16", 0.913, 0.584, 0.902, 0.871, 41.7, 18.1, 0.85, 0.89),
    "example_yolox_s_int8": ("YOLOX-S", "INT8", 0.894, 0.556, 0.889, 0.852, 17.2, 9.6, 0.95, None),
}


def model_entry(name, arch, prec, m50, m5095, p, r, lat, size, rob, geti):
    caught = round(N_DEFECTIVE * (0.91 + (m50 - 0.86)))  # defective cells sent to review or rejected
    review = round(N_DEFECTIVE * 0.07)
    false_rej = round(N_CLEAN * (0.14 - (m50 - 0.86) * 0.8))
    clean_review = 2
    tp = round(212 * r)
    fp = round(tp / p - tp)
    sweep = []
    for i in range(1, 20):
        t = round(0.05 * i, 2)
        sweep.append({
            "threshold": t,
            "defect_recall": round(min(1.0, 1.02 - 0.55 * t ** 2.2 * (1.1 - m50 + 0.6)), 4),
            "escape_rate": None,
            "false_reject_rate": round(max(0.0, 0.62 * math.exp(-4.2 * t) * (1.05 - (m50 - 0.86) * 2)), 4),
            "box_precision": round(min(0.99, 0.55 + 0.45 * (1 - math.exp(-3.5 * t)) * (p + 0.05)), 4),
            "box_recall": round(max(0.0, r * (1.15 - 0.5 * t ** 1.6)), 4),
        })
    for row in sweep:
        row["escape_rate"] = round(1 - row["defect_recall"], 4)
    return {
        "name": name, "path": f"models/{name}/model.xml", "sha256_12": "example" + str(sum(map(ord, name)) % 100000).zfill(5),
        "size_mb": size, "labels": ["scratch", "crack"], "wrapper": "YOLOX",
        "meta": {"architecture": arch, "precision": prec, "note": "EXAMPLE DATA, not a real model",
                 **({"geti_validation_score": {"metric": "F-measure", "value": geti, "split": "validation"}} if geti else {})},
        "coco": {"map50": m50, "map50_95": m5095, "per_class": {
            "scratch": {"ap50": round(m50 - 0.045, 3), "ap50_95": round(m5095 - 0.05, 3)},
            "crack": {"ap50": round(m50 + 0.045, 3), "ap50_95": round(m5095 + 0.05, 3)}}},
        "pr_at_threshold": {"threshold": 0.6, "overall": {"tp": tp, "fp": fp, "fn": 212 - tp, "precision": p, "recall": r,
                                                          "f1": round(2 * p * r / (p + r), 3)}, "per_class": {}},
        "image_level": {
            "matrix": {"defective": {"PASS": N_DEFECTIVE - caught, "REVIEW": review, "REJECT": caught - review},
                       "no_defect_annotated": {"PASS": N_CLEAN - false_rej - clean_review, "REVIEW": clean_review, "REJECT": false_rej}},
            "defective_images": N_DEFECTIVE, "no_defect_images": N_CLEAN,
            "defect_catch_rate": round(caught / N_DEFECTIVE, 4),
            "defect_escape_rate": round(1 - caught / N_DEFECTIVE, 4),
            "false_reject_rate": round(false_rej / N_CLEAN, 4),
            "review_rate": round((review + clean_review) / (N_DEFECTIVE + N_CLEAN), 4),
        },
        "latency": {"n": 169, "mean_ms": lat, "median_ms": round(lat * 0.96, 1), "p95_ms": round(lat * 1.35, 1)},
        "robustness": {k: {"map50": round(max(0.0, m50 - d * rob), 3), "map50_95": round(max(0.0, m5095 - d * rob * 0.8), 3),
                           "precision": None, "recall": None, "defect_escape_rate": None, "false_reject_rate": None}
                       for k, d in PERTURB_DROP.items()},
        "threshold_sweep": sweep,
        "by_background": {
            g: {"n_images": n, "n_defective": nd, "n_clean": n - nd,
                "defect_catch_rate": round(min(1.0, caught / N_DEFECTIVE + off), 4),
                "false_reject_rate": round(max(0.0, false_rej / N_CLEAN - off / 2), 4),
                "box_recall": round(max(0.0, min(1.0, r + off)), 4), "box_precision": round(p, 4)}
            for g, n, nd, off in (("wood / brown", 62, 50, 0.03), ("grey / neutral", 70, 58, 0.01), ("green mat", 38, 32, -0.09 * rob))
        },
        "failures": [
            {"file": "example_scratch_0412.jpg", "ground_truth": "defective", "decision": "PASS", "top": ["scratch", 0.21]},
            {"file": "example_scratch_0587.jpg", "ground_truth": "defective", "decision": "PASS", "top": None},
            {"file": "example_clean_0033.jpg", "ground_truth": "no_defect_annotated", "decision": "REJECT", "top": ["crack", 0.67]},
        ][: 3 if m50 < 0.9 else 2],
        "unmatched_model_labels": [],
    }


def add_metrics(m: dict) -> dict:
    """Example-only operating points, confusion matrices and cell metrics derived from the invented numbers."""
    p, r = m["pr_at_threshold"]["overall"]["precision"], m["pr_at_threshold"]["overall"]["recall"]
    def op(prec, rec):
        tp = round(212 * rec); fp = round(tp / prec - tp); fn = 212 - tp
        per = {"scratch": {"tp": round(tp * 0.58), "fp": round(fp * 0.7), "fn": round(fn * 0.75)},
               "crack": {"tp": tp - round(tp * 0.58), "fp": fp - round(fp * 0.7), "fn": fn - round(fn * 0.75)}}
        for v in per.values():
            v["precision"] = round(v["tp"] / (v["tp"] + v["fp"]), 4) if v["tp"] + v["fp"] else None
            v["recall"] = round(v["tp"] / (v["tp"] + v["fn"]), 4)
            v["f1"] = round(2 * v["precision"] * v["recall"] / (v["precision"] + v["recall"]), 4) if v["precision"] else None
        return {"threshold": None, "overall": {"tp": tp, "fp": fp, "fn": fn, "precision": prec, "recall": rec,
                                               "f1": round(2 * prec * rec / (prec + rec), 4)}, "per_class": per}
    ops = {"review": op(round(p - 0.08, 3), round(min(0.97, r + 0.1), 3)), "reject": op(p, r)}
    ops["review"]["threshold"], ops["reject"]["threshold"] = 0.3, 0.6
    def conf(o):
        s_, c_ = o["per_class"]["scratch"], o["per_class"]["crack"]
        return {"threshold": o["threshold"], "iou": 0.5, "labels": ["crack", "scratch", "background"],
                "matrix": [[c_["tp"] - 2, 2, c_["fn"]], [3, s_["tp"] - 3, s_["fn"]], [c_["fp"], s_["fp"], 0]]}
    m["operating_points"] = ops
    m["confusion"] = {k: conf(v) for k, v in ops.items()}
    m["cell_binary"] = cell_binary(m["image_level"])
    return m


def main() -> None:
    report = {
        "example": True,
        "note": "EXAMPLE DATA for previewing the Models page. Invented numbers, not measured. Do not report.",
        "generated_at": "2026-10-20T00:00:00+00:00",
        "command": "scripts/make_example_benchmark.py",
        "machine": {"cpu": "example", "os": "example", "device": "CPU"},
        "test_set": {"annotations": "example", "images": "example", "n_images": N_DEFECTIVE + N_CLEAN, "n_boxes": 212,
                     "boxes_per_class": {"scratch": 128, "crack": 84}, "images_without_annotations": N_CLEAN,
                     "backgrounds": {"wood / brown": 62, "grey / neutral": 70, "green mat": 38},
                     "background_method": "median border colour (heuristic)"},
        "policy": {"reject_threshold": 0.6, "review_threshold": 0.3, "ignore_labels": []},
        "perturbations": list(PERTURB_DROP),
        "leakage": {"checked": True, "count": 0, "test_images": N_DEFECTIVE + N_CLEAN, "method": "dHash 256-bit, Hamming <= 8", "near_duplicates": []},
        "models": [add_metrics(model_entry(n, *v)) for n, v in MODELS.items()],
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote example (not measured) benchmark to {OUT}")


if __name__ == "__main__":
    main()
