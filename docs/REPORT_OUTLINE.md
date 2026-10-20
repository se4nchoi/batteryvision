# PDF report outline: BatteryVision

Target: 5–8 pages. Numbers are measured (`docs/EVALUATION.md`, `docs/DATASET.md`, `docs/results/`).
✍️ marks inputs only you can supply (screenshots, Geti settings, your own checks).

## 1. Problem statement (½ page)
- Lithium-ion cells with surface defects (scratches, cracks / casing damage) indicate handling damage and are a
  safety and quality concern; manual visual inspection at line speed is tiring and inconsistent.
- In production, surface inspection is a 100% inline, per-cell step near the end of the line (formation and
  aging are batch steps); vendors describe 360° camera inspection of every cell.
- Goal: detect and localize visible surface defects, and turn detections into an auditable PASS / REVIEW / REJECT decision.
- Scope: an offline prototype on a public dataset, demonstrated on a simulated line; no physical equipment.

## 2. Technique (½ page)
- Task: **object detection** (localizes the defect for the reviewer; several defects per cell).
- Models trained in Intel Geti (Geti 2.x interface ✍️ version): **ATSS-MobileNetV2** ("Balance" preset) and
  **YOLOX-S** (one-stage, anchor-free). Input sizes are Geti template defaults: ATSS 992×800, YOLOX-S 640×640.
- Deployment: Geti exports OpenVINO IR (FP16 with XAI head); BatteryVision runs it with Intel ModelAPI on CPU.
  Both models expect RGB input (verified: ATSS 0.933 vs 0.891, YOLOX 0.897 vs 0.732 mAP@50 for RGB vs BGR).

## 3. Dataset and annotations (1 page)
- Roboflow Universe "Battery Defect Inspection" v8, **CC BY 4.0** (cite the URL). Classes **crack**, **scratch**.
- Splits: train 3,214 (1,072 originals ×3 augmented), valid 306, test 153. Test boxes: 60 crack, 81 scratch;
  **37 test images without defects**.
- Preprocessing (all splits): stretch to 640×640, adaptive contrast equalization. Augmentation (train only):
  flip, ±15° rotation, brightness ±15%, slight blur.
- Defects are small: median box ≈ 0.4% of the image (≈ 40×40 px).
- Annotation: existing COCO boxes imported into Geti instead of hand-labelling; spot-check ✍️ (N images, issues found).
- Leakage checks: no original photo in two splits; but 152/153 test photos come from sessions also in train,
  and 22 test images were near-duplicates (dHash) of training images. Removing them (131 test images left)
  changes mAP@50 by under 1 point: ATSS 0.933 → 0.929, YOLOX-S 0.897 → 0.892.
- Figure ✍️: example images with ground-truth boxes per class (Dataset replay in the dashboard shows them).

## 4. Training (½ page)
- Geti version ✍️, epochs ✍️, training time ✍️ (YOLOX-S: roughly 4–5 h), hardware ✍️.
- Geti validation score: ATSS 85.9%; YOLOX-S ✍️. Screenshot of the Geti models page ✍️.

## 5. Evaluation (2 pages): copy tables from `docs/EVALUATION.md`
1. **Detection quality:** mAP@50 / @50:95: ATSS 0.933 / 0.592, YOLOX-S 0.897 / 0.560; AP@50 crack 1.000 (both),
   scratch 0.866 / 0.795.
2. **Per-class precision / recall / F1** at both operating points. ATSS at 0.30: crack F1 0.976, scratch 0.795,
   overall 0.875; at 0.60: overall 0.769 (scratch recall 0.36).
3. **Confusion matrix (boxes):** no crack↔scratch confusion for either model; ATSS errors at 0.30 = 19 missed
   + 13 false scratches, 3 false cracks.
4. **Cell level (defective vs good):** ATSS accuracy 98.0%, precision 97.5%, recall 100%, specificity 91.9%,
   F1 0.987 (flagged = review or reject); auto-reject only: 81.0% accuracy. Include the 2×2 matrix.
5. **Threshold trade-off:** at 0.30 ATSS stops 100% of defective cells with 8.1% of good cells flagged; at 0.60, 75% / 0%.
6. **Robustness:** ATSS largest drop −7.2 pts (blur), YOLOX −2.6 pts.
7. **By background:** ATSS box recall @0.60 green 0.72 / grey 0.74 / wood 0.49.
8. **Latency:** ATSS 44.9 ms mean (p95 47.9), YOLOX-S 48.1 ms (p95 72.5), CPU, FP16.
9. **Failure examples:** no escapes at the current policy; show 2–3 REVIEW cases (low-confidence scratches,
   especially on wood) ✍️ screenshots.

## 5b. Explainability and model comparison (½ page)
- Saliency (Geti XAI head): YOLOX's peak lands on the defect in 98% of images, ATSS's in 48%; both maps are
  coarse and diffuse (≈1.5× more activation on the defect than its area). They show *where*, not *why*.
- Why ATSS wins (plausible, not proven): higher input resolution for small scratches; YOLOX's lower confidence
  scale under a shared threshold; ATSS's adaptive sample assignment. Single training run each.

## 6. Application: BatteryVision (1 page)
- Architecture: line simulation → provider (Demo | Dataset replay | OpenVINO) → policy → SQLite → dashboard.
- Decision policy: REJECT ≥ 0.60, REVIEW ≥ 0.30, else PASS; inference error → REVIEW (fail-safe).
- Simulated line: 360° turn at the camera, reject and review pushers, accept bin; 2D and 3D views.
- Traceability: every record stores model name + SHA-256 hash and thresholds.
- Screenshots ✍️: Overview in Live mode, Models → Model performance, Batches.
- Honesty measures: demo/example data labelled, no synthetic latency, no yield or ROI claims.

## 6b. From inspection to process insight (¼ page)
- Batches page: lot control chart, per-machine defect rates (one-sided test, p < 0.01) with a confounding check.
- Simulated fault in Winder W2 recovered from the real model's detections: W2 72% vs W1 31%, p ≈ 7×10⁻¹⁰;
  R2 correctly marked "explained by W2". Process steps are real stages; machines and lots are simulated.
- Roadmap: `docs/SMART_FACTORY.md` (data acquisition, fault detection, digital twin).

## 7. Limitations and next steps (½ page)
- **Prevalence:** test set ~76% defective. At a 0.5% defect rate, ATSS would stop all defective cells but only
  ~6 in 100 stopped cells would be defective; YOLOX ~15 in 100 while missing ~3 per 10,000 cells.
- **Familiar conditions:** same-session photos (the 22 near-duplicates are removed, but sessions still overlap); tabletop backgrounds, not a factory belt;
  dataset images are contrast-equalized, live webcam frames are not. Optional ✍️: webcam test on new surfaces.
- **Rotation:** one photo per battery; 360° inspection is shown only as a simulated mechanism.
- **Single training run** per model; thresholds not yet tuned on the validation split.
- Next steps: images from the real line (all sides, mostly normal cells); per-model thresholds chosen on
  validation data; larger input size or tiling for scratches; repeat training to measure variance.

## 8. References
Roboflow dataset (CC BY 4.0, URL), Intel Geti docs, OpenVINO / ModelAPI, YOLOX (Ge et al., 2021,
arXiv:2107.08430), ATSS (Zhang et al., 2020, "Bridging the Gap Between Anchor-based and Anchor-free Detection").
