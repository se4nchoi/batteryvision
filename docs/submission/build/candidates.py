"""Contact sheet of candidate test photos (GT boxes drawn) for picking slide images."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[3]
test = ROOT / "datasets/battery/test"
coco = json.loads((test / "_annotations.coco.json").read_text(encoding="utf-8"))
cat = {c["id"]: c["name"] for c in coco["categories"]}
anns = {}
for a in coco["annotations"]:
    anns.setdefault(a["image_id"], []).append(a)
groups = {"crack": [], "scratch": [], "good": []}
for im in coco["images"]:
    a = anns.get(im["id"], [])
    names = {cat[x["category_id"]] for x in a}
    key = "good" if not a else ("crack" if names == {"crack"} else "scratch" if names == {"scratch"} else None)
    if key:
        groups[key].append((im, a))
COL = {"crack": (240, 80, 60), "scratch": (250, 190, 40)}
tiles = []
for key, items in groups.items():
    for im, a in items[:: max(1, len(items) // 8)][:8]:
        img = Image.open(test / im["file_name"]).convert("RGB")
        d = ImageDraw.Draw(img)
        for x in a:
            bx, by, bw, bh = x["bbox"]
            d.rectangle([bx, by, bx + bw, by + bh], outline=COL[cat[x["category_id"]]], width=4)
        img = img.resize((240, 240))
        ImageDraw.Draw(img).text((6, 6), f"{key} {im['id']}", fill=(255, 255, 255))
        tiles.append(img)
cols = 8
sheet = Image.new("RGB", (cols * 240, ((len(tiles) + cols - 1) // cols) * 240), "black")
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * 240, (i // cols) * 240))
sheet.save(Path(__file__).parent / "cand" / "sheet.jpg", quality=80)
print(len(tiles), {k: len(v) for k, v in groups.items()})
