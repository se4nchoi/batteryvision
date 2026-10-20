"""End-to-end run of scripts/benchmark.py on stand-in OpenVINO models (no Geti export needed)."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image

from app.config import REPO_ROOT
from app.evaluation import dhash, near_duplicates

pytest.importorskip("openvino")
from tests.test_openvino_fixture import build_ssd_like_ir  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


def make_test_set(root: Path) -> tuple[Path, Path]:
    """COCO test set from the synthetic demo images, boxes from the generator geometry."""
    demo = REPO_ROOT / "sample_data" / "demo"
    scen = json.loads((demo / "scenarios.json").read_text(encoding="utf-8"))["sequence"]
    images_dir = root / "test"
    images_dir.mkdir(parents=True)
    coco = {"images": [], "annotations": [], "categories": [{"id": 1, "name": "scratch"}, {"id": 2, "name": "crack"}]}
    views = {v["file"]: v for c in scen for v in c["views"]}
    picked = ["cell_02_v0.png", "cell_04_v1.png", "cell_03_v2.png", "cell_01_v0.png", "cell_06_v0.png", "cell_09_v0.png"]
    for i, s in enumerate((views[f] for f in picked), start=1):
        shutil.copy(demo / s["file"], images_dir / s["file"])
        coco["images"].append({"id": i, "file_name": s["file"], "width": 640, "height": 400})
        for d in s["detections"]:
            x1, y1, x2, y2 = d["bbox"]
            coco["annotations"].append({"id": len(coco["annotations"]) + 1, "image_id": i,
                                        "category_id": 1 if d["label"] == "scratch" else 2,
                                        "bbox": [x1 * 640, y1 * 400, (x2 - x1) * 640, (y2 - y1) * 400]})
    ann = images_dir / "_annotations.coco.json"
    ann.write_text(json.dumps(coco), encoding="utf-8")
    return ann, images_dir


def test_benchmark_script(tmp_path: Path):
    ann, images = make_test_set(tmp_path)
    models = tmp_path / "models"
    for name in ("yolox_tiny_fp16", "yolox_s_fp32"):
        (models / name).mkdir(parents=True)
        build_ssd_like_ir(models / name / "model.xml")
    (models / "broken").mkdir()
    (models / "broken" / "model.xml").write_text("<not a model/>")
    train = tmp_path / "train"
    train.mkdir()
    shutil.copy(images / "cell_01_v0.png", train / "leaked_copy.png")  # deliberate leak
    out = tmp_path / "results"

    proc = subprocess.run([sys.executable, "scripts/benchmark.py", "--coco", str(ann), "--images", str(images),
                           "--train-images", str(train), "--models-dir", str(models), "--out", str(out)],
                          cwd=BACKEND, capture_output=True, text=True, timeout=300)
    assert proc.returncode == 0, proc.stderr

    report = json.loads((out / "benchmark.json").read_text(encoding="utf-8"))
    by_name = {m["name"]: m for m in report["models"]}
    assert set(by_name) == {"yolox_tiny_fp16", "yolox_s_fp32", "broken"}
    assert "error" in by_name["broken"]
    good = by_name["yolox_s_fp32"]
    assert set(good["robustness"]) == {"clean", "blur", "dark", "bright", "low_contrast", "noise", "jpeg_q20"}
    assert 0.0 <= good["coco"]["map50"] <= 1.0
    assert len(good["threshold_sweep"]) == 19 and good["latency"]["n"] == 5
    assert report["test_set"]["n_images"] == 6 and report["test_set"]["images_without_annotations"] == 3
    assert sum(report["test_set"]["backgrounds"].values()) == 6
    bg = good["by_background"]
    assert sum(g["n_images"] for g in bg.values()) == 6 and all("defect_catch_rate" in g for g in bg.values())
    assert report["leakage"]["count"] >= 1
    assert "cell_01_v0.png" in [d["test"] for d in report["leakage"]["near_duplicates"]]


def test_near_duplicate_detection():
    a = Image.new("RGB", (64, 64))
    for x in range(64):
        for y in range(64):
            a.putpixel((x, y), (x * 4, y * 4, 0))
    b = a.rotate(180)
    assert near_duplicates({"t": dhash(a)}, {"same": dhash(a.copy()), "diff": dhash(b)})[0]["train"] == "same"
    assert near_duplicates({"t": dhash(a)}, {"diff": dhash(b)}) == []


def test_background_group_heuristic():
    from app.evaluation import background_group
    assert background_group(Image.new("RGB", (100, 100), (60, 120, 80))) == "green mat"
    assert background_group(Image.new("RGB", (100, 100), (130, 130, 128))) == "grey / neutral"
    assert background_group(Image.new("RGB", (100, 100), (150, 120, 85))) == "wood / brown"


def test_evaluate_script(tmp_path: Path):
    """scripts/evaluate.py runs end to end and writes a Markdown report."""
    ann, images = make_test_set(tmp_path)
    xml = tmp_path / "m" / "model.xml"
    xml.parent.mkdir()
    build_ssd_like_ir(xml)
    out = tmp_path / "results"
    proc = subprocess.run([sys.executable, "scripts/evaluate.py", "--model", str(xml), "--coco", str(ann),
                           "--images", str(images), "--out", str(out)],
                          cwd=BACKEND, capture_output=True, text=True, timeout=300)
    assert proc.returncode == 0, proc.stderr
    md = next(out.glob("evaluation_*.md")).read_text(encoding="utf-8")
    assert "## 1. Detection quality" in md and "## 5. Failure examples" in md
