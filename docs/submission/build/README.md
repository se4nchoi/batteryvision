# Rebuilding the submission

Outputs: `../BatteryVision_발표.pptx` (10 slides, Korean, speaker notes) and `../BatteryVision_요약.pdf` (2 pages A4).

1. Images (needs the local dataset, `models/` and `docs/results/`):
   `..\..\..\backend\.venv\Scripts\python prep_images.py`
2. Deck: `npm install`, then with `PPTX_SKILL_DIR` set to the pptx skill folder (for `apply_theme.js`) and
   `NODE_PATH` set to this folder's `node_modules`: `node build.js`
3. Summary: print `summary.html` to PDF, e.g.
   `msedge --headless=new --no-pdf-header-footer --print-to-pdf=..\BatteryVision_요약.pdf summary.html`

Numbers come from `docs/results/benchmark.json` (131-image test set, 9 models),
`docs/results/later_session_clean_9models/benchmark.json` (later-session holdout) and `geti_metrics.json`
(values read from Geti's model-metrics PDF exports). `img/meme.png` is a broadcast screenshot supplied by the
author for slide 2.
