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
    s.dataset_dir = tmp_path / "dataset"  # isolated from any real dataset on disk
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


def test_example_benchmark_is_marked(client):
    real = client.get("/api/benchmark").json()
    assert real["available"] is False and not real.get("example")
    ex = client.get("/api/benchmark?example=true").json()
    assert ex["example"] is True and ex["available"] is True
    assert all(m["name"].startswith("example_") for m in ex["models"])


def make_split(root: Path) -> Path:
    """Tiny COCO split: two defective images and one without annotations."""
    import json as _json
    split = root / "test"
    split.mkdir(parents=True)
    images = []
    for i, name in enumerate(["a.jpg", "b.jpg", "c.jpg"], start=1):
        Image.new("RGB", (640, 640), (60, 60, 60)).save(split / name)
        images.append({"id": i, "file_name": name, "width": 640, "height": 640})
    ann = {"images": images,
           "categories": [{"id": 0, "name": "Battery"}, {"id": 1, "name": "crack"}, {"id": 2, "name": "scratch"}],
           "annotations": [{"id": 1, "image_id": 1, "category_id": 2, "bbox": [64, 64, 128, 64]},
                           {"id": 2, "image_id": 2, "category_id": 1, "bbox": [320, 320, 64, 64]}]}
    (split / "_annotations.coco.json").write_text(_json.dumps(ann), encoding="utf-8")
    return split


def test_dataset_replay(settings):
    make_split(settings.dataset_dir)
    with TestClient(create_app(settings)) as c:
        assert c.get("/api/status").json()["replay_splits"] == {"test": 3}
        state = c.post("/api/mode", json={"mode": "replay", "model": "test"}).json()
        assert state["mode"] == "demo" and state["model"] == "annotations (test)"
        for _ in range(6):
            c.post("/api/simulation/step")
        recs = c.get("/api/inspections?limit=50").json()
        assert len(recs) == 3
        by_gt = {r["ground_truth"]: r for r in recs}
        assert by_gt["no defect annotated"]["status"] == "PASS"
        assert by_gt["scratch"]["status"] == "REJECT" and by_gt["crack"]["status"] == "REJECT"
        assert all(r["inference_ms"] is None and r["model_name"] == "annotations (test)" for r in recs)
        assert by_gt["scratch"]["detections"][0]["bbox"] == [0.1, 0.1, 0.3, 0.2]
        img = c.get(recs[0]["image_url"])
        assert img.status_code == 200
        assert c.post("/api/mode", json={"mode": "replay", "model": "nope"}).status_code == 404


def test_lots_and_genealogy_on_records(client):
    step(client, 15)
    recs = client.get("/api/inspections?limit=500").json()
    assert all(r["lot_id"].startswith("LOT-") and set(r["genealogy"]) == {"Winding", "Tab welding", "Formation"} for r in recs)
    assert {r["lot_id"] for r in recs} == {"LOT-001"}  # 12 cells per lot
    b = client.get("/api/batches").json()
    assert b["cells"] == 12 and b["lots"][0]["cells"] == 12 and b["lots"][0]["complete"]
    assert b["fault"] is None and b["fault_supported"] is True


def test_fault_scenario_is_found_by_batch_analytics(client):
    r = client.post("/api/simulation/fault", json={"step": "Winding", "machine": "W2"})
    assert r.status_code == 200 and r.json()["fault"] == {"step": "Winding", "machine": "W2"}
    client.post("/api/simulation/run", json={"cells": 400})
    b = client.get("/api/batches").json()
    assert b["cells"] >= 390
    winding = {m["machine"]: m for m in b["steps"]["Winding"]}
    assert winding["W2"]["rate"] > winding["W1"]["rate"] + 0.2
    assert b["suspects"][0]["step"] == "Winding" and b["suspects"][0]["machine"] == "W2"
    # machines that only look bad because their lots also went through W2 are explained, not flagged
    assert all(s["step"] == "Winding" for s in b["suspects"])
    explained = [m for ms in b["steps"].values() for m in ms if m.get("explained_by")]
    assert all(m["explained_by"] == "Winding W2" and not m["suspect"] for m in explained)
    # clearing the fault starts a fresh session with no data
    b2 = client.post("/api/simulation/fault", json={}).json()
    assert b2["fault"] is None and client.get("/api/batches").json()["cells"] == 0


def test_fault_validation(client):
    assert client.post("/api/simulation/fault", json={"step": "Winding", "machine": "W9"}).status_code == 409
    assert client.post("/api/simulation/run", json={"cells": 0}).status_code == 422


def test_batch_report_statistics():
    from app.analytics import batch_report
    rows = []
    for i in range(96):
        lot = f"LOT-{i // 12 + 1:03d}"
        machine = "W2" if (i // 12) % 2 else "W1"
        bad = (i % 4 == 0) if machine == "W1" else (i % 4 != 3)
        rows.append({"lot_id": lot, "genealogy": {"Winding": machine}, "status": "REJECT" if bad else "PASS", "defect": "scratch" if bad else None})
    r = batch_report(rows, 12)
    assert r["cells"] == 96 and len(r["lots"]) == 8
    w = {m["machine"]: m for m in r["steps"]["Winding"]}
    assert w["W1"]["rate"] == 0.25 and w["W2"]["rate"] == 0.75
    assert w["W2"]["suspect"] and not w["W1"]["suspect"]
    assert all(l["ucl"] is not None for l in r["lots"])
