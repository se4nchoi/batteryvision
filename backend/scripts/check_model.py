"""Smoke-test an exported model before the presentation.

    .\\.venv\\Scripts\\python scripts\\check_model.py ..\\models\\model.xml path\\to\\test_image.jpg

Prints the model's inputs/outputs/labels (as read by ModelAPI) and the raw detections
for one image. Use this to confirm the export loads and label names are as expected.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.inference.openvino_provider import OpenVINOInferenceProvider  # noqa: E402


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    provider = OpenVINOInferenceProvider(Path(sys.argv[1]), min_confidence=0.1)
    print(json.dumps(provider.info(), indent=2))
    for _ in range(2):  # second run shows warm latency
        pred = provider.predict(Path(sys.argv[2]))
    print(f"\n{len(pred.detections)} detections (conf >= 0.1), {pred.inference_ms} ms, image {pred.image_width}x{pred.image_height}")
    for d in pred.detections:
        print(f"  {d.label:<16} {d.confidence:.3f}  bbox(norm)={d.bbox}")


if __name__ == "__main__":
    main()
