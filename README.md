# BatteryVision

AI-assisted **battery cell surface defect inspection**: an object-detection model trained in
**Intel Geti** (YOLOX), served with **OpenVINO** on CPU, driving a simulated inspection line
that routes each cell to **PASS / REVIEW / REJECT**.

The dashboard is a companion demo to the Geti model. It is a *simulated* line, not a
synchronized digital twin, and it controls no physical equipment.

```
Battery enters line → inspection station → model inference → decision policy → routing → logged to SQLite
```

## Two modes

| | DEMO (default, no model needed) | LIVE (Geti-exported model) |
|---|---|---|
| Images | 12 synthetic rendered cells (`sample_data/demo`) | your held-out test images (`sample_data/live`) or uploads |
| Detections | **scripted, illustrative**, labelled DEMO everywhere | real OpenVINO inference via Intel ModelAPI |
| Latency | not shown (nothing measured) | measured wall-clock per image |

The demo sequence is deterministic: the same 12 cells give the same 6 PASS / 4 REJECT /
2 REVIEW every run, including one *missed* defect (cell 11) that shows a PASS is not
proof a cell is defect-free.

## Quick start (Windows, PowerShell 7)

Requirements: Python 3.11+ and Node.js 20+ (tested with Python 3.13, Node 24).

```powershell
.\setup.ps1      # once: venv + pip install + npm install + frontend build
.\start.ps1      # http://localhost:8000
```

`start.ps1 -Mode demo` forces demo mode. The default (`auto`) uses LIVE mode when
`models\model.xml` loads, and otherwise falls back to DEMO.

**Presentation controls:** `Space` start/pause · `→` single step · `R` reset (new session).

### Development mode (hot reload)

```powershell
# terminal 1
cd backend; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# terminal 2
cd frontend; npm run dev        # http://localhost:5173 (proxies /api to :8000)
```

## Switching to real inference

1. Train in Geti and download the OpenVINO model (see [docs/GETI_WORKFLOW.md](docs/GETI_WORKFLOW.md)).
2. Put each model in its own folder: `models\yolox_tiny_fp16\model.xml` + `model.bin` (+ optional `meta.json`, see [models/README.md](models/README.md)).
3. Check the model:
   ```powershell
   cd backend; .\.venv\Scripts\python scripts\check_model.py ..\models\yolox_tiny_fp16\model.xml ..\sample_data\live\<some_test_image>.jpg
   ```
4. Copy a few **held-out test** images into `sample_data\live\`.
5. Restart with `.\start.ps1` and pick the model under **Data source** in the sidebar (Demo is always available).
6. With a model selected, **Add image** (Overview header) sends any image down the line as the next cell.

Every inspection record stores the model name, a SHA-256 of its files, and the thresholds used. The
Camera card shows the model and hash, and the Inspections page lists them per record. If the export includes a saliency (XAI) output,
the panel overlays it as a heatmap; otherwise none is shown.

Configuration (environment variables, set before `.\start.ps1`):

| Variable | Default | Meaning |
|---|---|---|
| `BV_MODE` | `auto` | `auto` / `demo` / `live` |
| `BV_MODELS_DIR` | `models` | folder scanned for `<name>\model.xml` |
| `BV_DEFAULT_MODEL` | *(first found)* | model used for LIVE at startup |
| `BV_MODEL_XML` | *(unset)* | extra model outside `models\`, registered as `custom` |
| `BV_REJECT_THRESHOLD` | `0.60` | detection confidence at or above this → REJECT |
| `BV_REVIEW_THRESHOLD` | `0.30` | confidence in [review, reject) → REVIEW |
| `BV_IGNORE_LABELS` | *(empty)* | comma list of labels shown but never acted on, e.g. `battery` |
| `BV_TICK_SECONDS` | `1.8` | seconds per line step while running |
| `BV_LIVE_DIR` | `sample_data\live` | images fed to the line in LIVE mode |

Example: `$env:BV_REJECT_THRESHOLD = "0.5"; .\start.ps1`

## Model comparison (Models page)

```powershell
cd backend
.\.venv\Scripts\python scripts\benchmark.py `
    --coco ..\datasets\battery\test\_annotations.coco.json `
    --images ..\datasets\battery\test `
    --train-images ..\datasets\battery\train
```

This runs **every model in `models\`** on the same held-out test set and writes `docs/results/benchmark.json`.
The dashboard's **Models** page then shows (pick a model in the list on the left):

- a comparison table (mAP@50, mAP@50:95, precision/recall/F1 at the reject threshold, defect escape and
  false-reject rates, latency mean/p95, size, SHA-256), with the best value in each column starred
- accuracy vs latency, per-class AP, and **robustness** (mAP under blur, dark, bright, low contrast, noise, JPEG)
- for the selected model: a **threshold sweep** (defect recall vs false rejects), the image-level
  outcome table, and the specific failure images to show in the report
- warnings: possible train/test **near-duplicates (leakage)**, no defect-free test images, small test set

A single model can also be evaluated with `scripts\evaluate.py --model ...`, which writes a Markdown report.
See [docs/EVALUATION.md](docs/EVALUATION.md).

## Tests

```powershell
cd backend;  .\.venv\Scripts\python -m pytest -q     # 23 tests: API, simulation, policy, eval, benchmark, OpenVINO fixtures
cd frontend; npm test                                 # bbox → pixel geometry
```

## Architecture

```
backend/app
  main.py                 FastAPI routes, static files, background line loop
  simulation/engine.py    tick-based line; backend owns cell states + decisions
  inference/base.py       InferenceProvider interface + bbox normalization
  inference/demo.py       DemoInferenceProvider (scripted, no model)
  inference/openvino_provider.py  OpenVINOInferenceProvider (ModelAPI), model hash, saliency overlay
  inference/registry.py   discovers models/<name>/model.xml, loads each
  policy.py               PASS / REVIEW / REJECT thresholds
  database/db.py          SQLite (stdlib) inspection log + session metrics
  evaluation.py           COCO mAP (pycocotools), P/R, image-level outcomes, sweep, perturbations, leakage
backend/scripts           generate_samples.py, check_model.py, evaluate.py, benchmark.py
frontend/src              React + TypeScript dashboard (SVG conveyor, no chart library)
models/                   put Geti export here (git-ignored)
docs/                     Geti workflow, evaluation, report outline, presentation script
```

Both providers return the same normalized schema. Boxes are `[x1, y1, x2, y2]` normalized
to 0..1, and `inference_ms` is `null` unless it was actually measured.

```json
{"cell_id": "CELL-0002", "mode": "demo", "status": "REJECT",
 "reason": "scratch 0.91 >= reject threshold 0.60",
 "detections": [{"label": "scratch", "confidence": 0.91, "bbox": [0.33, 0.30, 0.52, 0.41], "actionable": true}],
 "inference_ms": null, "image_url": "/sample-images/demo/cell_02.png", "image_width": 640, "image_height": 400}
```

API: `GET /api/health · /api/status · /api/metrics · /api/inspections · /api/simulation/state · /api/model/info · /api/models · /api/benchmark`,
`POST /api/simulation/{start,pause,step,reset} · /api/mode {mode, model?} · /api/inspect[?enqueue=true]` (multipart image, LIVE only, 10 MB limit).
Interactive docs: http://localhost:8000/docs

## Honesty rules this project follows

- DEMO predictions are scripted and labelled as such on screen and in every record (`mode = demo`).
- No synthetic latency. No accuracy figures appear anywhere unless produced by `evaluate.py`.
- "Observed reject rate" is the share of this session's sample, not factory yield.
- No savings or ROI claims.
