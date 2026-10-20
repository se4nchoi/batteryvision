# Presentation script (target 4:00, hard limit 5:00)

**Before you present:** `.\start.ps1`, open http://localhost:8000 full-screen (F11) at 1080p, press `R`.
If the model is ready, select it under **Data source** and have one held-out test image ready for **Add image**.
Fallback if anything fails: switch to **Demo**; the whole talk still works.

Bracketed numbers ✍️ must come from your actual results. If you have no result yet, drop the sentence. Don't guess.

---

### 0:00–0:35: Problem (slide 1)
"Battery cells with surface damage, like scratches or cracked casings, are a quality and safety
risk. Visual inspection by people is slow and inconsistent at line speed. My goal: a vision model
that finds and *localizes* these defects, and turns each detection into a clear decision:
pass, reject, or send to a human for review."

### 0:35–1:20: Data and model (slide 2)
"I used a public, pre-annotated battery defect dataset from Roboflow: [N ✍️] images with classes
[✍️], licensed [✍️]. Instead of hand-labelling a thousand images, I imported the COCO annotations
into Intel Geti and spot-checked them there. I kept the test split out of Geti entirely, so it
stays unseen. Then I trained YOLOX-[Tiny/S ✍️], an anchor-free one-stage detector, and exported it
to OpenVINO for CPU inference."

### 1:20–2:10: Results (dashboard **Models** tab)
"I trained [YOLOX-Tiny and YOLOX-S ✍️] and evaluated both on the same held-out test set. [Best
model ✍️] reaches mAP@50 of [✍️] at [✍️] ms per image. [Other model ✍️] is [✍️ faster / more
accurate], so the trade-off is [✍️]." *(point at the accuracy-vs-latency chart)*
"A public dataset can look easy, so I tested where it breaks. With blur or darker lighting, mAP drops
to [✍️] (*robustness chart*). [✍️ leakage result: 'the leakage check found no near-duplicates' /
'N test images were near-copies of training images']. And this curve (*threshold sweep*) is why I
reject at 0.6: lower would catch [✍️] more defects but reject [✍️] more good cells."
One honest caveat: [if applicable ✍️] the dataset has few defect-free images, so it can't fully
validate the 'pass' decisions.

### 2:10–3:40: Live demo (dashboard)
1. "This is BatteryVision, a *simulated* inspection line. The backend owns every cell's state;
   the screen only renders it." Press **Space**.
2. "Each cell goes from the queue to the camera, where the real model runs" (point at the
   inspection panel) "and here are its boxes and confidences, with measured latency."
3. "Above 0.6 confidence it's rejected. Between 0.3 and 0.6 it goes to manual review, because
   uncertain cases shouldn't be decided by the model alone. Every decision is logged with this
   model name and hash shown on the camera card, matching the Models page."
4. **Add image**: "Here's an unseen test image. Watch the line react to the model's prediction."
   Wait for it to reach the camera and the bin.
   *(Demo-mode variant: "These are scripted examples, clearly labelled DEMO, to show each path:
   pass, reject, review, and cell 11, a missed defect, which is why a pass isn't proof of a clean cell.")*

### 3:40–4:10: Limitations and close (slide 4)
"Limitations: public images aren't my target line's camera, so this would need re-validation on
site, and thresholds should be tuned with real data. Next steps: collect clean samples, compare
YOLOX-S vs Tiny, and connect a real camera trigger. Thank you."

---

**Likely questions**
- *Why detection, not classification?* It localizes the defect for the reviewer and handles multiple defects per cell.
- *Why a REVIEW band?* Errors cost differently: an escaped defect is worse than a manual check, so uncertain cases go to people.
- *Is the dashboard a digital twin?* No. It is a simulated line driven by real model outputs, with no physical synchronization.
