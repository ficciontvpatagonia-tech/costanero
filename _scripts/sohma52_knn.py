#!/usr/bin/env python3
"""Clasificador de cifras por vecino más cercano entrenado con las etiquetas a mano."""
import numpy as np, pathlib
from PIL import Image
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/sohma52"
g = np.array(Image.open(T / "c52.jpg").convert("L")).astype(np.float32)
gl = np.load(T / "glifos.npy")
def feat(i, dx=0, dy=0):
    _, y, x, h, w, _ = gl[i]
    c = 255 - g[y + dy:y + h + dy, x + dx:x + w + dx]
    c = np.clip(c - 40, 0, None)
    v = np.array(Image.fromarray(c.astype(np.uint8)).resize((10, 14), Image.BILINEAR), np.float32).ravel()
    v /= np.linalg.norm(v) + 1e-6
    return np.r_[v, 0.6 * h / 10, 0.6 * w / 8]
def entrenamiento():
    X, Y = [], []
    for k in sorted(T.glob("etiquetas*.txt")):
        sel = np.load(T / k.name.replace("etiquetas", "muestra").replace(".txt", ".npy"))
        et = k.read_text().split()
        assert len(et) == len(sel), (k, len(et), len(sel))
        for i, e in zip(sel, et):
            for dx, dy in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
                X.append(feat(i, dx, dy)); Y.append(e)
    return np.array(X), np.array(Y)
if __name__ == "__main__":
    X, Y = entrenamiento(); n = len(Y) // 5
    ok = 0; conf = {}
    for j in range(n):
        q = X[j * 5]; d = ((X - q) ** 2).sum(1); d[j * 5:j * 5 + 5] = 9
        p = Y[d.argmin()]; ok += p == Y[j * 5]
        if p != Y[j * 5]: conf[(Y[j * 5], p)] = conf.get((Y[j * 5], p), 0) + 1
    print("acierto LOO", ok / n, sorted(conf.items(), key=lambda t: -t[1])[:15])
