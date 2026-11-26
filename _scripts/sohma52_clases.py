#!/usr/bin/env python3
"""Carta SOHMA 52: mapa de clases por color (fondo sin texto) y máscara de la zona útil.
Clases: 0 fuera, 1 tierra, 2 seca(verde), 3 azul (<3 m), 4 celeste (3-5 m), 5 blanco (>5 m)"""
import numpy as np, pathlib
from PIL import Image
from scipy import ndimage
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/sohma52"
im = np.array(Image.open(T / "c52.jpg").convert("RGB")).astype(np.float32)
H, W, _ = im.shape
# fondo: mediana 11x11 por canal (borra letras, números y líneas finas)
fondo = np.stack([ndimage.median_filter(im[..., c], size=11) for c in range(3)], -1)
PAL = {1: [(252, 246, 156), (249, 234, 144), (205, 232, 151), (216, 215, 211)],  # tierra amarilla, islas punteadas, ciudad gris
       2: [(170, 200, 120)],                                                        # verde (se seca)
       3: [(188, 234, 251)], 4: [(230, 249, 253)], 5: [(255, 255, 255)]}
cent = []; ids = []
for k, cs in PAL.items():
    for c in cs: cent.append(c); ids.append(k)
cent = np.array(cent, np.float32)
d = ((fondo[..., None, :] - cent) ** 2).sum(-1)
cls = np.array(ids, np.uint8)[d.argmin(-1)]
# zona útil: dentro del marco, sin recuadros A/B, sin regla de escala
util = np.zeros((H, W), bool); util[165:3172, 104:4856] = True
util[165:808, 2044:2890] = False; util[186:1038, 3524:4850] = False; util[2580:3050, 96:285] = False
cls[~util] = 0
cls = ndimage.median_filter(cls, size=5)
np.save(T / "clases.npy", cls)
col = {0: (90, 90, 90), 1: (242, 223, 107), 2: (120, 170, 90), 3: (86, 172, 226), 4: (180, 220, 245), 5: (255, 255, 255)}
vis = np.zeros((H, W, 3), np.uint8)
for k, c in col.items(): vis[cls == k] = c
Image.fromarray(vis).resize((W // 4, H // 4), Image.NEAREST).save(T / "clases.png")
print({k: round((cls == k).mean() * 100, 1) for k in col})
