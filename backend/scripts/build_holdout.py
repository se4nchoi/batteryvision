"""Build a test-only holdout from a second Roboflow COCO export, minus anything the models have seen.

    .\\.venv\\Scripts\\python scripts\\build_holdout.py `
        --raw ..\\datasets\\battery_later_raw `
        --seen ..\\datasets\\battery `
        --out ..\\datasets\\battery_later

--raw is the unzipped export ({train,valid,test}/_annotations.coco.json). Writes to --out:
  images/                    one file per original photo (train split: first augmented copy)
  unseen.coco.json           every photo not already in --seen
  unseen_clean.coco.json     the same, valid/test splits only (never augmented)
A photo counts as seen if its original file name (before ".rf.") or its pixels (dHash,
Hamming <= 8) match any image under --seen. Only crack/scratch boxes are kept; the export's
whole-cell "battery" boxes are dropped, so images left with no boxes are defect-free cells.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.evaluation import dhash, near_duplicates  # noqa: E402

KEEP = ["crack", "scratch"]
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}


def original_name(file_name: str) -> str:
    """'IMG_7183_jpg.rf.<hash>.jpg' -> 'IMG_7183'."""
    return re.sub(r"_(jpe?g|png)$", "", re.sub(r"\.rf\..*", "", file_name), flags=re.I)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--seen", type=Path, required=True, help="Dataset the models were trained/validated/tested on")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    seen_files = [p for p in args.seen.rglob("*") if p.suffix.lower() in IMAGE_EXTS]
    seen_names = {original_name(p.name) for p in seen_files}
    seen_hashes = {}
    for p in seen_files:
        with Image.open(p) as im:
            seen_hashes[str(p.relative_to(args.seen))] = dhash(im)

    # one record per original photo, in a fixed order
    picked = []
    for split in ["valid", "test", "train"]:
        d = json.loads((args.raw / split / "_annotations.coco.json").read_text(encoding="utf-8"))
        cname = {c["id"]: c["name"].lower() for c in d["categories"]}
        anns: dict[int, list] = {}
        for a in d["annotations"]:
            anns.setdefault(a["image_id"], []).append(a)
        done = set()
        for img in sorted(d["images"], key=lambda i: i["file_name"]):
            name = original_name(img["file_name"])
            if name in done:
                continue
            done.add(name)
            boxes = [(KEEP.index(cname[a["category_id"]]) + 1, a) for a in anns.get(img["id"], []) if cname[a["category_id"]] in KEEP]
            picked.append((split, img, boxes))

    by_name = [r for r in picked if original_name(r[1]["file_name"]) not in seen_names]
    hashes = {}
    for split, img, _ in by_name:
        with Image.open(args.raw / split / img["file_name"]) as im:
            hashes[img["file_name"]] = dhash(im)
    dups = {d["test"] for d in near_duplicates(hashes, seen_hashes)}
    unseen = [r for r in by_name if r[1]["file_name"] not in dups]

    (args.out / "images").mkdir(parents=True, exist_ok=True)
    cats = [{"id": i + 1, "name": n, "supercategory": "defect"} for i, n in enumerate(KEEP)]
    sets = {"unseen": {"images": [], "annotations": [], "categories": cats},
            "unseen_clean": {"images": [], "annotations": [], "categories": cats}}
    next_ann = 1
    for img_id, (split, img, boxes) in enumerate(unseen, start=1):
        shutil.copy2(args.raw / split / img["file_name"], args.out / "images" / img["file_name"])
        rec = {"id": img_id, "file_name": img["file_name"], "width": img["width"], "height": img["height"],
               "extra": {"source_split": split, "augmented": split == "train"}}
        new_anns = []
        for cat_id, a in boxes:
            new_anns.append({"id": next_ann, "image_id": img_id, "category_id": cat_id,
                             "bbox": a["bbox"], "area": a["area"], "iscrowd": 0})
            next_ann += 1
        for key in (["unseen", "unseen_clean"] if split != "train" else ["unseen"]):
            sets[key]["images"].append(rec)
            sets[key]["annotations"] += new_anns

    print(f"{len(picked)} originals; {len(picked) - len(by_name)} share a file name with --seen, "
          f"{len(dups)} more are pixel duplicates; {len(unseen)} unseen")
    for key, d in sets.items():
        (args.out / f"{key}.coco.json").write_text(json.dumps(d), encoding="utf-8")
        defect = {a["image_id"] for a in d["annotations"]}
        counts = {c["name"]: sum(a["category_id"] == c["id"] for a in d["annotations"]) for c in cats}
        print(f"  {key:<13} {len(d['images'])} images, {len(defect)} with defect {counts}, "
              f"{len(d['images']) - len(defect)} defect-free")


if __name__ == "__main__":
    main()
