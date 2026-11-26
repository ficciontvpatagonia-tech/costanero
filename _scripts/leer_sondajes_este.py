#!/usr/bin/env python3
"""Sondajes de la H-118 al este de 58°06' W (_trabajo/h118_este.tif: Banco Ortiz, Paso del Farallón, costa uruguaya).

Mismo método que leer_sondajes.py y la misma carta (misma letra): los glifos se detectan igual (píxeles oscuros de la
paleta, componentes 8-conexas de 10–22 px de alto) y cada uno se clasifica por vecino más cercano contra los glifos de
la parte oeste ya etiquetados (grupos k-means → dígito, revisados a mano). Un sondaje = entero + decimal chico abajo
a la derecha. Se descartan los recuadros insertos y las tablas de la carta.
Uso: .venv/bin/python _scripts/leer_sondajes_este.py   →   datos/sondajes_h118_este.json"""
import json, math, pathlib, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage
from collections import defaultdict

R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo"
sys.path.insert(0, str(R / "_scripts"))
OSCUROS = {(84, 84, 84), (68, 25, 77), (0, 0, 0)}
# recuadros insertos y tablas (oeste, sur, este, norte): ahí los números no son sondajes del río
MASCARAS = [(-58.1301, -34.1208, -57.7639, -34.0990), (-57.9263, -34.3136, -57.7650, -34.1550),
            (-58.0440, -34.2280, -58.0124, -34.2064), (-57.8151, -34.4413, -57.7530, -34.3928)]
DIGITO = {1: 5, 4: 5, 6: 0, 7: 1, 11: 3, 15: 3, 18: 3, 24: 2, 28: 0, 42: 1, 45: 6, 49: 8, 52: 1,
          57: 9, 64: 4, 67: 1, 69: 2, 70: 9, 71: 5, 77: 7, 37: 0, 16: 0, 22: 1, 54: 2}  # = leer_sondajes.py
SOLO_DECIMAL = {78: 0}


def glifos_de(tif):
    im = Image.open(tif); idx = np.array(im); pal = np.array(im.getpalette()[:768]).reshape(-1, 3)
    m = np.isin(idx, [i for i, c in enumerate(pal) if tuple(c) in OSCUROS])
    lab, _ = ndimage.label(m, structure=np.ones((3, 3)))
    sl = ndimage.find_objects(lab)
    area = ndimage.sum(m, lab, index=np.arange(1, len(sl) + 1))
    sel = [(k + 1, s[0].start, s[1].start, s[0].stop - s[0].start, s[1].stop - s[1].start, int(area[k]))
           for k, s in enumerate(sl) if s and 10 <= s[0].stop - s[0].start <= 22 and 4 <= s[1].stop - s[1].start <= 18 and 24 <= area[k] <= 199]
    gt = json.loads(subprocess.run(["gdalinfo", "-json", str(tif)], capture_output=True, text=True).stdout)["geoTransform"]
    return lab, np.array(sel), gt


def rasgos(lab, sel):  # forma del glifo: su máscara en 12×16 (con proporción) + alto y ancho
    out = np.zeros((len(sel), 16 * 12 + 2), np.float32)
    for i, (k, y, x, h, w, a) in enumerate(sel):
        c = (lab[y:y + h, x:x + w] == k).astype(np.uint8) * 255
        lado = max(h, w); caja = np.zeros((lado, lado), np.uint8); caja[:h, :w] = c  # arriba-izquierda, sin deformar
        v = np.array(Image.fromarray(caja).resize((12, 16), Image.BILINEAR), np.float32).ravel() / 255
        out[i] = np.r_[v, h / 6, w / 6]
    return out


# 1) entrenamiento: glifos de la parte oeste con su etiqueta (dígito / decimal "o" / otra cosa)
lab_o = np.load(T / "lab.npy"); sel_o = np.load(T / "sel.npy"); lbl_o = np.load(T / "lbl.npy")
X = rasgos(lab_o, sel_o); del lab_o
Y = np.array([str(DIGITO[int(g)]) if int(g) in DIGITO else ("o" if int(g) in SOLO_DECIMAL else "x") for g in lbl_o])
# 2) glifos de la parte este y clasificación (3 vecinos más cercanos, mayoría)
lab, sel, gt = glifos_de(T / "h118_este.tif")
Q = rasgos(lab, sel)
X2 = (X ** 2).sum(1)
# control: la misma clasificación sobre la parte oeste (dejando afuera el propio glifo) tiene que coincidir con las etiquetas
m = np.random.default_rng(0).choice(len(X), 1500, replace=False); dd = (X[m] ** 2).sum(1)[:, None] + X2[None, :] - 2 * X[m] @ X.T; dd[np.arange(len(m)), m] = 1e9
ok = np.mean([max(set(list(Y[np.argsort(r)[:3]])), key=list(Y[np.argsort(r)[:3]]).count) == Y[j] for r, j in zip(dd, m)])
print(f'control oeste: {ok:.1%} de acuerdo con las etiquetas')
pred = []
for i in range(0, len(Q), 500):
    q = Q[i:i + 500]; d = (q ** 2).sum(1)[:, None] + X2[None, :] - 2 * q @ X.T
    vec = np.argsort(d, axis=1)[:, :3]
    for fila, dd in zip(vec, d):
        votos = list(Y[fila]); p = max(set(votos), key=votos.count)
        if dd[fila[0]] > 6: p = "x"  # nada parecido en el entrenamiento
        pred.append(p)
print("glifos este", len(sel), "· dígitos", sum(p not in ("x", "o") for p in pred))
# el 8 chico (decimal) a veces sale como 3: el 8 tiene huecos cerrados y el 3 no
def huecos(k, y, x, h, w):
    fondo = lab[y:y + h, x:x + w] != k
    lb, n = ndimage.label(fondo)
    borde = set(lb[0].tolist()) | set(lb[-1].tolist()) | set(lb[:, 0].tolist()) | set(lb[:, -1].tolist())
    return sum(1 for i in range(1, n + 1) if i not in borde)
cambios = 0
for i, ((k, y, x, h, w, a), p) in enumerate(zip(sel, pred)):
    if p == "3" and huecos(k, y, x, h, w) >= 1: pred[i] = "8"; cambios += 1
print("3 → 8 por huecos cerrados:", cambios)

# 3) armado de sondajes (igual que leer_sondajes.py)
glifos = [{"k": int(k), "y": int(y), "x": int(x), "h": int(h), "w": int(w), "d": (0 if p == "o" else int(p)), "dec": p == "o"}
          for (k, y, x, h, w, a), p in zip(sel, pred) if p != "x"]
celda = 40; grid = defaultdict(list)
for i, g in enumerate(glifos): grid[(g["y"] // celda, g["x"] // celda)].append(i)
def vecinos(y, x):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1): yield from grid.get((y // celda + dy, x // celda + dx), [])
texto = defaultdict(list)
for k, s in enumerate(ndimage.find_objects(lab), 1):
    if s is None: continue
    h = s[0].stop - s[0].start; w = s[1].stop - s[1].start
    if 6 <= h <= 24 and 2 <= w <= 24: texto[(s[0].start // celda, s[1].start // celda)].append((k, s[0].start, s[1].start, h, w))
usados = set(); sondajes = []
for g in sorted(range(len(glifos)), key=lambda i: (glifos[i]["y"], glifos[i]["x"])):
    G = glifos[g]
    if g in usados or G["dec"]: continue
    dec = None
    for j in vecinos(G["y"], G["x"]):
        H = glifos[j]
        if j == g or j in usados: continue
        if G["x"] + G["w"] - 4 <= H["x"] <= G["x"] + G["w"] + 7 and G["y"] + 3 <= H["y"] <= G["y"] + 13: dec = j; break
    if dec is None: continue
    ent = [g]
    for j in vecinos(G["y"], G["x"]):
        H = glifos[j]
        if j in (g, dec) or j in usados or H["dec"]: continue
        if G["x"] - H["w"] - 6 <= H["x"] <= G["x"] - 2 and abs(H["y"] - G["y"]) <= 3: ent.insert(0, j)
    ids = {glifos[j]["k"] for j in ent + [dec]}
    x0 = min(glifos[j]["x"] for j in ent); x1 = glifos[dec]["x"] + glifos[dec]["w"]; yc = G["y"] + G["h"] / 2
    pegado = any(k not in ids and abs((y + h / 2) - yc) < 9 and (0 <= x0 - (x + w) <= 5 or 0 <= x - x1 <= 5)
                 for dy in (-1, 0, 1) for dx in (-1, 0, 1) for (k, y, x, h, w) in texto.get((G["y"] // celda + dy, G["x"] // celda + dx), []))
    if pegado: continue
    valor = int("".join(str(glifos[j]["d"]) for j in ent)) + glifos[dec]["d"] / 10
    if valor > 15: continue
    usados.update(ent + [dec])
    cx = (x0 + G["x"] + G["w"]) / 2; cy = G["y"] + G["h"] / 2
    Xm = gt[0] + cx * gt[1]; Ym = gt[3] + cy * gt[5]
    lon = math.degrees(Xm / 6378137); lat = math.degrees(2 * math.atan(math.exp(Ym / 6378137)) - math.pi / 2)
    if any(w <= lon <= e and s <= lat <= n for w, s, e, n in MASCARAS): continue
    sondajes.append({"lat": round(lat, 6), "lon": round(lon, 6), "z": round(valor, 1), "px": [round(cx), round(cy)]})

(R / "datos/sondajes_h118_este.json").write_text(json.dumps({"fuente": "SHN H-118 (ed. 2016), parte este (58°08' W a 57°45' W), sondajes leídos automáticamente; referidos al cero de la carta",
                                                           "sondajes": sondajes}, ensure_ascii=False), encoding="utf-8")
zs = np.array([s["z"] for s in sondajes])
print(len(sondajes), "sondajes; z min/mediana/max", zs.min(), np.median(zs), zs.max())
print("histograma", np.histogram(zs, bins=[0, 0.5, 1, 1.5, 2, 3, 5, 8, 15])[0])
