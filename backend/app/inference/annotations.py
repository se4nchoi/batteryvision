"""Replays a COCO dataset split: real photos with their ANNOTATED boxes (ground truth).

This is not a model. Detections are the dataset's labels, given confidence 1.0 so the
decision policy rejects any annotated defect and passes images without annotations.
The UI labels these results as annotations, never as predictions.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from ..schemas import Detection, Prediction
from .base import InferenceProvider, clamp_bbox


class AnnotationReplayProvider(InferenceProvider):
    mode = "demo"

    def __init__(self, split_dir: Path, ignore_labels: list[str] | None = None):
        ann = json.loads((split_dir / "_annotations.coco.json").read_text(encoding="utf-8"))
        self.split_dir = split_dir
        self.split = split_dir.name
        self.name = f"annotations ({self.split})"
        cats = {c["id"]: c["name"] for c in ann["categories"]}
        ignore = set(ignore_labels or [])
        self.images = {i["file_name"]: i for i in ann["images"]}
        self.boxes: dict[str, list[Detection]] = {name: [] for name in self.images}
        by_id = {i["id"]: i for i in ann["images"]}
        for a in ann["annotations"]:
            img = by_id[a["image_id"]]
            x, y, w, h = a["bbox"]
            label = cats[a["category_id"]]
            self.boxes[img["file_name"]].append(Detection(
                label=label, confidence=1.0, bbox=clamp_bbox(x, y, x + w, y + h, img["width"], img["height"]),
                actionable=label.lower() not in ignore))
        # Fixed shuffle so consecutive cells are not near-identical burst shots.
        self.order = sorted(self.images)
        random.Random(7).shuffle(self.order)

    def ground_truth(self, file_name: str) -> str:
        labels = sorted({d.label for d in self.boxes.get(file_name, [])})
        return ", ".join(labels) if labels else "no defect annotated"

    def predict(self, image_path: Path) -> Prediction:
        img = self.images.get(image_path.name)
        if img is None:
            raise KeyError(f"{image_path.name} is not in the {self.split} annotations")
        return Prediction(mode="demo", detections=list(self.boxes[image_path.name]), inference_ms=None,
                          image_width=img["width"], image_height=img["height"], model_name=self.name)

    def info(self) -> dict:
        n_def = sum(1 for b in self.boxes.values() if b)
        return {
            "provider": "AnnotationReplayProvider",
            "mode": "demo",
            "split": self.split,
            "images": len(self.images),
            "images_with_defects": n_def,
            "note": "Dataset photos with their annotated (ground-truth) boxes. Not model predictions.",
        }
