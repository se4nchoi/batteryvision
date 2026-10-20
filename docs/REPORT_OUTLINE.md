# PDF report outline: BatteryVision

Target: 5–8 pages. ✍️ marks inputs only you can supply (measured numbers, screenshots, dataset facts).

## 1. Problem statement (½ page)
- Lithium-ion cells with surface defects (scratches, cracks / casing damage) can indicate handling
  damage and are a safety and quality concern. Manual visual inspection at line speed is tiring and inconsistent.
- Goal: detect and localize visible surface defects on cell images, and turn detections into an
  auditable PASS / REVIEW / REJECT routing decision.
- Scope: an offline prototype trained on a public dataset, demonstrated on a simulated line.
  Not a deployed system, with no physical equipment.

## 2. Technique (½ page)
- Task: **object detection** (not classification). It shows *where* the defect is, which supports
  operator review and allows several defects per cell. Mention why not segmentation (box annotations
  available, faster to train/infer).
- Model: **YOLOX-Tiny / YOLOX-S** in Intel Geti. One-stage, anchor-free detector with a decoupled
  head. Tiny was chosen for CPU latency ✍️ (state which you used and why).
- Deployment: Geti exports OpenVINO IR. BatteryVision loads it with Intel ModelAPI on CPU.

## 3. Dataset and annotations (1 page)
- Source, URL, **license**, attribution ✍️
- Classes and per-class box counts ✍️; images per split ✍️; presence/absence of clean images ✍️
- Annotation format: COCO bounding boxes `[x, y, w, h]`, imported into Geti, which avoided
  hand-labelling ~1,000 images. Describe the **verification** you did in Geti (spot-check N images,
  issues found) ✍️
- Leakage control: held-out test split never uploaded to Geti; note augmentation ✍️
- 1 figure: example images with ground-truth boxes per class ✍️

## 4. Training (½ page)
- Geti version, architecture, input size, epochs, training time, hardware ✍️
- Screenshot of the Geti project / training result ✍️

## 5. Evaluation (1½ pages)
Copy tables from `docs/results/evaluation_*.md` ✍️ and explain each, following the structure in `docs/EVALUATION.md`:
1. mAP@50, mAP@50:95, per-class AP (test set) plus the Geti validation score, clearly labelled
2. Precision / recall / F1 at the operating threshold
3. Image-level PASS / REVIEW / REJECT table, with an explicit sentence on what it measures
4. Latency on CPU
5. 2–3 failure examples with explanations ✍️

## 6. Application: BatteryVision (1 page)
- Architecture diagram: line simulation → provider (Demo | OpenVINO) → policy → SQLite → dashboard
- Decision policy and thresholds, with the fail-safe (inference error → REVIEW)
- Screenshot of the dashboard in LIVE mode ✍️ (and DEMO, labelled as such)
- Honesty measures: demo data labelled, no synthetic latency, no yield/ROI claims

## 6b. From inspection to process insight (¼ page)
- Batches page: lot control chart, per-machine defect rates with significance and confounding check
- Simulated fault in Winder W2 is recovered from the model's detections (numbers from docs/SMART_FACTORY.md)
- Roadmap for data acquisition / fault detection / digital twin: docs/SMART_FACTORY.md

## 7. Limitations and next steps (½ page)
- Prevalence: test set ~75% defective vs. a rare-defect line. Include the projection at 0.5% (Models page).
- Background: per-background results; tabletop photos ≠ factory belt.
- Rotation: one photo per battery in the dataset; 360° inspection shown only as a simulated mechanism.
- Same-session photos in train and test (docs/DATASET.md): scores are for familiar conditions.
- Limitations from `docs/EVALUATION.md`
- Next steps: collect clean images from the target line; tune thresholds on validation data;
  more data for weak classes; compare YOLOX-S vs Tiny / INT8; integrate a real camera trigger.

## 8. References
Dataset (with license), Intel Geti docs, YOLOX paper (Ge et al., 2021, arXiv:2107.08430), OpenVINO / ModelAPI.
