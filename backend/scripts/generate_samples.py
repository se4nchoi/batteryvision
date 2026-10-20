"""Generate the synthetic demo images + scripted scenario manifest.

The images are rendered placeholders of a cylindrical cell (not photos, not dataset
images). Defects are drawn procedurally, and each scripted "detection" box is derived
from the drawn defect geometry. Confidence values are illustrative, chosen to show
each decision path. Nothing here is model output.

    .\\.venv\\Scripts\\python scripts\\generate_samples.py      (from backend/)
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "sample_data" / "demo"
W, H = 640, 400
BODY = (70, 110, 570, 290)  # x1, y1, x2, y2 of the cell body

# (ground_truth, [(defect_kind, scripted_confidence, severity)])
SEQUENCE = [
    ("clean", []),
    ("scratch", [("scratch", 0.91, 1.0)]),
    ("clean", []),
    ("crack", [("crack", 0.87, 1.0)]),
    ("scratch", [("scratch", 0.44, 0.35)]),      # faint: lands in review band
    ("clean", []),
    ("crack", [("crack", 0.78, 0.9), ("scratch", 0.66, 0.8)]),
    ("crack", [("crack", 0.38, 0.3)]),           # faint: lands in review band
    ("clean", []),
    ("scratch", [("scratch", 0.72, 0.7)]),
    ("scratch", []),                             # missed defect: shows a PASS is not proof of clean
    ("clean", []),
]


def render_body(rng: random.Random) -> Image.Image:
    x1, y1, x2, y2 = BODY
    bg = np.full((H, W, 3), (38, 42, 48), np.float32)
    bg += np.random.default_rng(rng.randint(0, 9999)).normal(0, 3, bg.shape)
    img = Image.fromarray(bg.clip(0, 255).astype(np.uint8))
    # Cylindrical shading: vertical brightness profile across the body height.
    hue = rng.choice([(40, 95, 160), (35, 120, 110), (150, 60, 55)])
    body = np.zeros((y2 - y1, x2 - x1, 3), np.float32)
    for row in range(y2 - y1):
        t = row / (y2 - y1 - 1)
        light = 0.35 + 0.75 * math.sin(math.pi * t) ** 0.6 + 0.35 * math.exp(-((t - 0.3) / 0.07) ** 2)
        body[row, :, :] = np.array(hue) * light
    body += np.random.default_rng(rng.randint(0, 9999)).normal(0, 2.5, body.shape)
    img.paste(Image.fromarray(body.clip(0, 255).astype(np.uint8)), (x1, y1))
    d = ImageDraw.Draw(img)
    # Positive terminal cap and negative end.
    d.rounded_rectangle((x2 - 2, y1 + 55, x2 + 22, y2 - 55), radius=6, fill=(175, 178, 182))
    d.rectangle((x1 - 6, y1 + 6, x1 + 2, y2 - 6), fill=(150, 152, 156))
    # Wrap seam and printed band.
    d.line((x1 + 70, y1, x1 + 70, y2), fill=tuple(int(c * 0.6) for c in hue), width=2)
    d.text((x1 + 150, (y1 + y2) // 2 - 6), "Li-ion 3.6V  18650-SIM", fill=(225, 228, 232))
    d.text((W - 92, H - 22), "SYNTHETIC", fill=(110, 116, 124))
    return img


def draw_scratch(d: ImageDraw.ImageDraw, rng: random.Random, severity: float) -> tuple:
    x1, y1, x2, y2 = BODY
    sx, sy = rng.randint(x1 + 60, x2 - 220), rng.randint(y1 + 30, y2 - 60)
    length = rng.randint(110, 190)
    ang = rng.uniform(-0.35, 0.35)
    pts = [(sx + i * math.cos(ang) + rng.uniform(-1, 1), sy + i * math.sin(ang) + rng.uniform(-1.2, 1.2))
           for i in range(0, length, 6)]
    shade = int(130 + 110 * severity)
    d.line(pts, fill=(shade, shade, shade + 5), width=max(1, round(3 * severity)))
    return pts


def draw_crack(d: ImageDraw.ImageDraw, rng: random.Random, severity: float) -> tuple:
    x1, y1, x2, y2 = BODY
    pts = [(rng.randint(x1 + 120, x2 - 150), rng.randint(y1 + 25, y1 + 60))]
    for _ in range(9):
        px, py = pts[-1]
        pts.append((px + rng.uniform(-14, 14), py + rng.uniform(9, 16)))
    width = max(1, round(4 * severity))
    d.line(pts, fill=(12, 12, 14), width=width, joint="curve")
    all_pts = list(pts)
    for _ in range(2):  # branches
        bx, by = pts[rng.randint(2, 6)]
        branch = [(bx, by)]
        for _ in range(3):
            branch.append((branch[-1][0] + rng.uniform(8, 18) * rng.choice([-1, 1]), branch[-1][1] + rng.uniform(4, 10)))
        d.line(branch, fill=(12, 12, 14), width=max(1, width - 1))
        all_pts += branch
    return all_pts


def bbox_of(pts, pad=8) -> list[float]:
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return [round(max(min(xs) - pad, 0) / W, 4), round(max(min(ys) - pad, 0) / H, 4),
            round(min(max(xs) + pad, W) / W, 4), round(min(max(ys) + pad, H) / H, 4)]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sequence = []
    for i, (gt, defects) in enumerate(SEQUENCE, start=1):
        rng = random.Random(1000 + i)
        img = render_body(rng)
        d = ImageDraw.Draw(img)
        detections = []
        if gt != "clean" and not defects:  # undetected defect: drawn but not scripted
            draw_scratch(d, rng, 0.25)
        for kind, conf, sev in defects:
            pts = (draw_scratch if kind == "scratch" else draw_crack)(d, rng, sev)
            detections.append({"label": kind, "confidence": conf, "bbox": bbox_of(pts)})
        img = img.filter(ImageFilter.GaussianBlur(0.5))
        name = f"cell_{i:02d}.png"
        img.save(OUT / name, optimize=True)
        sequence.append({"file": name, "ground_truth": gt, "detections": detections})
    manifest = {
        "note": "Synthetic images with scripted, illustrative detections. NOT model output.",
        "sequence": sequence,
    }
    (OUT / "scenarios.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(sequence)} images to {OUT}")


if __name__ == "__main__":
    main()
