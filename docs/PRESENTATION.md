# Presentation script (target 4:00, hard limit 5:00)

**Before you present:** run `.\start.ps1`, open http://localhost:8000 full-screen (F11) at 1080p, and set
**Data source → atss_mbv2_fp16_xai**. Press `R`. Keep one test photo ready for **Add image**.
Fallback if anything fails: **Data source → Demo (synthetic)**; the whole talk still works.

All numbers below are measured (`docs/EVALUATION.md`, `docs/results/`). ✍️ = only you can fill it in.

**Suggested slides:** 1 Problem · 2 Data & approach · 3 Results · 4 What it gets wrong, and why ·
(live demo) · 5 Limits & next steps.

---

### 0:00–0:30: Problem (slide 1)
"Lithium-ion cells with surface damage, such as scratches or cracked casings, are a quality and safety risk,
and visual checks by people are slow and inconsistent at line speed. My goal: a vision model that finds
and *localizes* these defects, and turns every detection into a clear decision: pass, reject, or send
to a person for review."

### 0:30–1:05: Data and approach (slide 2)
"I used a public Roboflow dataset, licensed CC BY 4.0: 1,531 original photos of two defect types, crack
and scratch. The annotations already existed, so instead of labelling a thousand photos I imported them into
Intel Geti and spot-checked them there ✍️. I kept the 153-image test split out of Geti entirely. I trained
two detectors in Geti, ATSS-MobileNetV2 and YOLOX-S, and exported both to OpenVINO for CPU inference."

### 1:05–1:55: Results (slide 3 / Models page → Model performance)
"On the unseen test set, ATSS reaches a **mAP@50 of 0.93**; YOLOX-S reaches 0.90. Per cell, ATSS is
**98% accurate with an F1 of 0.99**: it caught **all 116 defective cells**, and only 3 of 37 good cells
were sent to review. Inference takes about **45 milliseconds** per image on a laptop CPU."
*(point at the confusion matrix)* "And it never confuses a crack with a scratch: every error is a
scratch that was missed or a false scratch."

### 1:55–2:35: What it gets wrong, and why (slide 4)
"Cracks are almost perfect, with an F1 of 0.98. Scratches are the weak class at 0.80: they're thin,
and on wood backgrounds box recall drops to 49%. The likely reason ATSS beats YOLOX is resolution:
Geti trains ATSS at 992 by 800 pixels by default, so small scratches get about 1.5 times more pixels than
YOLOX's 640 by 640. YOLOX, on the other hand, is more robust to blur and noise, and its heatmap points at
the defect 98% of the time, versus 48% for ATSS."

### 2:35–3:30: Live demo (Overview page)
1. "This is a *simulated* inspection line running the real model." Press **Space**. "Each cell is turned
   once under the camera, then sorted: the reject pusher, the review pusher, or on to the accept bin."
2. *(Camera card)* "Here are the model's boxes and confidence, with the dataset's own label next to it,
   and the heatmap from Geti's explainability output. Above 0.6 it's rejected; between 0.3 and 0.6 it goes
   to a person."
3. **Add image**: "An unseen photo. Watch the line react to the prediction."
4. *(Optional, Batches page, 20 s)* "Because every cell is logged with its lot, detections point back to the
   process. I inject a simulated fault in winder W2 and run 240 cells: the page flags W2 at **72%** defects vs
   **31%** on W1, and recognizes that formation rack R2 only looks bad because its lots shared W2. The machine
   assignments are simulated; the detections are real."

### 3:30–4:00: Limits and next steps (slide 5)
"Three honest limits. First, this test set is 75% defective; on a real line with 0.5% defects, ATSS would
miss none, but only about **6 of every 100** stopped cells would really be defective. YOLOX would miss about
3 per 10,000 cells but stop far fewer good ones, so the right choice depends on what a missed defect costs.
Second, the photos come from a few tabletop sessions, and 22 test images were near-copies of training images (removing them moved mAP by under 1 point),
so a factory camera would need re-validation. Third, the dataset has one photo per battery, so the 360°
inspection is shown in simulation only. Next: photos from the real line, thresholds tuned on validation
data, and a higher input size for scratches. Thank you."

---

**Likely questions**
- *Why detection, not classification?* It shows the reviewer where the defect is and handles several defects per cell.
- *Why a review band?* A missed defect costs more than a manual check, so uncertain cases go to people.
- *Is accuracy inflated?* Possibly: test photos share sessions with training (152 of 153), and 22 were near-duplicates; I removed those and mAP@50 changed by under 1 point (0.933 → 0.929). That's why I also report robustness and per-background results.
- *Why did ATSS win?* Most likely input resolution (992×800 vs 640×640, both Geti defaults). Not proven: each model was trained once.
- *Is the dashboard a digital twin?* No. It's a simulated line driven by real model outputs, with no physical synchronization.
- *Are the machine names real?* The process steps are real cell-manufacturing stages; machine IDs and lot assignments are simulated.
