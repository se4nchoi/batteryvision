# Evaluation plan and results template

> **Status:** no model has been evaluated yet. Every `TBD` below must be filled from
> `scripts/evaluate.py` output or Geti screenshots. Do not estimate or invent numbers.

## What is measured, and what it means

| # | Measurement | Question it answers | Source |
|---|---|---|---|
| 1 | **mAP@50, mAP@50:95, per-class AP** (COCO protocol) | How well does the detector find and localize each defect type across all confidence levels? | `evaluate.py` §1 (pycocotools) |
| 2 | **Precision / recall / F1 at the operating threshold** (conf ≥ reject threshold, IoU ≥ 0.5, same class) | At the threshold the line actually uses, how many boxes are right / how many defects are found? | `evaluate.py` §2 |
| 3 | **Image-level outcome table**: annotated defective vs. PASS / REVIEW / REJECT | How does the full system (model + policy) route cells? | `evaluate.py` §3 |
| 4 | **Latency** (mean / median / p95 per image, CPU) | Is it fast enough for an inspection station? | `evaluate.py` §4 |
| — | Geti's model score | Geti's own evaluation, on its **validation** split | Geti screenshot |

Notes:
- Table 3 is **not** a per-class confusion matrix and **not** a replacement for mAP. It is a
  2×3 table of *image-level* ground truth (≥ 1 actionable defect box or not) against the policy decision.
- A "defect-free" row only exists if the test set contains images with no defect annotations.
- Report **Geti validation** numbers and **held-out test** numbers separately, and say which is which.

## Comparing models and methods (`scripts/benchmark.py` → Models page)

A public, curated dataset can give a high score that says little about real use. The benchmark is
built to show **where a model breaks**, not just one headline number:

| Comparison | What changes | What to conclude |
|---|---|---|
| Architecture | YOLOX-Tiny vs YOLOX-S (vs others) | accuracy gained per ms of latency |
| Precision | FP16 vs INT8 of one model | speed-up vs accuracy lost |
| Robustness | the same test images blurred, darkened, brightened, low-contrast, noisy, JPEG-compressed | how fragile the score is to camera/lighting changes; a big drop means "high mAP" won't transfer |
| Threshold sweep | reject threshold 0.05 → 0.95 | the escape-vs-false-reject trade-off that justifies the 0.60 / 0.30 policy |
| Leakage check | dHash (256-bit) of every test image vs every training image | near-identical pairs inflate scores; inspect the flagged pairs and report the count |

Every value on the Models page comes from `benchmark.json`. Geti-reported values (`meta.json`) are
labelled "reported by Geti" and kept apart from measured results. Each model is identified by a SHA-256 of its files, and the same
hash is stored with every live inspection, so a decision on the line can be traced to the exact
model that was benchmarked.

Caveats: perturbations are synthetic stand-ins for real camera changes. The leakage check finds
near-identical images, not semantic duplicates (e.g. the same cell photographed twice from different angles).

## Decision policy (assumptions)

```
top actionable confidence ≥ 0.60  → REJECT
0.30 ≤ top confidence < 0.60      → REVIEW (manual inspection)
otherwise                         → PASS  ("nothing actionable found", not "verified defect-free")
inference error                   → REVIEW (fail-safe: an error never passes a cell)
```

The thresholds are placeholders. If you tune them, tune on the validation set or justify the choice,
then report test results at the chosen values. Trade-off: lower thresholds → fewer escapes, more reviews/false rejects.

## Results (fill in)

**Dataset:** Roboflow "Battery Defect Inspection" v8 (CC BY 4.0), classes crack / scratch,
images train/valid/test = 3,214 (1,072 originals ×3 augmented) / 306 / 153, test images without
defect annotations: 37. Test photos come from the same photo sessions as training (see `docs/DATASET.md`).
**Model:** YOLOX-TBD, input TBD, trained in Geti vTBD for TBD epochs (TBD min).

### Geti validation score (screenshot)
TBD

### 1. Detection quality: held-out test set
| Class | AP@50 | AP@50:95 |
|---|---|---|
| TBD | TBD | TBD |
| **mean** | **TBD** | **TBD** |

### 2. Precision / recall at conf ≥ 0.60, IoU ≥ 0.5
| Class | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| TBD | | | | | | |

### 3. Image-level outcomes
| GT \ Decision | PASS | REVIEW | REJECT |
|---|---|---|---|
| defective | TBD | TBD | TBD |
| no defect annotated | TBD | TBD | TBD |

Defect escape rate TBD · False reject rate TBD · Review rate TBD

### 4. Latency
TBD ms mean / TBD p95 on TBD CPU, FP16/FP32 TBD.

### Failure examples
Include 2–3 images from `evaluate.py` §5 (escapes and false rejects), with a short explanation each:
lighting, small defect, annotation error, ambiguous texture, etc.

## Limitations (keep in the report)

- **No detection ≠ defect-free.** PASS means nothing was found above threshold.
- If the dataset has few or no clean images, **PASS correctness and false-reject rate are not validated**.
- Public dataset images (camera, lighting, cell type) differ from any real production line, so these
  results do not predict deployment performance without re-validation on site.
- A small test set gives wide uncertainty. Report the number of images and boxes next to every metric.
- Near-duplicate or augmented images across splits inflate scores. State how splits were made.
- The DEMO mode of the dashboard uses scripted results and is excluded from all metrics.
