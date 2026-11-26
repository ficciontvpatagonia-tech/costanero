#!/usr/bin/env python3
"""Carta SOHMA 52: glifos chicos sobre el agua → agrupados por forma (k-means) para etiquetar a mano."""
import numpy as np, pathlib, json
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.cluster.vq import kmeans2
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/sohma52"
g = np.array(Image.open(T / "c52.jpg").convert("L")).astype(np.float32)
cls = np.load(T / "clases.npy")
agua = np.isin(cls, [3, 4, 5]); agua = ndimage.binary_dilation(agua, iterations=3)
d = g < 150
lab, n = ndimage.label(d, structure=np.ones((3, 3)))
gl = []
for k, s in enumerate(ndimage.find_objects(lab), 1):
    h = s[0].stop - s[0].start; w = s[1].stop - s[1].start
    if not (5 <= h <= 13 and 2 <= w <= 11): continue
    yc, xc = (s[0].start + s[0].stop) // 2, (s[1].start + s[1].stop) // 2
    if not agua[yc, xc]: continue
    area = (lab[s] == k).sum()
    if area < 8: continue
    gl.append((k, s[0].start, s[1].start, h, w, area))
gl = np.array(gl)
print("glifos", len(gl), "alturas", np.bincount(gl[:, 3]))
# vector de forma: recorte 14x12 alrededor del glifo (escala de grises invertida, centrado arriba-izq)
def vec(y, x, h, w):
    c = 255 - g[y:y + h, x:x + w]
    im = Image.fromarray(c.astype(np.uint8)).resize((8, 12), Image.BILINEAR)
    v = np.array(im, np.float32).ravel(); return np.r_[v / (np.linalg.norm(v) + 1e-6), h / 13, w / 11]
V = np.array([vec(y, x, h, w) for _, y, x, h, w, _ in gl])
K = 48; np.random.seed(0)
cen, lbl = kmeans2(V, K, minit="++", seed=0, iter=30)
np.save(T / "glifos.npy", gl); np.save(T / "glifos_lbl.npy", lbl)
# montaje: por grupo, 12 ejemplos agrandados
cel = 40; ej = 12
mont = Image.new("RGB", (60 + cel * ej, cel * K), "white"); dr = ImageDraw.Draw(mont)
for c in range(K):
    idx = np.where(lbl == c)[0]
    dr.text((4, c * cel + 12), f"{c}:{len(idx)}", fill="red")
    for j, i in enumerate(idx[:ej]):
        _, y, x, h, w, _ = gl[i]
        cr = Image.fromarray(g[y - 2:y + h + 2, x - 2:x + w + 2].astype(np.uint8)).resize(((w + 4) * 3, (h + 4) * 3), Image.NEAREST)
        mont.paste(cr, (60 + j * cel, c * cel))
mont.save(T / "montaje.png")
