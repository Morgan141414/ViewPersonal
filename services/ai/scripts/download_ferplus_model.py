from __future__ import annotations

import sys
from pathlib import Path

import httpx

# Public ONNX model zoo link for FER+ (Emotion FERPlus)
# We do not vend weights in-repo; this script downloads them into services/ai/models.
URL = "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/emotion_ferplus/model/emotion-ferplus-8.onnx"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    model_dir = repo_root / "services" / "ai" / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    out_path = model_dir / "emotion-ferplus-8.onnx"

    print(f"Downloading to {out_path}...")
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(URL)
        r.raise_for_status()
        out_path.write_bytes(r.content)

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
