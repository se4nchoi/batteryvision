# Dataset: Battery Defect Inspection (Roboflow Universe, v8 "Final-1")

Facts below were read from the downloaded COCO export (`Battery Defect Inspection.v8-final-1.coco.zip`)
and its Roboflow page on 2026-10-20. They can be quoted in the report.

| | |
|---|---|
| Source | <https://universe.roboflow.com/battery-oqphu/battery-defect-inspection> (version 8, "Final-1", generated 2025-05-20) |
| License | **CC BY 4.0**: attribute the dataset in the report |
| Task / format | Object detection, COCO JSON (`bbox` = `[x, y, w, h]` in pixels) |
| Classes | **crack**, **scratch** (the `Battery` category is Roboflow's empty super-category: 0 boxes) |
| Original photos | 1,531 |
| Preprocessing (all splits) | auto-orient, **stretch to 640×640**, auto-contrast (adaptive equalization) |
| Augmentation (train only) | 3 outputs per training photo: horizontal flip (50%), rotation ±15°, brightness ±15%, blur ≤ 0.3 px |

## Splits

| Split | Images | Unique originals | Boxes (crack / scratch) | Images with a defect | Images without boxes |
|---|---|---|---|---|---|
| train | 3,214 | 1,072 (×3 augmented) | 3,026 (1,188 / 1,838) | 2,363 | 851 |
| valid | 306 | 306 | 299 (118 / 181) | 230 | 76 |
| test | 153 | 153 | 141 (60 / 81) | 116 | **37** |

- Every annotated image contains **one defect type** (crack *or* scratch, never both).
- Defects are **small**: median box ≈ 0.4% of the image area (≈ 40×40 px at 640×640); 10% of boxes are below 0.1%.
- Images without boxes exist in every split, so **false rejects can be measured** on the test set.

## Leakage checks

- **No original photo appears in more than one split.** Roboflow file names keep the original name
  before `.rf.`; there is zero overlap between train/valid/test, and valid/test contain no augmented copies.
- **The same photo sessions appear in train and test.** Many photos are bursts
  (e.g. `KakaoTalk_Photo_2025-04-26-16-25-05-001`, `-027`). By a filename-based heuristic, 152 of
  153 test images come from a session/burst that also appears in train. Test scores therefore measure
  performance **on familiar batteries, backgrounds and lighting**, not on a new line. Run
  `scripts/benchmark.py --train-images ...` for the image-similarity check, and use the robustness
  results and a live-camera test to discuss generalization.

## Implications for training and the demo

- Prefer **YOLOX-S** (or larger) over YOLOX-Tiny if time allows. Small defects lose detail at
  smaller input sizes. Train both and compare on the Models page.
- In Geti, drop the empty `Battery` label on import if it appears.
- Live-camera frames are **not** contrast-equalized or stretched like the dataset images, so expect
  lower confidence on webcam captures than on test images.

## Where it lives locally

`datasets/battery/{train,valid,test}/` (git-ignored; the license allows redistribution, but the
images are kept out of the repository to keep it small). The dashboard's **Data source → Dataset test / valid**
replays these photos with their **annotated** boxes. Live mode uses the test photos automatically
when `sample_data/live/` is empty.
