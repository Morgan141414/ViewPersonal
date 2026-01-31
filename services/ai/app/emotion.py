from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


FERPLUS_LABELS = [
    "neutral",
    "happiness",
    "surprise",
    "sadness",
    "anger",
    "disgust",
    "fear",
    "contempt",
]


class FerPlus:
    def __init__(self, model_path: str):
        self.model_path = model_path
        self.session = ort.InferenceSession(model_path, providers=ort.get_available_providers())
        self.input_name = self.session.get_inputs()[0].name
        self.output_name = self.session.get_outputs()[0].name

    def predict(self, img_bgr: np.ndarray) -> tuple[str, dict[str, float]]:
        # Convert to 64x64 grayscale as expected by FER+ model
        img_rgb = img_bgr[:, :, ::-1]
        pil = Image.fromarray(img_rgb)
        pil = pil.convert("L").resize((64, 64))
        x = np.asarray(pil, dtype=np.float32) / 255.0
        x = x.reshape((1, 1, 64, 64))

        y = self.session.run([self.output_name], {self.input_name: x})[0][0]
        y = y.astype(np.float32)
        # normalize
        y = np.maximum(y, 0)
        s = float(np.sum(y))
        if s > 0:
            y = y / s

        scores = {lbl: float(y[i]) for i, lbl in enumerate(FERPLUS_LABELS) if i < len(y)}
        best = max(scores.items(), key=lambda kv: kv[1])[0] if scores else "neutral"
        return best, scores


def ensure_ferplus_model(model_dir: str) -> str:
    # Do not ship weights. We expect the user to place the model here or download via scripts.
    path = Path(model_dir) / "emotion-ferplus-8.onnx"
    if path.exists():
        return str(path)
    # fallback: allow alternative filename
    alt = Path(model_dir) / "emotion_ferplus.onnx"
    if alt.exists():
        return str(alt)
    raise FileNotFoundError(
        f"FER+ model not found. Place ONNX model at {path} (or {alt})."
    )
