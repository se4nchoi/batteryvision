"""Validates the evaluation pipeline on a hand-built fixture (no model involved)."""
from app.evaluation import coco_map, image_level_outcomes, pr_at_threshold, to_coco_detections
from app.policy import DecisionPolicy
from app.schemas import Detection

COCO = {
    "images": [{"id": i, "file_name": f"{i}.jpg", "width": 100, "height": 100} for i in (1, 2, 3)],
    "categories": [{"id": 0, "name": "battery-defects"}, {"id": 1, "name": "scratch"}, {"id": 2, "name": "crack"}],
    "annotations": [
        {"id": 1, "image_id": 1, "category_id": 1, "bbox": [10, 10, 30, 20]},
        {"id": 2, "image_id": 2, "category_id": 2, "bbox": [50, 50, 20, 40]},
        # image 3 has no annotations
    ],
}
CATS = {"scratch": 1, "crack": 2}


def det(label, conf, x1, y1, x2, y2):
    return Detection(label=label, confidence=conf, bbox=[x1, y1, x2, y2])


def build(preds):
    out = []
    for img in COCO["images"]:
        out += to_coco_detections(img, preds.get(img["id"], []), CATS)[0]
    return out


def test_perfect_predictions_give_map_1():
    preds = {1: [det("scratch", 0.9, 0.1, 0.1, 0.4, 0.3)], 2: [det("crack", 0.8, 0.5, 0.5, 0.7, 0.9)]}
    m = coco_map(COCO, build(preds))
    assert abs(m["map50"] - 1.0) < 1e-6 and abs(m["map50_95"] - 1.0) < 1e-6
    assert set(m["per_class"]) == {"scratch", "crack"}  # empty supercategory dropped


def test_pr_counts_and_wrong_class():
    preds = {1: [det("crack", 0.9, 0.1, 0.1, 0.4, 0.3)],  # right place, wrong class -> FP crack, FN scratch
             2: [det("crack", 0.8, 0.5, 0.5, 0.7, 0.9)],
             3: [det("scratch", 0.7, 0, 0, 0.2, 0.2)]}  # FP on clean image
    pr = pr_at_threshold(COCO, build(preds), threshold=0.6)
    assert pr["per_class"]["crack"] == {**pr["per_class"]["crack"], "tp": 1, "fp": 1, "fn": 0}
    assert pr["per_class"]["scratch"]["tp"] == 0 and pr["per_class"]["scratch"]["fn"] == 1
    assert pr["overall"]["precision"] == 1 / 3


def test_image_level_matrix():
    preds = {1: [det("scratch", 0.45, 0.1, 0.1, 0.4, 0.3)],  # review
             2: [],                                          # escape
             3: [det("crack", 0.9, 0, 0, 0.2, 0.2)]}          # false reject
    ops = image_level_outcomes(COCO, preds, DecisionPolicy(0.6, 0.3), set())
    assert ops["matrix"]["defective"] == {"PASS": 1, "REVIEW": 1, "REJECT": 0}
    assert ops["matrix"]["no_defect_annotated"] == {"PASS": 0, "REVIEW": 0, "REJECT": 1}
    assert ops["defect_escape_rate"] == 0.5 and ops["false_reject_rate"] == 1.0
