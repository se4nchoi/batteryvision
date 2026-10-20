"""SQLite persistence for inspection records (stdlib sqlite3, single table)."""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from ..schemas import InspectionResult

SCHEMA = """
CREATE TABLE IF NOT EXISTS inspections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id     TEXT NOT NULL,
    cell_id        TEXT NOT NULL,
    ts             TEXT NOT NULL,
    mode           TEXT NOT NULL CHECK (mode IN ('demo', 'live')),
    source         TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('PASS', 'REJECT', 'REVIEW')),
    reason         TEXT NOT NULL,
    primary_defect TEXT,
    confidence     REAL,
    inference_ms   REAL,
    image_url      TEXT NOT NULL,
    ground_truth   TEXT,
    detections     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspections_session ON inspections(session_id, id);
"""

# Traceability columns, added in place to databases created by earlier versions.
TRACE_COLUMNS = {
    "model_name": "TEXT",
    "model_sha": "TEXT",
    "reject_threshold": "REAL",
    "review_threshold": "REAL",
    "explain_url": "TEXT",
}


class InspectionStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._conn.executescript(SCHEMA)
            have = {r[1] for r in self._conn.execute("PRAGMA table_info(inspections)")}
            for col, typ in TRACE_COLUMNS.items():
                if col not in have:
                    self._conn.execute(f"ALTER TABLE inspections ADD COLUMN {col} {typ}")
            self._conn.commit()

    def add(self, session_id: str, r: InspectionResult) -> dict:
        actionable = [d for d in r.detections if d.actionable]
        top = max(actionable, key=lambda d: d.confidence, default=None)
        row = {
            "session_id": session_id,
            "cell_id": r.cell_id,
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "mode": r.mode,
            "source": r.source,
            "status": r.status,
            "reason": r.reason,
            "primary_defect": top.label if top else None,
            "confidence": top.confidence if top else None,
            "inference_ms": r.inference_ms,
            "image_url": r.image_url,
            "ground_truth": r.ground_truth,
            "detections": json.dumps([d.model_dump() for d in r.detections]),
            **{c: getattr(r, c) for c in TRACE_COLUMNS},
        }
        cols = ", ".join(row)
        with self._lock:
            cur = self._conn.execute(f"INSERT INTO inspections ({cols}) VALUES ({', '.join('?' * len(row))})",
                                     tuple(row.values()))
            self._conn.commit()
        return {"id": cur.lastrowid, **row}

    def list(self, session_id: str, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM inspections WHERE session_id = ? ORDER BY id DESC LIMIT ?", (session_id, limit)
            ).fetchall()
        out = []
        for row in rows:
            d = dict(row)
            d["detections"] = json.loads(d["detections"])
            out.append(d)
        return out

    def metrics(self, session_id: str) -> dict:
        with self._lock:
            counts = dict(self._conn.execute(
                "SELECT status, COUNT(*) FROM inspections WHERE session_id = ? GROUP BY status", (session_id,)
            ).fetchall())
            lat = self._conn.execute(
                "SELECT AVG(inference_ms), COUNT(inference_ms) FROM inspections "
                "WHERE session_id = ? AND mode = 'live' AND inference_ms IS NOT NULL", (session_id,)
            ).fetchone()
            det_rows = self._conn.execute(
                "SELECT detections FROM inspections WHERE session_id = ?", (session_id,)
            ).fetchall()
            history = [r[0] for r in self._conn.execute(
                "SELECT status FROM inspections WHERE session_id = ? ORDER BY id DESC LIMIT 40", (session_id,)
            ).fetchall()][::-1]
        distribution: dict[str, int] = {}
        for (dets,) in det_rows:
            for d in json.loads(dets):
                if d.get("actionable", True):
                    distribution[d["label"]] = distribution.get(d["label"], 0) + 1
        total = sum(counts.values())
        rejected = counts.get("REJECT", 0)
        return {
            "total": total,
            "passed": counts.get("PASS", 0),
            "rejected": rejected,
            "review": counts.get("REVIEW", 0),
            # Observed share of this session's sample, not a factory yield figure.
            "observed_reject_rate": (rejected / total) if total else None,
            "avg_inference_ms": round(lat[0], 2) if lat[0] is not None else None,
            "measured_inferences": lat[1],
            "defect_distribution": distribution,
            "status_history": history,
        }
