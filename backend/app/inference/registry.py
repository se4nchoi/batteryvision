"""Discovers exported models and loads each one as a live provider.

Layout (each model in its own folder, as downloaded from Geti):

    models/
      yolox_tiny_fp16/model.xml, model.bin, meta.json (optional)
      yolox_s_fp32/model.xml, model.bin
      model.xml, model.bin          <- single-model layout, registered as "default"

meta.json holds facts you copy from Geti (architecture, precision, Geti validation score,
training time). They are displayed as "reported by Geti", never as measured here.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Settings
from .openvino_provider import OpenVINOInferenceProvider

log = logging.getLogger("batteryvision")


@dataclass
class ModelEntry:
    name: str
    xml: Path
    meta: dict = field(default_factory=dict)
    provider: OpenVINOInferenceProvider | None = None
    error: str | None = None

    def summary(self) -> dict:
        p = self.provider
        return {
            "name": self.name,
            "path": str(self.xml),
            "loaded": p is not None,
            "error": self.error,
            "sha256_12": p.sha if p else None,
            "size_mb": p.size_mb if p else None,
            "labels": p.labels if p else [],
            "wrapper": p.model_type if p else None,
            "meta": self.meta,
        }


def discover(settings: Settings) -> list[tuple[str, Path]]:
    found: list[tuple[str, Path]] = []
    d = settings.models_dir
    if d.is_dir():
        if (d / "model.xml").is_file():
            found.append(("default", d / "model.xml"))
        for sub in sorted(p for p in d.iterdir() if p.is_dir()):
            xml = sub / "model.xml"
            if not xml.is_file():
                xml = next(iter(sorted(sub.glob("*.xml"))), None)
            if xml is not None:
                found.append((sub.name, xml))
    if settings.model_xml is not None:
        found.append(("custom", settings.model_xml))
    return found


def load_registry(settings: Settings) -> list[ModelEntry]:
    """Load every discovered model. Failures are recorded per model; never raises."""
    entries = []
    for name, xml in discover(settings):
        meta_file = xml.parent / "meta.json"
        meta = {}
        if meta_file.is_file():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except ValueError as exc:
                meta = {"_error": f"meta.json unreadable: {exc}"}
        entry = ModelEntry(name, xml, meta)
        try:
            entry.provider = OpenVINOInferenceProvider(
                xml, settings.device, settings.review_threshold, settings.ignore_labels,
                name=name, explain_dir=settings.explain_dir, input_order=settings.input_order)
        except Exception as exc:
            entry.error = f"{type(exc).__name__}: {exc}"
            log.warning("Model %s failed to load: %s", name, entry.error)
        entries.append(entry)
    return entries
