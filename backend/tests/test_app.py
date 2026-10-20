from __future__ import annotations

import io
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.inference import load_registry
from app.inference.base import clamp_bbox
from app.inference.openvino_provider import normalize_result
from app.main import create_app
from app.policy import DecisionPolicy
from app.schemas import Detection


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    s = Settings()
    s.mode = "auto"
    s.models_dir = tmp_path / "models"  # empty: no model
    s.model_xml = tmp_path / "missing" / "model.xml"  # registered but unloadable
    s.explain_dir = tmp_path / "explain"
    s.benchmark_path = tmp_path / "benchmark.json"
    s.db_path = tmp_path / "test.sqlite3"
    s.live_dir = tmp_path / "live"
    s.upload_dir = tmp_path / "uploads"
    s.tick_seconds = 3600  # background loop never fires during tests
    return s


@pytest.fixture
def client(settings: Settings):
    with TestClient(create_app(settings)) as c:
        yield c


def step(client, n=1):
    for _ in range(n):
        state = client.post("/api/simulation/step").json()
    return state


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_demo_mode_without_model(client):
    status = client.get("/api/status").json()
    assert status["mode"] == "demo"
    assert status["live_available"] is False
    assert "FileNotFoundError" in status["live_error"]


def test_missing_model_does_not_crash(settings):
    [entry] = load_registry(settings)
    assert entry.provider is None and "FileNotFoundError" in entry.error
    assert entry.summary()["loaded"] is False


def test_models_and_benchmark_endpoints_without_data(client):
    models = client.get("/api/models").json()
    assert models["active"] == "demo-script" and models["models"][0]["loaded"] is False
    assert client.get("/api/benchmark").json()["available"] is False


def test_benchmark_endpoint_serves_file(client, settings):
    settings.benchmark_path.write_text('{"generated_at": "x", "models": []}', encoding="utf-8")
    b = client.get("/api/benchmark").json()
    assert b["available"] is True and b["models"] == []


def test_live_mode_refused_without_model(client):
    assert client.post("/api/mode", json={"mode": "live"}).status_code == 409


def test_cell_moves_through_states_in_order(client):
    state = client.post("/api/simulation/reset").json()
    first = state["cells"][0]["cell_id"]
    seen = [state["cells"][0]["state"]]
    for _ in range(4):
        state = step(client)
        cell = next(c for c in state["cells"] if c["cell_id"] == first)
        seen.append(cell["state"])
    assert seen == ["QUEUED", "MOVING_TO_INSPECTION", "INSPECTING", "ROUTING", "PASSED"]
    step(client)  # final cells leave the line on the next tick
    assert first not in [c["cell_id"] for c in client.get("/api/simulation/state").json()["cells"]]


def test_all_three_outcomes_and_counters_match_records(client):
    step(client, 15)  # 12 scripted cells complete
    records = client.get("/api/inspections?limit=500").json()
    metrics = client.get("/api/metrics").json()
    statuses = [r["status"] for r in records]
    assert {"PASS", "REJECT", "REVIEW"} <= set(statuses)
    assert metrics["total"] == len(records) == 12
    assert metrics["passed"] == statuses.count("PASS")
    assert metrics["rejected"] == statuses.count("REJECT")
    assert metrics["review"] == statuses.count("REVIEW")


def test_demo_sequence_is_deterministic(client):
    step(client, 15)
    first = [r["status"] for r in client.get("/api/inspections?limit=500").json()]
    client.post("/api/simulation/reset")
    step(client, 15)
    assert [r["status"] for r in client.get("/api/inspections?limit=500").json()] == first


def test_reset_clears_session(client):
    step(client, 6)
    assert client.get("/api/metrics").json()["total"] > 0
    state = client.post("/api/simulation/reset").json()
    assert client.get("/api/metrics").json()["total"] == 0
    assert client.get("/api/inspections").json() == []
    assert [c["state"] for c in state["cells"]] == ["QUEUED"] * 3
    assert state["running"] is False


def test_demo_results_never_labeled_live(client):
    step(client, 15)
    for r in client.get("/api/inspections?limit=500").json():
        assert r["mode"] == "demo"
        assert r["inference_ms"] is None  # no synthetic latency
        assert r["model_name"] == "demo-script" and r["model_sha"] is None
        assert r["reject_threshold"] == 0.6 and r["review_threshold"] == 0.3
    assert client.get("/api/metrics").json()["avg_inference_ms"] is None


def test_upload_refused_in_demo_mode(client):
    buf = io.BytesIO()
    Image.new("RGB", (32, 32)).save(buf, "PNG")
    r = client.post("/api/inspect", files={"file": ("x.png", buf.getvalue(), "image/png")})
    assert r.status_code == 409


def test_policy_thresholds():
    p = DecisionPolicy(0.6, 0.3)
    d = lambda c, a=True: Detection(label="scratch", confidence=c, bbox=[0, 0, 1, 1], actionable=a)
    assert p.decide([])[0] == "PASS"
    assert p.decide([d(0.2)])[0] == "PASS"
    assert p.decide([d(0.3)])[0] == "REVIEW"
    assert p.decide([d(0.59), d(0.1)])[0] == "REVIEW"
    assert p.decide([d(0.6)])[0] == "REJECT"
    assert p.decide([d(0.99, a=False)])[0] == "PASS"  # ignored label never rejects
    with pytest.raises(ValueError):
        DecisionPolicy(0.3, 0.6)


def test_bbox_normalization():
    assert clamp_bbox(64, 40, 320, 200, 640, 400) == [0.1, 0.1, 0.5, 0.5]
    assert clamp_bbox(320, 200, 64, 40, 640, 400) == [0.1, 0.1, 0.5, 0.5]  # swapped corners
    assert clamp_bbox(-10, -5, 700, 500, 640, 400) == [0.0, 0.0, 1.0, 1.0]  # clipped


def test_normalize_modelapi_result_fixture():
    # Shape of model_api.models.result.DetectionResult (openvino-model-api 0.4.x).
    fake = SimpleNamespace(
        bboxes=np.array([[100, 50, 300, 150], [0, 0, 64, 40]], dtype=np.float32),
        scores=np.array([0.42, 0.97], dtype=np.float32),
        labels=np.array([1, 0]),
        label_names=["crack", "Battery"],
    )
    dets = normalize_result(fake, width=640, height=400, ignore_labels={"battery"})
    assert [d.label for d in dets] == ["Battery", "crack"]  # sorted by confidence
    assert dets[0].actionable is False and dets[1].actionable is True
    assert dets[1].bbox == [0.1562, 0.125, 0.4688, 0.375]


def test_saliency_overlay():
    from app.inference.openvino_provider import saliency_overlay

    assert saliency_overlay(None, 64, 40) is None
    assert saliency_overlay(np.zeros((1, 2, 8, 8)), 64, 40) is None  # flat map: nothing to show
    sal = np.zeros((1, 2, 8, 8), np.uint8)
    sal[0, 1, 2:4, 2:4] = 255
    im = saliency_overlay(sal, 64, 40)
    assert im.size == (64, 40) and im.mode == "RGBA"
    alpha = np.asarray(im)[..., 3]
    assert alpha[20, 20] > alpha[0, 0]  # hot region more opaque than background


def test_rotation_catches_back_side_defect(settings):
    """Cell 3's scratch is only on the 180-degree side: one view passes it, four views reject it."""
    from app.inference import DemoInferenceProvider
    from app.simulation.engine import View, inspect_cell

    demo = DemoInferenceProvider(settings.demo_dir)
    cell = next(c for c in demo.sequence if c["id"] == "cell_03")
    views = [View(settings.demo_dir / v["file"], f"/x/{v['file']}", v["angle"]) for v in cell["views"]]
    policy = DecisionPolicy(0.6, 0.3)

    front_only = inspect_cell(demo, policy, "C1", views[:1], "scratch", "line")
    full = inspect_cell(demo, policy, "C2", views, "scratch", "line")
    assert front_only.status == "PASS"
    assert full.status == "REJECT" and full.primary_view == 2 and len(full.views) == 4
    assert full.image_url == views[2].url and full.views[2].angle == 180
    assert all(d.view == 2 for d in full.detections)
    assert full.inference_ms is None  # demo: nothing measured


def test_demo_cells_have_four_views(client):
    state = client.post("/api/simulation/reset").json()
    assert all(c["n_views"] == 4 for c in state["cells"])
    step(client, 2)
    current = client.get("/api/simulation/state").json()["current"]
    assert len(current["views"]) == 4 and [v["angle"] for v in current["views"]] == [0, 90, 180, 270]


def test_defect_distribution_counts_cells_not_boxes(client):
    step(client, 15)
    records = client.get("/api/inspections?limit=500").json()
    expected: dict[str, int] = {}
    for r in records:
        for label in {d["label"] for d in r["detections"] if d["actionable"]}:
            expected[label] = expected.get(label, 0) + 1
    assert client.get("/api/metrics").json()["defect_distribution"] == expected
