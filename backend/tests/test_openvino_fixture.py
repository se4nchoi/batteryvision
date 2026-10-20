"""Runs the real OpenVINO + ModelAPI path on a tiny synthetic IR model.

The fixture is an SSD-style graph whose output is a constant [1, 1, N, 7] tensor
(image_id, label, conf, x1, y1, x2, y2 normalized), with ModelAPI metadata in rt_info.
It proves the provider loads an IR, runs inference and normalizes boxes. It is NOT a
substitute for testing the real Geti export (see scripts/check_model.py).
"""
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

ov = pytest.importorskip("openvino")
pytest.importorskip("model_api")

from app.inference.openvino_provider import OpenVINOInferenceProvider  # noqa: E402


def build_ssd_like_ir(path: Path) -> None:
    from openvino import opset13 as ops

    image = ops.parameter([1, 3, 64, 64], np.float32, name="image")
    dets = np.array([[[[0, 1, 0.92, 0.10, 0.20, 0.40, 0.60],
                       [0, 2, 0.45, 0.50, 0.50, 0.90, 0.80],
                       [0, 1, 0.05, 0.00, 0.00, 0.10, 0.10]]]], np.float32)
    zero = ops.multiply(ops.reduce_sum(image, [1, 2, 3], keep_dims=False), ops.constant(np.float32(0)))
    out = ops.add(ops.constant(dets), zero)
    out.output(0).get_tensor().set_names({"detection_out"})
    model = ov.Model([out], [image], "ssd_like_fixture")
    model.set_rt_info("SSD", ["model_info", "model_type"])
    model.set_rt_info("background scratch crack", ["model_info", "labels"])
    ov.save_model(model, str(path))


def test_openvino_provider_end_to_end(tmp_path: Path):
    xml = tmp_path / "model.xml"
    build_ssd_like_ir(xml)
    img_path = tmp_path / "cell.png"
    Image.new("RGB", (640, 400), (90, 90, 90)).save(img_path)

    provider = OpenVINOInferenceProvider(xml, "CPU", min_confidence=0.3)
    pred = provider.predict(img_path)

    assert pred.mode == "live" and pred.inference_ms is not None and pred.inference_ms > 0
    assert (pred.image_width, pred.image_height) == (640, 400)
    assert [d.label for d in pred.detections] == ["scratch", "crack"]  # 0.05 filtered out
    top = pred.detections[0]
    assert top.confidence == pytest.approx(0.92, abs=1e-3)
    assert top.bbox == pytest.approx([0.10, 0.20, 0.40, 0.60], abs=0.01)
    info = provider.info()
    assert info["outputs"] and info["inputs"]


def test_live_mode_through_api(tmp_path: Path):
    import io

    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app

    s = Settings()
    s.mode = "auto"
    s.models_dir = tmp_path / "models"
    for name in ("yolox_tiny", "yolox_s"):
        (s.models_dir / name).mkdir(parents=True)
        build_ssd_like_ir(s.models_dir / name / "model.xml")
    (s.models_dir / "yolox_s" / "meta.json").write_text('{"architecture": "YOLOX-S"}', encoding="utf-8")
    s.model_xml = None
    s.explain_dir, s.benchmark_path = tmp_path / "explain", tmp_path / "b.json"
    s.db_path, s.upload_dir, s.live_dir = tmp_path / "db.sqlite3", tmp_path / "up", tmp_path / "live"
    s.live_dir.mkdir()
    Image.new("RGB", (320, 240)).save(s.live_dir / "a.png")
    s.tick_seconds = 3600
    with TestClient(create_app(s)) as c:
        st = c.get("/api/status").json()
        assert st["mode"] == "live" and st["live_models"] == ["yolox_s", "yolox_tiny"]  # auto picks a loaded model
        models = {m["name"]: m for m in c.get("/api/models").json()["models"]}
        assert models["yolox_s"]["meta"] == {"architecture": "YOLOX-S"} and len(models["yolox_s"]["sha256_12"]) == 12
        assert c.post("/api/mode", json={"mode": "live", "model": "yolox_tiny"}).json()["model"] == "yolox_tiny"
        assert c.post("/api/mode", json={"mode": "live", "model": "nope"}).status_code == 404
        for _ in range(4):
            c.post("/api/simulation/step")
        rec = c.get("/api/inspections").json()[0]
        assert rec["mode"] == "live" and rec["status"] == "REJECT" and rec["inference_ms"] > 0
        assert rec["model_name"] == "yolox_tiny" and rec["model_sha"] == models["yolox_tiny"]["sha256_12"]
        assert c.get("/api/metrics").json()["avg_inference_ms"] is not None

        buf = io.BytesIO()
        Image.new("RGB", (100, 80)).save(buf, "JPEG")
        r = c.post("/api/inspect", files={"file": ("t.jpg", buf.getvalue(), "image/jpeg")}).json()
        assert r["mode"] == "live" and r["source"] == "upload" and r["image_width"] == 100
        q = c.post("/api/inspect?enqueue=true", files={"file": ("t.jpg", buf.getvalue(), "image/jpeg")}).json()
        queued = [x for x in c.get("/api/simulation/state").json()["cells"] if x["state"] == "QUEUED"]
        assert queued[0]["cell_id"] == q["cell_id"] and queued[0]["source"] == "upload"

        assert c.post("/api/inspect", files={"file": ("x.txt", b"not an image", "text/plain")}).status_code == 415
        # switching back to demo keeps working
        assert c.post("/api/mode", json={"mode": "demo"}).json()["mode"] == "demo"
