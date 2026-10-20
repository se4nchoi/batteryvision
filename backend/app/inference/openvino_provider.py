"""Real inference on an Intel Geti-exported OpenVINO IR model.

Geti (v3) converts trained models to OpenVINO IR (model.xml + model.bin) and its own
inference engine loads them through Intel's ModelAPI (`openvino-model-api`).
We do the same: ModelAPI reads the model's embedded metadata (model type, labels,
resize/normalization, NMS) so we never guess the output tensor layout here.

ModelAPI's DetectionResult gives `bboxes` as pixel [x1, y1, x2, y2] in the original
image, plus `scores` and `label_names`. Input images are passed as HxWx3 uint8 BGR
(OpenCV convention); ModelAPI applies the model's own channel reversal if required.
"""
from __future__ import annotations

import hashlib
import time
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

from ..schemas import Detection, Prediction
from .base import InferenceProvider, clamp_bbox


def to_bgr(im: Image.Image) -> np.ndarray:
    rgb = np.asarray(im.convert("RGB"))
    return np.ascontiguousarray(rgb[:, :, ::-1])


def fingerprint(model_xml: Path) -> tuple[str, float]:
    """Short SHA-256 over model.xml + model.bin, and total size in MB. Identifies the exact model."""
    h, size = hashlib.sha256(), 0
    for f in (model_xml, model_xml.with_suffix(".bin")):
        with open(f, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
                size += len(chunk)
    return h.hexdigest()[:12], round(size / 1e6, 2)


def saliency_overlay(saliency, width: int, height: int) -> Image.Image | None:
    """Render a ModelAPI saliency map (if the export has an XAI output) as an RGBA heat overlay."""
    if saliency is None:
        return None
    sal = np.asarray(saliency, dtype=np.float32)
    if sal.size == 0 or sal.ndim < 2:
        return None
    while sal.ndim > 2:  # (1, classes, h, w) or (classes, h, w): strongest class response per pixel
        sal = sal.max(axis=0)
    lo, hi = float(sal.min()), float(sal.max())
    if hi - lo < 1e-6:
        return None
    t = (sal - lo) / (hi - lo)
    rgba = np.zeros((*t.shape, 4), np.uint8)
    rgba[..., 0] = (255 * np.clip(1.5 * t, 0, 1)).astype(np.uint8)
    rgba[..., 1] = (255 * np.clip(1.5 * t - 0.5, 0, 1)).astype(np.uint8)
    rgba[..., 2] = (90 * (1 - t)).astype(np.uint8)
    rgba[..., 3] = (170 * t).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA").resize((width, height), Image.BILINEAR)


def normalize_result(result, width: int, height: int, ignore_labels: set[str]) -> list[Detection]:
    """Convert a ModelAPI DetectionResult into normalized Detection objects."""
    bboxes = np.asarray(result.bboxes).reshape(-1, 4)
    scores = np.asarray(result.scores).reshape(-1)
    names = list(result.label_names)
    detections = []
    for box, score, name in zip(bboxes, scores, names):
        label = str(name)
        detections.append(Detection(
            label=label,
            confidence=round(float(min(max(score, 0.0), 1.0)), 4),
            bbox=clamp_bbox(*map(float, box), width=width, height=height),
            actionable=label.lower() not in ignore_labels,
        ))
    detections.sort(key=lambda d: d.confidence, reverse=True)
    return detections


class OpenVINOInferenceProvider(InferenceProvider):
    mode = "live"

    def __init__(self, model_xml: Path, device: str = "CPU", min_confidence: float = 0.3,
                 ignore_labels: list[str] | None = None, name: str | None = None,
                 explain_dir: Path | None = None):
        if not model_xml.is_file():
            raise FileNotFoundError(f"Model not found: {model_xml}")
        if not model_xml.with_suffix(".bin").is_file():
            raise FileNotFoundError(f"Weights not found next to model: {model_xml.with_suffix('.bin')}")
        from model_api.models import Model  # imported lazily: demo mode never needs it

        self.model_xml = model_xml
        self.name = name or model_xml.parent.name
        self.sha, self.size_mb = fingerprint(model_xml)
        self.explain_dir = explain_dir
        self.device = device
        self.ignore_labels = set(ignore_labels or [])
        # Report everything down to the review threshold; the policy decides the rest.
        self.model = Model.create_model(str(model_xml), device=device,
                                        configuration={"confidence_threshold": min_confidence})
        self.labels = list(getattr(self.model, "labels", None) or [])
        self.model_type = type(self.model).__name__

    def predict(self, image_path: Path) -> Prediction:
        with Image.open(image_path) as im:
            return self.predict_image(im)

    def predict_image(self, im: Image.Image) -> Prediction:
        image = to_bgr(im)
        height, width = image.shape[:2]
        start = time.perf_counter()
        result = self.model(image)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        explain_file = None
        if self.explain_dir is not None:
            overlay = saliency_overlay(getattr(result, "saliency_map", None), width, height)
            if overlay is not None:
                self.explain_dir.mkdir(parents=True, exist_ok=True)
                explain_file = f"{uuid.uuid4().hex[:12]}.png"
                overlay.save(self.explain_dir / explain_file)
        return Prediction(
            mode="live",
            detections=normalize_result(result, width, height, self.ignore_labels),
            inference_ms=round(elapsed_ms, 2),
            image_width=width,
            image_height=height,
            model_name=self.name,
            model_sha=self.sha,
            explain_file=explain_file,
        )

    def info(self) -> dict:
        ov_model = self.model.inference_adapter.model
        return {
            "provider": "OpenVINOInferenceProvider",
            "mode": "live",
            "name": self.name,
            "sha256_12": self.sha,
            "size_mb": self.size_mb,
            "model_xml": str(self.model_xml),
            "device": self.device,
            "model_wrapper": self.model_type,
            "labels": self.labels,
            "inputs": [{"name": i.get_any_name(), "shape": str(i.get_partial_shape())} for i in ov_model.inputs],
            "outputs": [{"name": o.get_any_name(), "shape": str(o.get_partial_shape())} for o in ov_model.outputs],
            "note": "Latency is wall-clock time of the ModelAPI call (preprocess + infer + postprocess) on this machine.",
        }
