#!/usr/bin/env python3
"""Carta SOHMA 52: sondajes = cifra(s) entera(s) itálica + decimal chico abajo a la derecha (o entero solo).
Salida: datos/sondajes_sohma52.json [{lat, lon, z}] en m al plano de reducción de Colonia."""
import json, math, pathlib, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sohma52_knn as K
T = K.T; R = K.R; gl = K.gl
X, Y = K.entrenamiento()
pred, dist = [], []
for i in range(len(gl)):
    d = ((X - K.feat(i)) ** 2).sum(1); j = d.argmin(); pred.append(Y[j]); dist.append(d[j])
pred = np.array(pred); dist = np.array(dist)
geo = json.load(open(T / "georef.json")); a, b = np.array(geo["a"]), np.array(geo["b"])
def ll(x, y):
    lo = math.degrees(a @ [1, x, y]); m = b @ [1, x, y]
    return math.degrees(2 * math.atan(math.exp(m)) - math.pi / 2), lo
y0, x0, h, w = gl[:, 1], gl[:, 2], gl[:, 3], gl[:, 4]
es = (pred != "x") & (dist < 0.35)
principal = es & (h >= 6) & (h <= 9)
chico = es & (h >= 4) & (h <= 7)
usado = set(); son = []
orden = np.argsort(x0)
from collections import defaultdict
celda = defaultdict(list)
for i in range(len(gl)): celda[(y0[i] // 30, x0[i] // 30)].append(i)
def vec(i):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1): yield from celda.get((y0[i] // 30 + dy, x0[i] // 30 + dx), [])
# trazos finos = "1" en itálica (no entran en los glifos por área chica)
from scipy import ndimage
gg = K.g; cls = np.load(T / "clases.npy")
lab, _ = ndimage.label(gg < 150, structure=np.ones((3, 3)))
unos = []
for k, s_ in enumerate(ndimage.find_objects(lab), 1):
    hh = s_[0].stop - s_[0].start; ww = s_[1].stop - s_[1].start
    if 4 <= hh <= 9 and 1 <= ww <= 4 and cls[(s_[0].start + s_[0].stop) // 2, (s_[1].start + s_[1].stop) // 2] in (3, 4, 5):
        unos.append((s_[0].start, s_[1].start, hh, ww))
unos = np.array(unos)
cel1 = defaultdict(list)
for k, (yy, xx, hh, ww) in enumerate(unos): cel1[(yy // 30, xx // 30)].append(k)
def unos_cerca(y, x):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1): yield from cel1.get((y // 30 + dy, x // 30 + dx), [])
for i in orden:
    if not principal[i] or i in usado: continue
    # "1" fino a la izquierda: mismo alto → decena (1x); más alto que el glifo → el glifo es el decimal de "1,x"
    pre = None
    for k in unos_cerca(y0[i], x0[i]):
        yy, xx, hh, ww = unos[k]
        if 0 <= x0[i] - (xx + ww) <= 4 and abs((yy + hh) - (y0[i] + h[i])) <= 6 and hh >= 5:
            pre = ("dec" if yy <= y0[i] - 2 and yy + hh <= y0[i] + h[i] - 1 else "dec10"); break
    # ¿hay otra cifra principal pegada a la derecha? (enteros de dos cifras: 10, 11...)
    ent = [i]
    for j in vec(i):
        if j != i and principal[j] and j not in usado and 0 <= x0[j] - (x0[i] + w[i]) <= 4 and abs(y0[j] - y0[i]) <= 2: ent.append(j); break
    u = ent[-1]
    if pre == "dec":   # "1" entero + este glifo como decimal
        val = 1 + int(pred[i]) / 10; usado.add(i)
        la, lo = ll(x0[i] - 3, y0[i] + h[i] / 2 - 2)
        son.append({"lat": round(la, 6), "lon": round(lo, 6), "z": round(val, 1), "px": [int(x0[i] - 3), int(y0[i])], "dec": True}); continue
    dec = None
    dec1 = False
    for k in unos_cerca(y0[u], x0[u]):
        yy, xx, hh, ww = unos[k]
        if -2 <= xx - (x0[u] + w[u]) <= 6 and y0[u] + 1 <= yy <= y0[u] + h[u] and yy + hh >= y0[u] + h[u] + 1 and hh <= h[u]:
            dec1 = True; break
    for j in vec(u):
        if j in ent or j in usado or not chico[j]: continue
        if -2 <= x0[j] - (x0[u] + w[u]) <= 6 and y0[u] + 1 <= y0[j] <= y0[u] + h[u] and y0[j] + h[j] >= y0[u] + h[u] + 1 and h[j] <= h[u]:
            dec = j; break
    # vecinos que no son cifras pegados (palabra): descartar
    pegado = any(j not in ent and j != dec and pred[j] == "x" and abs((y0[j] + h[j] / 2) - (y0[i] + h[i] / 2)) < 6 and
                 (0 <= x0[i] - (x0[j] + w[j]) <= 3 or 0 <= x0[j] - (x0[u] + w[u]) <= 3) for j in vec(i))
    if pegado: continue
    if dec is None and dec1: dec = -1
    if dec is None and (dist[i] > 0.2 or len(ent) > 1): continue   # entero solo: exigir buen parecido
    val = int(("1" if pre == "dec10" else "") + "".join(pred[k] for k in ent)) + (0.1 if dec == -1 else int(pred[dec]) / 10 if dec is not None else 0)
    if val > 20: continue
    usado.update(ent + ([dec] if dec not in (None, -1) else []))
    cx = (x0[ent[0]] + x0[u] + w[u]) / 2; cy = y0[i] + h[i] / 2
    la, lo = ll(cx, cy)
    son.append({"lat": round(la, 6), "lon": round(lo, 6), "z": round(val, 1), "px": [int(cx), int(cy)], "dec": dec is not None, "uno": pre})
# control por franja de color: azul <3 m, celeste 3-5 m, blanco >5 m (tolerancia 0,3 m por el trazo de la isobata)
RANGO = {3: (0, 3.3), 4: (2.7, 5.3), 5: (4.7, 99)}
def franja(x, y):
    v = cls[max(y - 14, 0):y + 14, max(x - 14, 0):x + 14].ravel(); v = v[np.isin(v, [3, 4, 5])]
    return np.bincount(v).argmax() if v.size else 0
antes = len(son)
son = [s_ for s_ in son if franja(*s_["px"]) in RANGO and RANGO[franja(*s_["px"])][0] <= s_["z"] <= RANGO[franja(*s_["px"])][1]]
print("descartados por franja", antes - len(son))
print(len(son), "sondajes;", sum(s["dec"] for s in son), "con decimal")
zs = np.array([s["z"] for s in son]); print("histograma", np.histogram(zs, bins=[0, 1, 2, 3, 4, 5, 6, 8, 12, 20])[0])
json.dump({"fuente": "SOHMA carta 52 (ed. 2019), sondajes leídos automáticamente; plano de reducción de Colonia",
           "sondajes": son}, open(R / "datos/sondajes_sohma52.json", "w"), ensure_ascii=False)
# control visual
im = Image.open(T / "c52.jpg").convert("RGB"); dr = ImageDraw.Draw(im)
for s in son:
    x, y = s["px"]; dr.rectangle([x - 9, y - 7, x + 12, y + 9], outline=(255, 0, 255) if s["dec"] else (255, 120, 0), width=2)
    dr.text((x + 14, y - 12), f'{s["z"]}', fill=(200, 0, 0))
im.save(T / "control_sondajes.jpg", quality=85)
