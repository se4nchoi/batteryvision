"""Normalized response schema shared by every inference provider."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["demo", "live"]
Status = Literal["PASS", "REJECT", "REVIEW"]


class Detection(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    # Normalized [x1, y1, x2, y2], each in 0..1, relative to the source image.
    bbox: list[float] = Field(min_length=4, max_length=4)
    # False for labels excluded from decisions via BV_IGNORE_LABELS.
    actionable: bool = True


class Prediction(BaseModel):
    """What a provider returns: detections only. Decisions are made by the policy."""

    mode: Mode
    detections: list[Detection]
    # Measured wall-clock model latency. Always None for demo/replayed predictions.
    inference_ms: float | None
    image_width: int
    image_height: int


class InspectionResult(BaseModel):
    cell_id: str
    mode: Mode
    status: Status
    reason: str
    detections: list[Detection]
    inference_ms: float | None
    image_url: str
    image_width: int
    image_height: int
    # Known label for the image, if any ("clean", "scratch", ...). None = unknown.
    ground_truth: str | None = None
    source: str = "line"  # "line" (virtual conveyor) or "upload"
