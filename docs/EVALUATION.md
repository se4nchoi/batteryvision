# Evaluation plan and results template

> **Status:** ATSS-MobileNetV2 evaluated on 2026-10-20 (results below). YOLOX results pending.
> Fill remaining `TBD` / ✍️ items only from `scripts/benchmark.py` / `evaluate.py` output or Geti screenshots.

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

## What "good" means on a real line

- **The test set is ~75% defective; a real line might be under 1%.** Raw precision on the test set
  therefore overstates how clean the reject bin would be. The Models page's **On a real line** card
  converts the *measured* cell-level rates (defective cells stopped, good cells flagged) into results
  per 10,000 cells at a chosen defect rate. Example: with 91% caught and 20% of good cells flagged,
  at a 0.5% defect rate only about 2 of every 100 stopped cells are defective. For a line, the good-cell
  flag rate matters as much as mAP.
- **Headline metrics for the project are cell-level:** defective cells missed (escapes) and good cells
  flagged. mAP and per-class AP stay as the standard model metrics. Crack vs scratch only matters
  if the two are handled differently downstream.
- **Background dependence:** the **By background** card reports results per background group (wood,
  grey, green mat; estimated from border colour). A large gap means the model uses the background. A
  factory belt is unseen, so add a live-camera test on a new surface.
- **Rotation:** the dataset has one photo per battery, so it cannot measure 360° inspection. The demo
  shows the mechanism with synthetic 4-view cells. A real project needs multi-view captures per cell
  (see "From demo to a real project" below).

## From demo to a real project

1. Capture each cell from 4+ angles (or with a line-scan camera while it rotates) on the real line, with
   fixed lighting and the real belt as background.
2. Collect mostly **normal** cells (realistic prevalence) plus every defect you can find. Label defects
   per view, and record the cell ID so all views of a cell stay in the same split.
3. Split by **cell and by session/day**, never by photo, to avoid near-duplicate leakage.
4. Choose thresholds for a target escape rate, then report the good-cell flag rate at that operating
   point, at the line's real defect rate.

## Decision policy (assumptions)

```
top actionable confidence ≥ 0.60  → REJECT
0.30 ≤ top confidence < 0.60      → REVIEW (manual inspection)
otherwise                         → PASS  ("nothing actionable found", not "verified defect-free")
inference error                   → REVIEW (fail-safe: an error never passes a cell)
```

The thresholds are placeholders. If you tune them, tune on the validation set or justify the choice,
then report test results at the chosen values. Trade-off: lower thresholds → fewer escapes, more reviews/false rejects.

## Results: ATSS-MobileNetV2 (measured 2026-10-20)

Source files: `docs/results/benchmark.json` and `docs/results/evaluation_20261020_151753.md`.
Everything below was measured on the 153-image held-out test split on this laptop's CPU.

**Dataset:** Roboflow "Battery Defect Inspection" v8 (CC BY 4.0), classes crack / scratch,
images train/valid/test = 3,214 (1,072 originals ×3 augmented) / 306 / 153, test images without
defect annotations: 37. Test photos come from the same photo sessions as training (see `docs/DATASET.md`).
**Model:** ATSS-MobileNetV2 (Geti "Balance" preset), version 1, exported as OpenVINO FP16 with XAI head
(5.8 MB). YOLOX-S: TBD (training queued). Model input is RGB (verified: RGB mAP@50 0.933 vs BGR 0.891).

### Geti validation score
85.9% (Geti's own score on its validation split; screenshot ✍️).

### 1. Detection quality: held-out test set
| Class | AP@50 | AP@50:95 |
|---|---|---|
| crack | 1.000 | 0.665 |
| scratch | 0.866 | 0.520 |
| **mean** | **0.933** | **0.592** |

### 2. Precision / recall / F1 per class (IoU ≥ 0.5), at both operating points
| Class | Threshold | TP | FP | FN | Precision | Recall | F1 |
|---|---|---|---|---|---|---|---|
| crack | 0.30 (flag for review) | 60 | 3 | 0 | 0.952 | 1.000 | 0.976 |
| scratch | 0.30 (flag for review) | 62 | 13 | 19 | 0.827 | 0.765 | 0.795 |
| **all** | 0.30 | 122 | 16 | 19 | 0.884 | 0.865 | **0.875** |
| crack | 0.60 (auto-reject) | 59 | 0 | 1 | 1.000 | 0.983 | 0.992 |
| scratch | 0.60 (auto-reject) | 29 | 0 | 52 | 1.000 | 0.358 | 0.527 |
| **all** | 0.60 | 88 | 0 | 53 | 1.000 | 0.624 | **0.769** |

Cracks are detected almost perfectly. Scratches are the weak class: at 0.30, 19 of 81 scratch boxes
are missed and 13 false scratch boxes appear; at 0.60 most scratches fall below the auto-reject line.

### Detection confusion matrix (boxes, IoU ≥ 0.5)
At confidence ≥ 0.30. Rows = annotated, columns = predicted; background = missed (column) / false box (row).

| annotated \ predicted | crack | scratch | background |
|---|---|---|---|
| crack | 60 | 0 | 0 |
| scratch | 0 | 62 | 19 |
| background | 3 | 13 | 0 |

The model never confuses crack and scratch (0 off-diagonal between the classes at either threshold);
its errors are missed and false scratches.

### Cell-level classification (defective vs. good, 153 test images)
| 'Defective' means | Accuracy | Precision | Recall | Specificity | F1 | TP / FN / FP / TN |
|---|---|---|---|---|---|---|
| flagged (review or reject) | **98.0%** | 97.5% | 100.0% | 91.9% | **0.987** | 116 / 0 / 3 / 34 |
| auto-rejected only | 81.0% | 100.0% | 75.0% | 100.0% | 0.857 | 87 / 29 / 0 / 37 |

### 3. Image-level outcomes
| GT \ Decision | PASS | REVIEW | REJECT |
|---|---|---|---|
| defective (116) | 0 | 29 | 87 |
| no defect annotated (37) | 34 | 3 | 0 |

Defect escape rate **0%** · False reject rate **0%** · Review rate 20.9% (32 of 153).
Threshold sweep (reject-only decision): at 0.30, 100% of defective images rejected with 8.1% of clean
images rejected; at 0.45, 91.4% / 0%; at 0.60, 75.0% / 0%.

### 4. Latency
45.4 ms mean / 44.7 ms median / 51.2 ms p95 per image (ModelAPI call incl. pre/post-processing,
FP16, CPU, n = 152, first call excluded). About 50 ms per cell on the virtual line.

### Robustness (mAP@50 on altered copies of the test images)
Original 0.933 · blur 0.861 · darker 0.873 · low contrast 0.878 · brighter 0.909 · noise 0.921 · heavy JPEG 0.922.
Blur and darkness cost the most (≈ 6–7 points).

### By background (border-colour heuristic)
| Background | Images | Defective caught | Good flagged | Box recall @0.60 |
|---|---|---|---|---|
| green mat | 40 | 100% | – (no clean images) | 73% |
| grey / neutral | 56 | 100% | 0% | 74% |
| wood / brown | 57 | 100% | 0% | 49% |

Box recall on wood backgrounds is markedly lower: the model is less confident on scratches against
wood grain. Cell-level catch rate stays 100% because those cells still go to REVIEW.

### Leakage check
22 of 153 test images are near-identical (dHash, Hamming ≤ 8) to a training image, consistent with
burst photos from the same sessions. Scores are therefore optimistic for unseen conditions.

### Failure examples
No escapes and no false rejects at the current policy. For the report, use REVIEW cases instead
(scratches at 0.3–0.6 confidence, especially on wood) as the "uncertain" examples ✍️.

## Limitations (keep in the report)

- **No detection ≠ defect-free.** PASS means nothing was found above threshold.
- If the dataset has few or no clean images, **PASS correctness and false-reject rate are not validated**.
- Public dataset images (camera, lighting, cell type) differ from any real production line, so these
  results do not predict deployment performance without re-validation on site.
- A small test set gives wide uncertainty. Report the number of images and boxes next to every metric.
- Near-duplicate or augmented images across splits inflate scores. State how splits were made.
- The DEMO mode of the dashboard uses scripted results and is excluded from all metrics.
