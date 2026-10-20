"""Runtime configuration, read from environment variables (prefix BV_).

All values have defaults so the app starts in demo mode with zero setup.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str) -> str:
    return os.environ.get(f"BV_{name}", default)


def _env_list(name: str, default: str) -> list[str]:
    return [s.strip().lower() for s in _env(name, default).split(",") if s.strip()]


@dataclass
class Settings:
    # Startup mode: "demo", "live", or "auto" (live if a model loads, else demo).
    mode: str = field(default_factory=lambda: _env("MODE", "auto").lower())

    # Exported Geti / OpenVINO IR model. The .bin is expected next to the .xml.
    model_xml: Path = field(default_factory=lambda: Path(_env("MODEL_XML", str(REPO_ROOT / "models" / "model.xml"))))
    device: str = field(default_factory=lambda: _env("DEVICE", "CPU"))

    # Decision policy (see app/policy.py and docs/EVALUATION.md).
    reject_threshold: float = field(default_factory=lambda: float(_env("REJECT_THRESHOLD", "0.60")))
    review_threshold: float = field(default_factory=lambda: float(_env("REVIEW_THRESHOLD", "0.30")))
    # Labels that are shown but never drive a decision (e.g. a "battery" object class).
    ignore_labels: list[str] = field(default_factory=lambda: _env_list("IGNORE_LABELS", ""))

    # Image sources for the virtual line.
    demo_dir: Path = field(default_factory=lambda: REPO_ROOT / "sample_data" / "demo")
    live_dir: Path = field(default_factory=lambda: Path(_env("LIVE_DIR", str(REPO_ROOT / "sample_data" / "live"))))
    upload_dir: Path = field(default_factory=lambda: REPO_ROOT / "backend" / "data" / "uploads")

    db_path: Path = field(default_factory=lambda: Path(_env("DB_PATH", str(REPO_ROOT / "backend" / "data" / "batteryvision.sqlite3"))))

    # Seconds between automatic simulation ticks while running.
    tick_seconds: float = field(default_factory=lambda: float(_env("TICK_SECONDS", "1.8")))
    max_upload_bytes: int = 10 * 1024 * 1024


settings = Settings()
