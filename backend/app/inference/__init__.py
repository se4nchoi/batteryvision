from __future__ import annotations

import logging

from ..config import Settings
from .base import InferenceProvider
from .demo import DemoInferenceProvider
from .openvino_provider import OpenVINOInferenceProvider

log = logging.getLogger("batteryvision")


def load_live_provider(settings: Settings) -> tuple[OpenVINOInferenceProvider | None, str | None]:
    """Try to load the exported model. Returns (provider, error). Never raises."""
    try:
        return OpenVINOInferenceProvider(
            settings.model_xml, settings.device, settings.review_threshold, settings.ignore_labels
        ), None
    except Exception as exc:  # missing files, bad IR, missing runtime: stay in demo
        log.warning("Live model unavailable: %s", exc)
        return None, f"{type(exc).__name__}: {exc}"


__all__ = ["InferenceProvider", "DemoInferenceProvider", "OpenVINOInferenceProvider", "load_live_provider"]
