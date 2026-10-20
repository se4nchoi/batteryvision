# From inspection to smart-factory insight

BatteryVision's detection core is one building block. This page shows what it already supports and
what a real deployment would add, for three manufacturing-AI areas. "Now" means it runs in this
repository today; "Next" means it needs real line data or equipment.

## 1. Data acquisition

**Now**
- Every inspected cell is a record in SQLite: cell ID, time, decision (Pass / Review / Reject),
  defect type and confidence, inference time, image(s) per side, model name + SHA-256 hash, thresholds,
  and **lot ID + upstream machines** (genealogy).
- The camera path accepts webcam frames and multi-side captures (4 views per cell).

**Next**
- Take lot IDs and genealogy from the plant's MES instead of simulating them (one join on cell ID).
- Store images per cell and side with the decision, so Review cases can be labelled by operators and
  fed back into Geti for retraining on site-specific images (active learning).

## 2. Fault detection (product and process)

**Now**
- **Product faults:** each cell is inspected for scratches and cracks (ATSS model: mAP@50 0.933 on the
  held-out test set, no missed defective cells at the current policy; see `EVALUATION.md`).
- **Process faults: Batches page.** Inspection results are rolled up per lot and per upstream machine:
  - control chart of defect rate per lot (p-chart, ±3σ limits);
  - defect rate per machine for each process step (winding, tab welding, formation), compared with
    the other machines of that step using a one-sided two-proportion test (suspect if p < 0.01, ≥ 24 cells);
  - **confounding check:** a machine that only looks bad because its lots also went through the top
    suspect is shown as "explained by" it, not flagged;
  - worst lots with their defect mix and machines.
- **Demonstration:** inject a simulated fault (e.g. "Winder W2"). Lots through W2 are then fed defective
  photos more often, while every photo is still judged by the real model. Measured with the ATSS model
  in Live mode (237 cells): W2 72% vs W1 31% defect rate, p ≈ 7×10⁻¹⁰, no other machine flagged.

**Limits:** the genealogy and fault are simulated; the statistics are screening tools that point to
*where to look*, not proof of root cause. Small lots (12 cells) make single-lot control limits wide.

**Next**
- Real genealogy from MES; more steps (electrode coating line, slitting, welding parameters).
- Defect-type signatures per machine (e.g. scratches → transport/guide rails; cracks → winding tension).
- Alerts when a machine becomes a suspect during a shift.

## 3. Digital twin

**Now** (a *digital shadow / simulation*, not a synchronized twin)
- The virtual line (2D and 3D) is driven by backend state: queue → camera (4-side rotation) → reject
  station → review station → accept bin, with live counts.
- What-if views: the **On a real line** projection (defect rate → stopped / missed / good cells flagged)
  and the **threshold trade-off** chart; the fault scenarios on the Batches page.

**Next**
- Connect real line signals (PLC tags via OPC UA or MQTT) so the 3D view mirrors the physical line.
- Use the simulator for station design questions before building them: number of camera views,
  thresholds vs. review workload, buffer sizes at the review station.
