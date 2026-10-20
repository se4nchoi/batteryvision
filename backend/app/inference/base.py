from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from ..schemas import Mode, Prediction


class InferenceProvider(ABC):
    mode: Mode

    @abstractmethod
    def predict(self, image_path: Path) -> Prediction:
        """Run inspection on one image file and return normalized detections."""

    @abstractmethod
    def info(self) -> dict:
        """Describe the provider (model path, labels, ...) for /api/model/info."""


def clamp_bbox(x1: float, y1: float, x2: float, y2: float, width: int, height: int) -> list[float]:
    """Convert a pixel-space [x1, y1, x2, y2] box to normalized 0..1 coordinates."""
    if width <= 0 or height <= 0:
        raise ValueError("Image size must be positive")
    nx1, nx2 = sorted((x1 / width, x2 / width))
    ny1, ny2 = sorted((y1 / height, y2 / height))
    c = lambda v: round(min(max(v, 0.0), 1.0), 4)
    return [c(nx1), c(ny1), c(nx2), c(ny2)]
