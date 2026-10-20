"""PASS / REJECT / REVIEW decision policy.

Assumptions (documented in docs/EVALUATION.md):
- Any actionable detection with confidence >= reject_threshold  -> REJECT.
- Otherwise, any actionable detection >= review_threshold        -> REVIEW (human check).
- Otherwise                                                       -> PASS.
- PASS means "no actionable defect detected at the configured thresholds".
  It is NOT proof that the cell is defect-free.
- Thresholds are placeholders until tuned on a held-out set of real images.
"""
from __future__ import annotations

from dataclasses import dataclass

from .schemas import Detection, Status


@dataclass(frozen=True)
class DecisionPolicy:
    reject_threshold: float = 0.60
    review_threshold: float = 0.30

    def __post_init__(self) -> None:
        if not 0.0 <= self.review_threshold <= self.reject_threshold <= 1.0:
            raise ValueError("Require 0 <= review_threshold <= reject_threshold <= 1")

    def decide(self, detections: list[Detection]) -> tuple[Status, str]:
        actionable = [d for d in detections if d.actionable]
        top = max(actionable, key=lambda d: d.confidence, default=None)
        if top is None:
            return "PASS", "No actionable detections"
        if top.confidence >= self.reject_threshold:
            return "REJECT", f"{top.label} {top.confidence:.2f} >= reject threshold {self.reject_threshold:.2f}"
        if top.confidence >= self.review_threshold:
            return "REVIEW", f"{top.label} {top.confidence:.2f} in review band [{self.review_threshold:.2f}, {self.reject_threshold:.2f})"
        return "PASS", f"Top detection {top.label} {top.confidence:.2f} below review threshold"
