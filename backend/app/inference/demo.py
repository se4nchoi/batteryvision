"""Replays scripted detections for bundled synthetic images. No model is run."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from ..schemas import Detection, Prediction
from .base import InferenceProvider


class DemoInferenceProvider(InferenceProvider):
    mode = "demo"
    name = "demo-script"

    def __init__(self, demo_dir: Path, ignore_labels: list[str] | None = None):
        self.demo_dir = demo_dir
        self.ignore_labels = set(ignore_labels or [])
        manifest = json.loads((demo_dir / "scenarios.json").read_text(encoding="utf-8"))
        self.sequence: list[dict] = manifest["sequence"]
        self.by_file = {s["file"]: s for s in self.sequence}

    def predict(self, image_path: Path) -> Prediction:
        scenario = self.by_file.get(image_path.name)
        if scenario is None:
            raise KeyError(f"No scripted demo result for {image_path.name}; upload inference needs live mode")
        with Image.open(image_path) as im:
            width, height = im.size
        detections = [
            Detection(**d, actionable=d["label"].lower() not in self.ignore_labels)
            for d in scenario["detections"]
        ]
        # inference_ms stays None: nothing was measured.
        return Prediction(mode="demo", detections=detections, inference_ms=None,
                          image_width=width, image_height=height, model_name="demo-script")

    def ground_truth(self, image_path: Path) -> str | None:
        s = self.by_file.get(image_path.name)
        return s.get("ground_truth") if s else None

    def info(self) -> dict:
        return {
            "provider": "DemoInferenceProvider",
            "mode": "demo",
            "note": "Scripted, illustrative detections on synthetic images. Not model output.",
            "scenarios": len(self.sequence),
        }
