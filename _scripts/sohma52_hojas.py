#!/usr/bin/env python3
"""Hojas de etiquetado: glifos al azar (alto 5-10 px) en grilla numerada."""
import numpy as np, pathlib, sys
from PIL import Image, ImageDraw
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/sohma52"
g = np.array(Image.open(T / "c52.jpg").convert("L"))
gl = np.load(T / "glifos.npy")
cand = np.where((gl[:, 3] >= 5) & (gl[:, 3] <= 11))[0]
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 7)
sel = rng.choice(cand, int(sys.argv[1]) if len(sys.argv) > 1 else 300, replace=False)
np.save(T / "muestra.npy", sel)
Z, C = 5, 15; cw, ch = 80, 90
for hoja in range(0, len(sel), 75):
    part = sel[hoja:hoja + 75]; rows = (len(part) + C - 1) // C
    im = Image.new("L", (C * cw, rows * ch), 255); dr = ImageDraw.Draw(im)
    for j, i in enumerate(part):
        _, y, x, h, w, _ = gl[i]
        cr = Image.fromarray(g[y - 1:y + h + 1, x - 1:x + w + 1]).resize(((w + 2) * Z, (h + 2) * Z), Image.NEAREST)
        cx, cy = (j % C) * cw, (j // C) * ch
        im.paste(cr, (cx + 10, cy + 4)); dr.text((cx + 2, cy + ch - 14), str(hoja + j), fill=0)
        dr.rectangle([cx, cy, cx + cw - 1, cy + ch - 1], outline=200)
    im.save(T / f"hoja_{hoja // 75}.png")
print(len(sel))
