from __future__ import annotations

import numpy as np


def pack_embedding(vec: np.ndarray) -> bytes:
    vec = vec.astype(np.float32)
    return vec.tobytes(order="C")


def unpack_embedding(blob: bytes, dim: int) -> np.ndarray:
    arr = np.frombuffer(blob, dtype=np.float32)
    if arr.size != dim:
        # tolerate older entries; best effort
        return arr.astype(np.float32)
    return arr.reshape((dim,)).astype(np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(np.float32)
    b = b.astype(np.float32)
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
