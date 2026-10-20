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

**Dataset:** TBD name, license TBD, classes TBD, images train/valid/test = TBD / TBD / TBD,
clean images in test: TBD.
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
