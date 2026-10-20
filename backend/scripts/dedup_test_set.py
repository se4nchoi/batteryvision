"""Move test images that look like copies of training images out of the test split.

    .\\.venv\\Scripts\\python scripts\\dedup_test_set.py --dataset ..\\datasets\\battery

Uses the same check as benchmark.py (dHash 256-bit, Hamming <= 8 against <dataset>/train).
Nothing is deleted:
  test/_annotations.full.coco.json   the original test annotations (written once, never overwritten)
  test/_annotations.coco.json        rewritten without the near-duplicates
  test_near_duplicates/              the moved images and their annotations (with the matching train file names)
Running it again re-checks the remaining test images; it does nothing if none match.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.evaluation import dhash, near_duplicates  # noqa: E402

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp"}


def hashes(folder: Path, names: list[str] | None = None) -> dict[str, int]:
    paths = [folder / n for n in names] if names is not None else \
        [p for p in sorted(folder.iterdir()) if p.suffix.lower() in IMAGE_EXTS]
    out = {}
    for p in paths:
        with Image.open(p) as im:
            out[p.name] = dhash(im)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, required=True, help="Folder with train/ and test/")
    ap.add_argument("--max-distance", type=int, default=8)
    args = ap.parse_args()

    test_dir, train_dir = args.dataset / "test", args.dataset / "train"
    out_dir = args.dataset / "test_near_duplicates"
    ann_path, backup = test_dir / "_annotations.coco.json", test_dir / "_annotations.full.coco.json"
    coco = json.loads(ann_path.read_text(encoding="utf-8"))

    dups = near_duplicates(hashes(test_dir, [im["file_name"] for im in coco["images"]]),
                           hashes(train_dir), args.max_distance)
    if not dups:
        print(f"No near-duplicates among {len(coco['images'])} test images.")
        return

    if not backup.exists():
        shutil.copy2(ann_path, backup)
    out_dir.mkdir(exist_ok=True)
    flagged = {d["test"] for d in dups}
    moved_ids = {im["id"] for im in coco["images"] if im["file_name"] in flagged}

    for d in dups:
        shutil.move(str(test_dir / d["test"]), out_dir / d["test"])

    keep = {**coco,
            "images": [im for im in coco["images"] if im["id"] not in moved_ids],
            "annotations": [a for a in coco["annotations"] if a["image_id"] not in moved_ids]}
    moved = {**coco,
             "images": [im for im in coco["images"] if im["id"] in moved_ids],
             "annotations": [a for a in coco["annotations"] if a["image_id"] in moved_ids],
             "near_duplicates": dups}
    ann_path.write_text(json.dumps(keep), encoding="utf-8")
    moved_path = out_dir / "_annotations.coco.json"
    if moved_path.exists():  # earlier run: append
        prev = json.loads(moved_path.read_text(encoding="utf-8"))
        for k in ("images", "annotations", "near_duplicates"):
            moved[k] = prev.get(k, []) + moved[k]
    moved_path.write_text(json.dumps(moved, indent=1), encoding="utf-8")

    print(f"Moved {len(dups)} of {len(coco['images'])} test images to {out_dir} "
          f"({len(coco['annotations']) - len(keep['annotations'])} boxes); "
          f"{len(keep['images'])} test images remain.")


if __name__ == "__main__":
    main()
