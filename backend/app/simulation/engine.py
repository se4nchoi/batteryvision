"""Deterministic, tick-based virtual inspection line.

Each tick moves every cell one stage forward:

    QUEUED -> MOVING_TO_INSPECTION -> INSPECTING -> ROUTING -> PASSED | REJECTED | REVIEW

Inference runs when a cell enters INSPECTING; the decision is recorded in SQLite
when the cell reaches its destination bin. The frontend only renders this state.
No conveyor physics are simulated and no physical equipment is controlled.

Batch traceability (simulated): line cells are grouped into lots of LOT_SIZE, and each lot is
assigned upstream machines (PROCESS). With a fault scenario active, lots that went through the
faulty machine draw defective photos more often. Detection is still done by the provider on the
real image; only the photo-to-lot assignment is simulated.
"""
from __future__ import annotations

import random
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path

from ..database.db import InspectionStore
from ..inference import InferenceProvider
from ..inference.annotations import AnnotationReplayProvider
from ..inference.demo import DemoInferenceProvider
from ..policy import DecisionPolicy
from ..schemas import InspectionResult, ViewResult

QUEUE_LEN = 3
LOT_SIZE = 12
# Upstream process steps and the machines that can run each one (simulated genealogy).
PROCESS: dict[str, list[str]] = {
    "Winding": ["W1", "W2"],
    "Tab welding": ["L1", "L2"],
    "Formation": ["R1", "R2", "R3"],
}
FAULT_DEFECT_SHARE = 0.75   # share of defective photos drawn for lots through the faulty machine
BASE_DEFECT_SHARE = 0.25    # share for all other lots while a fault scenario is active


def lot_plan(lot_no: int) -> dict[str, str]:
    """Machines a lot went through. Deterministic per lot number."""
    rng = random.Random(lot_no * 7919)
    return {step: rng.choice(machines) for step, machines in PROCESS.items()}


def is_defective(ground_truth: str | None) -> bool:
    return bool(ground_truth) and ground_truth.lower() not in ("clean", "no defect annotated")
FINAL_STATE = {"PASS": "PASSED", "REJECT": "REJECTED", "REVIEW": "REVIEW"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}


@dataclass
class View:
    path: Path
    url: str
    angle: int | None = None


@dataclass
class Cell:
    cell_id: str
    views: list[View]
    ground_truth: str | None
    source: str = "line"
    state: str = "QUEUED"
    result: InspectionResult | None = None
    lot_id: str | None = None
    genealogy: dict[str, str] | None = None

    def to_dict(self) -> dict:
        return {
            "cell_id": self.cell_id,
            "lot_id": self.lot_id,
            "state": self.state,
            "image_url": self.views[0].url,
            "n_views": len(self.views),
            "source": self.source,
            "status": self.result.status if self.result else None,
        }


def inspect_cell(provider: InferenceProvider, policy: DecisionPolicy, cell_id: str, views: list[View],
                 ground_truth: str | None, source: str) -> InspectionResult:
    """Run the model on every view of the cell; the decision uses the strongest finding across views."""
    detections, view_results, preds = [], [], []
    for i, v in enumerate(views):
        pred = provider.predict(v.path)
        preds.append(pred)
        detections += [d.model_copy(update={"view": i}) for d in pred.detections]
        view_results.append(ViewResult(image_url=v.url, image_width=pred.image_width, image_height=pred.image_height,
                                       angle=v.angle, inference_ms=pred.inference_ms))
    status, reason = policy.decide(detections)
    top = max((d for d in detections if d.actionable), key=lambda d: d.confidence, default=None)
    primary = top.view if top else 0
    if top is not None and len(views) > 1:
        reason += f" (view {primary + 1}/{len(views)})"
    times = [p.inference_ms for p in preds]
    pv, pp = view_results[primary], preds[primary]
    return InspectionResult(
        cell_id=cell_id, mode=pp.mode, status=status, reason=reason, detections=detections,
        # Total model time for the cell, only if every view was actually measured.
        inference_ms=round(sum(times), 2) if all(t is not None for t in times) else None,
        image_url=pv.image_url, image_width=pv.image_width, image_height=pv.image_height,
        ground_truth=ground_truth, source=source, model_name=pp.model_name, model_sha=pp.model_sha,
        reject_threshold=policy.reject_threshold, review_threshold=policy.review_threshold,
        explain_url=f"/explain/{pp.explain_file}" if pp.explain_file else None,
        views=view_results, primary_view=primary,
    )


class LineSimulation:
    def __init__(self, provider: InferenceProvider, policy: DecisionPolicy, store: InspectionStore,
                 live_dir: Path, tick_seconds: float):
        self.policy = policy
        self.store = store
        self.live_dir = live_dir
        self.tick_seconds = tick_seconds
        # Optional annotations for live images (when the live folder is an annotated dataset split):
        # file order to use and ground-truth label per file name.
        self.live_order: list[str] | None = None
        self.live_truth: dict[str, str] = {}
        self.fault: tuple[str, str] | None = None  # (process step, machine) injected as faulty
        self._lock = threading.RLock()
        self.set_provider(provider)

    # ---- lifecycle -------------------------------------------------------
    def set_provider(self, provider: InferenceProvider) -> None:
        with self._lock:
            self.provider = provider
            self.reset()

    def reset(self) -> None:
        with self._lock:
            self.session_id = uuid.uuid4().hex[:12]
            self.running = False
            self.tick_count = 0
            self.seq = 0
            self.line_count = 0
            self.source_index = 0
            self.pool_index = {True: 0, False: 0}
            self.cells: list[Cell] = []
            self.last_result: InspectionResult | None = None
            self.sources = self._load_sources()
            self.message = None if self.sources else f"No images found in {self.live_dir}. Add held-out test images or upload one."
            self._fill_queue()

    def start(self) -> None:
        with self._lock:
            self.running = True

    def pause(self) -> None:
        with self._lock:
            self.running = False

    # ---- sources ---------------------------------------------------------
    def _load_sources(self) -> list[tuple[list[View], str | None]]:
        """(views, ground_truth) per cell, in a fixed, repeatable order.

        Demo cells have 4 rendered views (0/90/180/270 degrees). Live-mode dataset images
        are single photos, so each becomes a one-view cell; no extra sides are invented.
        """
        if isinstance(self.provider, DemoInferenceProvider):
            d = self.provider.demo_dir
            return [([View(d / v["file"], f"/sample-images/demo/{v['file']}", v.get("angle")) for v in c["views"]],
                     c.get("ground_truth")) for c in self.provider.sequence]
        if isinstance(self.provider, AnnotationReplayProvider):
            p = self.provider
            return [([View(p.split_dir / f, f"/dataset/{p.split}/{f}")], p.ground_truth(f)) for f in p.order]
        if not self.live_dir.is_dir():
            return []
        files = sorted(p for p in self.live_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS)
        if self.live_order:
            rank = {n: i for i, n in enumerate(self.live_order)}
            files.sort(key=lambda p: rank.get(p.name, len(rank)))
        return [([View(p, f"/sample-images/live/{p.name}")], self.live_truth.get(p.name)) for p in files]

    def _new_cell(self, views: list[View], ground_truth: str | None, source: str) -> Cell:
        self.seq += 1
        cell = Cell(f"CELL-{self.seq:04d}", views, ground_truth, source)
        if source == "line":
            lot_no = self.line_count // LOT_SIZE + 1
            self.line_count += 1
            cell.lot_id, cell.genealogy = f"LOT-{lot_no:03d}", lot_plan(lot_no)
        return cell

    def fault_supported(self) -> bool:
        """Fault scenarios need known labels to choose defective vs good photos."""
        labels = [is_defective(gt) for _, gt in self.sources]
        return any(labels) and not all(labels) and all(gt is not None for _, gt in self.sources)

    def set_fault(self, fault: tuple[str, str] | None) -> None:
        if fault is not None:
            step, machine = fault
            if machine not in PROCESS.get(step, []):
                raise ValueError(f"Unknown machine {machine!r} for step {step!r}")
            if not self.fault_supported():
                raise ValueError("This data source has no ground-truth labels to simulate a fault with")
        with self._lock:
            self.fault = fault
            self.reset()

    def _next_source(self) -> tuple[list[View], str | None]:
        if self.fault is None:
            src = self.sources[self.source_index % len(self.sources)]
            self.source_index += 1
            return src
        # Fault scenario: lots through the faulty machine draw defective photos more often.
        lot_no = self.line_count // LOT_SIZE + 1
        step, machine = self.fault
        share = FAULT_DEFECT_SHARE if lot_plan(lot_no)[step] == machine else BASE_DEFECT_SHARE
        want_defective = random.Random(self.line_count * 104729 + 17).random() < share
        pool = [s for s in self.sources if is_defective(s[1]) == want_defective]
        src = pool[self.pool_index[want_defective] % len(pool)]
        self.pool_index[want_defective] += 1
        return src

    def _fill_queue(self) -> None:
        while self.sources and sum(c.state == "QUEUED" for c in self.cells) < QUEUE_LEN:
            views, gt = self._next_source()
            self.cells.append(self._new_cell(views, gt, "line"))

    def enqueue_upload(self, views: list[View]) -> Cell:
        """Put an uploaded cell (one or more views) at the front of the queue so it is inspected next."""
        with self._lock:
            cell = self._new_cell(views, None, "upload")
            first_queued = next((i for i, c in enumerate(self.cells) if c.state == "QUEUED"), len(self.cells))
            self.cells.insert(first_queued, cell)
            return cell

    def next_cell_id(self) -> str:
        with self._lock:
            self.seq += 1
            return f"CELL-{self.seq:04d}"

    # ---- stepping --------------------------------------------------------
    def _inspect(self, cell: Cell) -> InspectionResult:
        result = self._run_inspection(cell)
        result.lot_id, result.genealogy = cell.lot_id, cell.genealogy
        return result

    def _run_inspection(self, cell: Cell) -> InspectionResult:
        try:
            return inspect_cell(self.provider, self.policy, cell.cell_id, cell.views, cell.ground_truth, cell.source)
        except Exception as exc:
            # Fail safe: an inference failure never passes a cell; route to manual review.
            return InspectionResult(
                cell_id=cell.cell_id, mode=self.provider.mode, status="REVIEW",
                reason=f"Inference error: {exc}", detections=[], inference_ms=None,
                image_url=cell.views[0].url, image_width=1, image_height=1,
                ground_truth=cell.ground_truth, source=cell.source,
                model_name=getattr(self.provider, "name", None), model_sha=getattr(self.provider, "sha", None),
                reject_threshold=self.policy.reject_threshold, review_threshold=self.policy.review_threshold,
            )

    def tick(self) -> None:
        with self._lock:
            self.tick_count += 1
            # Cells that reached a bin last tick leave the line.
            self.cells = [c for c in self.cells if c.state not in FINAL_STATE.values()]
            for cell in self.cells:
                if cell.state == "ROUTING":
                    cell.state = FINAL_STATE[cell.result.status]
                    self.store.add(self.session_id, cell.result)
                elif cell.state == "INSPECTING":
                    cell.state = "ROUTING"
                elif cell.state == "MOVING_TO_INSPECTION":
                    cell.state = "INSPECTING"
                    cell.result = self._inspect(cell)
                    self.last_result = cell.result
            head = next((c for c in self.cells if c.state == "QUEUED"), None)
            if head is not None:
                head.state = "MOVING_TO_INSPECTION"
            self._fill_queue()

    def run(self, n_cells: int) -> None:
        """Fast-forward: inspect about n_cells more cells immediately (no animation)."""
        with self._lock:
            for _ in range(n_cells):
                self.tick()

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "session_id": self.session_id,
                "mode": self.provider.mode,
                "model": getattr(self.provider, "name", None),
                "running": self.running,
                "tick": self.tick_count,
                "tick_seconds": self.tick_seconds,
                "cells": [c.to_dict() for c in self.cells],
                "current": self.last_result.model_dump() if self.last_result else None,
                "message": self.message,
                "fault": {"step": self.fault[0], "machine": self.fault[1]} if self.fault else None,
                "lot_size": LOT_SIZE,
            }
