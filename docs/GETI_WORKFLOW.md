# Intel Geti workflow: dataset → YOLOX → OpenVINO → BatteryVision

Written against Geti **v3** (docs.geti.intel.com, open-source `open-edge-platform/geti`).
Menu labels can differ slightly between versions, so check the version your instance shows.
Steps marked ✍️ produce material for the report; take a screenshot.

Facts confirmed from the Geti v3 docs and source:
- Dataset import accepts **Datumaro, COCO, YOLO, Pascal VOC** zip archives.
- Detection architectures include **YOLOX Tiny / S / L / X** (plus ATSS, SSD, RT-DETR, D-FINE, etc.).
- Trained models are converted to **OpenVINO IR** (`model.xml` + `model.bin`); FP32 / FP16 / INT8
  variants can be exported, as well as ONNX / PyTorch.
- Geti evaluates the converted model **on validation data**, and its own inference uses Intel **ModelAPI**,
  the same library BatteryVision uses.

## 0. Why a pre-annotated dataset

Hand-annotating ~1,000 images with boxes would take longer than the deadline allows, and the
assignment allows public datasets. Importing existing COCO/YOLO annotations means Geti's role is
**label verification, training, evaluation and export**. Say this explicitly in the report, and
mention that you spot-checked the annotations (step 3).

## 1. Get and vet the dataset (before uploading)

Dataset: <https://universe.roboflow.com/battery-oqphu/battery-defect-inspection>, version 8 "Final-1",
CC BY 4.0, classes **crack** and **scratch**. Verified facts and leakage checks are in
[DATASET.md](DATASET.md).

1. Sign in to Roboflow and open the dataset page. Record the following ✍️:
   - **License** (e.g. CC BY 4.0 → attribute it in the report)
   - **Classes** (do not assume "scratch / crack"; use the real names)
   - **Image count** and the **train / valid / test split**
   - Whether **augmentation** was applied. Augmented copies of one photo landing in
     different splits cause **leakage**. Prefer the raw version, or only augment train.
2. Check whether **defect-free (clean) images** exist. If not, the test set cannot measure
   false rejects, and the report must say so (see EVALUATION.md).
3. Download → format **COCO JSON** → unzip to `datasets\battery\` (git-ignored).
   Roboflow COCO exports look like `train/_annotations.coco.json`, `valid/...`, `test/...`.
4. **Keep `test/` out of Geti.** It is your held-out set for `scripts/evaluate.py`.
   If the dataset has no test split, move ~15% of images (whole capture sessions, not random
   frames, if near-duplicates exist) out before uploading.

## 2. Create the project by importing

1. Zip `train/` and `valid/` with their COCO JSON files (keep the folder structure Roboflow produced).
2. In Geti, use **dataset import** → upload the zip → wait for the preparation job.
3. Geti shows the detected task type, labels and counts. Choose **Detection** and create a **new project** ✍️.
   - Remove Roboflow's empty super-category label (often named after the dataset) if it appears.
   - If there is an object class like `battery` that is not a defect, either drop it here or keep it
     and set `BV_IGNORE_LABELS=battery` in BatteryVision.

## 3. Verify labels and annotations ✍️

- Compare the label list and per-label counts with what Roboflow showed.
- Open ~10–20 random images per label. Check that boxes are tight and on the defect, with no
  missing defects. Note problems you find; they are honest material for "limitations".
- Check class balance. A class with very few boxes will have unstable AP.

## 4. Train YOLOX ✍️

1. **Models → Train model**.
2. Architecture: train **both YOLOX-Tiny and YOLOX-S** on the same dataset revision. Start both
   right away; they can run while you do other work. Geti v3 explicitly supports training several
   architectures on one dataset revision for comparison. If time allows, add a third (e.g. RT-DETR or ATSS).
3. Keep default hyperparameters for the first run, and note the epochs / input size Geti uses.
4. Record start/end time and hardware ✍️.

## 5. Evaluate in Geti ✍️

- Screenshot the model's evaluation page. These scores are computed on Geti's **validation**
  data, so label them "validation" in the report.
- Then run BatteryVision's independent evaluation on the **held-out test split** (EVALUATION.md).
  These are the numbers to headline.

## 6. Export / download the model

> Your Geti instance uses the Geti 2.x interface (Models → Model variants → OpenVINO), which is
> slightly different from the v3 docs. Download **"OpenVINO FP16 with XAI head (Explanation included)"**:
> the zip holds `model.xml` + `model.bin` with labels and preprocessing embedded, plus a saliency
> output that the dashboard shows as a heatmap. Unzip it into `models\<name>\` (one folder per model).
> Geti models expect **RGB** input (BatteryVision's default).

- For each trained model, download the **OpenVINO** format (**FP16**). Also download **INT8** of
  the best model if offered; FP16 vs INT8 makes a quick accuracy-vs-speed comparison.
- Put each download in its own folder, named after what it is:
  `models\yolox_tiny_fp16\`, `models\yolox_s_fp16\`, `models\yolox_s_int8\`.
- Copy `models\meta.example.json` into each folder as `meta.json` and fill in the values from Geti
  (architecture, precision, Geti's validation score). The dashboard labels them
  "reported by Geti".

## 7. Compare and load into BatteryVision

```powershell
cd backend
.\.venv\Scripts\python scripts\check_model.py ..\models\yolox_tiny_fp16\model.xml ..\datasets\battery\test\<image>.jpg
.\.venv\Scripts\python scripts\benchmark.py `
    --coco ..\datasets\battery\test\_annotations.coco.json `
    --images ..\datasets\battery\test `
    --train-images ..\datasets\battery\train
cd ..
Copy-Item datasets\battery\test\*.jpg sample_data\live\ -ErrorAction SilentlyContinue
.\start.ps1
```

Open the **Models** page to compare models, and click **Use on line** (or pick it under **Data source**) to run a model on the virtual line.

If `check_model.py` fails to load the model, the export likely lacks ModelAPI metadata. Note the
error, then check the Geti version's export options for an "OpenVINO / deployment" variant. Do not
hand-write a tensor parser without inspecting the actual outputs (`/api/model/info` lists them).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Model missing from **Data source** | its `model.xml` is missing or failed to load; see **Models → Models found** or `/api/models` |
| All detections ignored | label is listed in `BV_IGNORE_LABELS` |
| Boxes shifted | report it. ModelAPI rescales boxes to the original image; check `check_model.py` output |
| Everything REVIEW | confidences fall between thresholds; tune on the test set and document the choice |
