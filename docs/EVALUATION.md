# Evaluation plan and results template

> **Status:** ATSS-MobileNetV2 and YOLOX-S evaluated on 2026-10-20 (results and comparison below).
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
(5.8 MB). Model input is RGB (verified: RGB mAP@50 0.933 vs BGR 0.891).

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
burst photos from the same sessions. They have since been moved out of the test split; see
[Deduplicated test set](#deduplicated-test-set-131-images-measured-2026-10-20) below.

### Failure examples
No escapes and no false rejects at the current policy. For the report, use REVIEW cases instead
(scratches at 0.3–0.6 confidence, especially on wood) as the "uncertain" examples ✍️.

## Model comparison: ATSS-MobileNetV2 vs YOLOX-S (measured 2026-10-20)

Both exported from Geti as OpenVINO FP16 with XAI head, evaluated on the same 153 test images with the
same policy (review ≥ 0.30, reject ≥ 0.60). YOLOX report: `docs/results/evaluation_20261020_153009.md`;
both models: `docs/results/benchmark.json`. Both models expect RGB input (YOLOX: RGB 0.897 vs BGR 0.732
mAP@50, although its metadata sets `reverse_input_channels = True`).

| | ATSS-MobileNetV2 | YOLOX-S |
|---|---|---|
| mAP@50 / mAP@50:95 | **0.933** / **0.592** | 0.897 / 0.560 |
| AP@50 crack / scratch | 1.000 / **0.866** | 1.000 / 0.795 |
| Box P / R / F1 at 0.30 | 0.884 / **0.865** / **0.875** | **0.919** / 0.801 / 0.856 |
| Box P / R / F1 at 0.60 | 1.000 / **0.624** / **0.769** | 1.000 / 0.454 / 0.624 |
| Crack / scratch confusion | none | none |
| Cell accuracy / F1 (flagged at 0.30) | **98.0%** / **0.987** | 95.4% / 0.969 |
| Defective cells passed (of 116) | **0** | 6 |
| Good cells flagged (of 37) | 3 | **1** |
| Cell accuracy (auto-reject only) | **81.0%** | 66.0% |
| Robustness: largest mAP@50 drop | −7.2 pts (blur) | **−2.6 pts** (blur) |
| Latency mean / p95 (CPU) | **44.9** / **47.9** ms | 48.1 / 72.5 ms |
| Size | **5.8 MB** | 18.4 MB |
| Box recall @0.60 by background (green / grey / wood) | 0.72 / 0.74 / 0.49 | 0.35 / 0.53 / 0.48 |

**Reading the comparison**
- ATSS is more accurate overall, mainly on scratches, and smaller.
- YOLOX outputs lower confidence scores, so a shared 0.30 / 0.60 policy disadvantages it. On the test-set
  sweep YOLOX at 0.20 stops 100% of defective cells while flagging 2.7% of good cells; ATSS needs 0.30 for
  100% and then flags 8.1%. Choosing per-model thresholds from the **test** set would bias the comparison,
  so thresholds should be selected on the **validation** split (next step).
- YOLOX is more robust to blur, darkness and noise.
- Neither model ever mistakes a crack for a scratch or vice versa; all errors are missed or false scratches.

## Deduplicated test set (131 images, measured 2026-10-20)

`scripts/dedup_test_set.py --dataset ..\datasets\battery` moved the 22 near-duplicate test images
(18 boxes) to `datasets/battery/test_near_duplicates/` and rewrote `test/_annotations.coco.json`
without them; the original is kept as `test/_annotations.full.coco.json`. The test set is now 131 images,
123 boxes (45 crack / 78 scratch), 33 without defects, and the leakage check finds 0 near-duplicates.
Same models, same policy. Results: `docs/results/benchmark.json` (the 153-image run is kept as
`benchmark_20261020_152909.json`). The sections above still report the 153-image run.

| | ATSS-MobileNetV2: 153 → 131 | YOLOX-S: 153 → 131 |
|---|---|---|
| mAP@50 / mAP@50:95 | 0.933 / 0.592 → **0.929 / 0.587** | 0.897 / 0.560 → **0.892 / 0.549** |
| AP@50 crack / scratch | 1.000 / 0.866 → **1.000 / 0.858** | 1.000 / 0.795 → **1.000 / 0.784** |
| Box recall at 0.60 | 0.624 → **0.577** | 0.454 → **0.390** |
| Defective cells passed | 0 of 116 → **0 of 98** | 6 of 116 → **6 of 98** |
| Good cells flagged | 3 of 37 → **3 of 33** | 1 of 37 → **1 of 33** |
| Review rate | 20.9% → **23.7%** | 30.7% → **34.4%** |
| Robustness: blur mAP@50 | 0.861 → **0.854** | 0.871 → **0.864** |

The near-duplicates inflated mAP by under 1 point, so the earlier ranking and conclusions stand.
They were easier than average at the reject threshold (box recall at 0.60 drops 5–6 points without
them), so more cells now go to REVIEW instead of auto-reject. The remaining test photos still come
from sessions that also appear in train (see [DATASET.md](DATASET.md)), so the later-session holdout
below remains the better estimate for unseen conditions.

## Speed: precision and device (measured 2026-10-20)

Each Geti model was exported in three variants: FP16, FP16 with XAI head, and INT8 (post-training
optimization). All six were run on the 131-image deduplicated test set with
`scripts/benchmark.py --latency-devices CPU GPU.0 NPU`. Accuracy is measured on CPU. Then each model is
reloaded on each device in a fresh process, given 10 warm-up calls, and timed once per test image. Times are
end to end per image (preprocessing, inference, postprocessing), batch size 1, on an Intel Core Ultra 7 265K
with its integrated GPU.

Mean / p95 ms per image:

| Model | CPU | iGPU (GPU.0) | Size | mAP@50 | Defective cells passed (of 98) | Good cells flagged (of 33) |
|---|---|---|---|---|---|---|
| ATSS FP16 | 46.2 / 71.7 | 46.9 / 55.9 | 5.7 MB | 0.929 | 0 | 3 |
| ATSS FP16 + XAI | 52.5 / 73.5 | 48.2 / 55.0 | 5.8 MB | 0.929 | 0 | 3 |
| ATSS INT8 | **21.0** / 29.2 | 24.5 / **26.6** | **3.9 MB** | 0.929 | 1 | 2 |
| YOLOX-S FP16 | 42.7 / 60.9 | 25.9 / 28.5 | 18.4 MB | 0.892 | 6 | 1 |
| YOLOX-S FP16 + XAI | 45.7 / 62.0 | 27.6 / 30.9 | 18.4 MB | 0.892 | 6 | 1 |
| YOLOX-S INT8 | **18.7** / 29.6 | 20.7 / 29.2 | 9.8 MB | 0.902 | 8 | 0 |

**Reading it**
- **INT8 is the main speed gain: about 2.2× faster on CPU** (ATSS 46.2 → 21.0 ms, YOLOX-S 42.7 → 18.7 ms) at
  half the file size or less. mAP@50 is unchanged for ATSS and slightly higher for YOLOX-S. However, INT8 lowers
  confidence scores a little. At the 0.60 reject threshold, box recall drops (ATSS 0.577 → 0.520,
  YOLOX-S 0.390 → 0.350). At the 0.30 review threshold, ATSS INT8 lets 1 defective cell pass (FP16: 0) and
  YOLOX-S INT8 lets 8 pass (FP16: 6). If INT8 goes on the line, re-choose the thresholds for it on the
  validation split.
- **The XAI head costs 3–6 ms per image on CPU** (about +7–14%) and about 1–2 ms on the iGPU. That is the
  price of the saliency heatmap. Use the plain export when the heatmap isn't needed.
- **The iGPU helps YOLOX-S (42.7 → 25.9 ms) but not ATSS (46.2 → 46.9 ms).** For INT8 models the CPU is as
  fast as the iGPU or faster. p95 latency is steadier on the iGPU (smaller gap between mean and p95).
- **The iGPU gives slightly different results:** mAP@50 differs from CPU by 0.1–1.5 points (YOLOX-S
  FP16 0.892 → 0.903, INT8 0.902 → 0.887). This comes from different kernels and precision, so validate on the
  device you deploy on.
- **The NPU (Intel AI Boost) could not be measured.** ATSS FP16 hung the device
  (`ZE_RESULT_ERROR_DEVICE_LOST`), and after that every NPU run failed, including a YOLOX-S INT8 model
  that had run on the NPU earlier in the session. Retry after a reboot or NPU driver update. Run the
  YOLOX-S INT8 model first, because it is known to work.
- FP16 vs FP32 was not compared (no FP32 export downloaded). On CPU, OpenVINO runs FP16 weights at higher
  internal precision, so a large difference is not expected there.

Raw numbers: `docs/results/benchmark.json` (per model: `devices`). The Models page shows them in
**Speed by precision and device**.

## Later-session holdout (measured 2026-10-20)

Same two models and policy (review ≥ 0.30, reject ≥ 0.60), run on photos the models have never seen:
a later photo session by the same dataset author, with the same kind of cells and partly different
backgrounds (mostly grey and green mat, few wood). Set construction and overlap removal:
[DATASET.md](DATASET.md#later-session-holdout-battery-defect-detection-v2-final300-test-only).
Reports: `docs/results/later_session_clean/benchmark.json` (45 never-augmented photos, headline) and
`docs/results/later_session/benchmark.json` (160 photos, 115 of them Roboflow-augmented; includes
robustness and a duplicate check, which found 0 duplicates against `datasets/battery`).

| Cell-level, at the current policy | Main test set (153) | Holdout, clean (45) | Holdout, all (160) |
|---|---|---|---|
| **ATSS** defective cells caught (REVIEW or REJECT) | 100% | **47%** (14 / 30) | 55% (60 / 110) |
| **ATSS** defective cells auto-rejected (≥ 0.60) | 75% (87 / 116) | **0%** (0 / 30) | 8% (9 / 110) |
| **ATSS** good cells flagged for review | 8% (3 / 37) | 13% (2 / 15) | 16% (8 / 50) |
| **YOLOX-S** defective cells caught | 95% | **3%** (1 / 30) | 6% (7 / 110) |
| **YOLOX-S** good cells flagged | 3% (1 / 37) | 0% | 0% |
| Good cells auto-rejected (both models) | 0% | 0% | 0% |

| Detection quality | ATSS clean / all | YOLOX-S clean / all |
|---|---|---|
| mAP@50 | 0.711 / 0.475 | 0.931 / 0.460 |
| mAP@50:95 | 0.293 / 0.160 | 0.310 / 0.123 |
| Box recall at 0.30 (crack / scratch, clean) | 1 of 15 / 8 of 15 | 0 of 15 / 1 of 15 |

**What it shows**
- **Defects are missed, not mistaken.** Most escapes have the right class at the right place, scored
  0.06–0.28: below the review threshold. The models still *rank* defects above background (YOLOX's 0.931
  mAP@50 on the clean set), but their confidence no longer matches the thresholds. With 45 images, mAP
  mostly measures ranking at very low scores and says little about decisions at 0.30 / 0.60.
- **No threshold rescues ATSS.** On the clean set, catching 97% of defective cells needs a 0.15 threshold,
  which also flags 87% of good cells. YOLOX's scores separate better (0.05 catches 57% with no good cell
  flagged), but that is far below an acceptable catch rate and the threshold would be chosen on test data.
- **Good cells stay safe.** No good cell is auto-rejected by either model. The failure mode under change
  is **escapes**, which is the costly one on a real line.
- **Robustness collapses as well** (ATSS, 160 set, mAP@50): clean 0.475 · blur 0.143 · darker 0.085 ·
  low contrast 0.152. On the main test set the same perturbations cost only 6–7 points.
- **Background and session are confounded.** Escapes concentrate on grey and green-mat photos, but those
  are also the newest photos. This set cannot say whether background, lighting or the cells themselves
  cause the drop.

**What to claim in the report.** The main test set measures a fixed station: same backgrounds, lighting
and photo sessions as training. That is a fair assumption for a factory, where the inspection cell is
enclosed and controlled. This holdout shows the condition is necessary: a later session with partly new
backgrounds halves ATSS's catch rate and removes YOLOX-S's almost entirely. Every new station, camera or
lighting change therefore needs re-validation and, most likely, retraining on its own images. ATSS degrades
far less than YOLOX-S, which is another argument for ATSS.

**Next step if time allows.** Add this export's train-split photos (unaugmented originals) to the Geti
project and retrain; keep `unseen_clean` (45 photos) as the held-out test. That measures how much a few
hundred photos of the new conditions recover.

## Saliency (XAI): does it explain the detections?

Both exports include Geti's XAI head, which outputs one coarse activation map per class (ATSS 25×31
cells, YOLOX-S 40×40 cells; each cell covers about 16–26 px of the 640 px image). Measured on the 116
defective test images with `backend/scripts/saliency_check.py`, using the map of the annotated class:

| | ATSS-MobileNetV2 | YOLOX-S |
|---|---|---|
| Pointing game: hottest point inside the annotated box (+8 px) | 48% | **98%** |
| Saliency mass inside annotated boxes (vs. their share of image area) | 2.3% vs 1.5% (×1.5) | 2.4% vs 1.5% (×1.6) |
| Pointing game on wood / grey / green backgrounds | 44% / 63% / 40% | 100% / 100% / 95% |

What this supports:
- **YOLOX-S's map is a reliable "where" pointer**: its peak lands on the defect in 98% of images, so
  the heatmap is useful for an operator reviewing a flagged cell.
- **ATSS's map is not** (peak on the defect about half the time), even though ATSS detects better. Map
  quality and detection accuracy are different properties.
- Both maps are **diffuse**: only ~1.5× more activation falls on the defect than its area alone would
  predict, so most activation is spread over the cell and background.

What it does not support: saliency shows *where* the class score is high, not *why* (which visual
features). It cannot tell texture from shape, and at this resolution it cannot outline a thin scratch.
Use it as a review aid and a sanity check, not as an explanation of the decision.

## Why does ATSS outperform YOLOX-S here?

Reasonable, checkable causes (not proven; each model was trained once, so run-to-run variance is unknown):
1. **Input resolution** (Geti template defaults, not tuned for this data). ATSS runs at **992×800** (the 640×640 photos are upscaled ≈1.5×); YOLOX-S runs at
   **640×640**. Scratches are thin and small (median box ≈ 0.4% of the image), so the extra pixels per
   defect plausibly explain most of ATSS's lead on scratches (AP@50 0.866 vs 0.795), while cracks
   (larger, high contrast) are 1.000 for both.
2. **Confidence calibration.** YOLOX scores are objectness × class probability, which tends to give lower
   numbers (Geti's default threshold for this export is 0.225 vs 0.30 for ATSS). At the shared 0.30 / 0.60
   policy YOLOX therefore loses recall; at its own lower threshold its trade-off is competitive.
3. **Training recipe / sample assignment.** ATSS selects positive anchors adaptively from IoU statistics,
   which is known to help small objects; YOLOX's defaults are tuned for general object sizes. Epoch counts
   and early stopping chosen by Geti also differ between templates.

How to confirm: retrain YOLOX-S at a larger input size (e.g. 992×800 or tiling) and compare scratch AP;
pick per-model thresholds on the validation split; repeat each training 2–3 times to see the variance.

## Limitations (keep in the report)

- **No detection ≠ defect-free.** PASS means nothing was found above threshold.
- If the dataset has few or no clean images, **PASS correctness and false-reject rate are not validated**.
- Public dataset images (camera, lighting, cell type) differ from any real production line, so these
  results do not predict deployment performance without re-validation on site. Measured: on a later
  photo session of the same author, ATSS catches 47% of defective cells instead of 100% (see
  "Later-session holdout").
- A small test set gives wide uncertainty. Report the number of images and boxes next to every metric.
- Near-duplicate or augmented images across splits inflate scores. State how splits were made.
- The DEMO mode of the dashboard uses scripted results and is excluded from all metrics.
