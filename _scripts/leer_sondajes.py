#!/usr/bin/env python3
"""Lee los sondajes (números de profundidad) de la carta H-118 recortada (_trabajo/h118_full.tif).

Método: los glifos de texto se agruparon por forma (k-means) y se etiquetaron a mano los grupos que son
dígitos en itálica (los sondajes SHN van en itálica; los rótulos rectos se descartan).
Un sondaje = dígito(s) entero(s) + dígito decimal chico abajo a la derecha (ej. 0₈ = 0,8 m).
La posición es el centro de la parte entera (convención de las cartas).
Salida: datos/sondajes_h118.json  [{lat, lon, z}]  z en metros sobre el cero de la carta.
"""
import json, math, pathlib, subprocess
import numpy as np

T = pathlib.Path(__file__).resolve().parent.parent / "_trabajo"
OUT = pathlib.Path(__file__).resolve().parent.parent / "datos" / "sondajes_h118.json"

# grupo k-means -> dígito (revisado visualmente en _trabajo/montaje.png)
DIGITO = {1: 5, 4: 5, 6: 0, 7: 1, 11: 3, 15: 3, 18: 3, 24: 2, 28: 0, 42: 1, 45: 6, 49: 8, 52: 1,
          57: 9, 64: 4, 67: 1, 69: 2, 70: 9, 71: 5, 77: 7, 37: 0, 16: 0, 22: 1, 54: 2, 6: 0}
SOLO_DECIMAL = {78: 0}  # "o" chico: solo se acepta como decimal

sel = np.load(T / "sel.npy")       # (k, y, x, h, w, area)
lbl = np.load(T / "lbl.npy")
lab = np.load(T / "lab.npy")
gt = json.loads(subprocess.run(["gdalinfo", "-json", str(T / "h118_full.tif")], capture_output=True, text=True).stdout)["geoTransform"]

glifos = []
for (k, y, x, h, w, a), g in zip(sel, lbl):
    d = DIGITO.get(int(g)); dec_only = False
    if d is None and int(g) in SOLO_DECIMAL:
        d = SOLO_DECIMAL[int(g)]; dec_only = True
    if d is not None:
        glifos.append({"k": int(k), "y": int(y), "x": int(x), "h": int(h), "w": int(w), "d": d, "dec": dec_only})

# Índice espacial simple
from collections import defaultdict
celda = 40
grid = defaultdict(list)
for i, g in enumerate(glifos):
    grid[(g["y"] // celda, g["x"] // celda)].append(i)
def vecinos(y, x):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yield from grid.get((y // celda + dy, x // celda + dx), [])

# Todas las componentes de texto (para descartar números dentro de palabras: "Km 22", "Nº 3")
from scipy import ndimage
sl = ndimage.find_objects(lab)
texto = defaultdict(list)
for k, s in enumerate(sl, 1):
    if s is None: continue
    h = s[0].stop - s[0].start; w = s[1].stop - s[1].start
    if 6 <= h <= 24 and 2 <= w <= 24:
        texto[(s[0].start // celda, s[1].start // celda)].append((k, s[0].start, s[1].start, h, w))

usados = set(); sondajes = []
for i, g in enumerate(sorted(range(len(glifos)), key=lambda i: (glifos[i]["y"], glifos[i]["x"]))):
    G = glifos[g]
    if g in usados or G["dec"]:
        continue
    # decimal: abajo a la derecha
    dec = None
    for j in vecinos(G["y"], G["x"]):
        H = glifos[j]
        if j == g or j in usados: continue
        if G["x"] + G["w"] - 4 <= H["x"] <= G["x"] + G["w"] + 7 and G["y"] + 3 <= H["y"] <= G["y"] + 13:
            dec = j; break
    if dec is None:
        continue  # solo aceptamos sondajes con decimal (los enteros sueltos se confunden con rótulos)
    # ¿otra cifra entera a la izquierda en la misma línea? (ej. 1 0₅)
    ent = [g]
    for j in vecinos(G["y"], G["x"]):
        H = glifos[j]
        if j in (g, dec) or j in usados or H["dec"]: continue
        if G["x"] - H["w"] - 6 <= H["x"] <= G["x"] - 2 and abs(H["y"] - G["y"]) <= 3:
            ent.insert(0, j)
    # descartar si hay letras pegadas a la izquierda (palabra) o a la derecha del decimal
    ids = {glifos[j]["k"] for j in ent + [dec]}
    x0 = min(glifos[j]["x"] for j in ent); x1 = glifos[dec]["x"] + glifos[dec]["w"]; yc = G["y"] + G["h"] / 2
    pegado = False
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for (k, y, x, h, w) in texto.get((G["y"] // celda + dy, G["x"] // celda + dx), []):
                if k in ids: continue
                if abs((y + h / 2) - yc) < 9 and (0 <= x0 - (x + w) <= 5 or 0 <= x - x1 <= 5):
                    pegado = True
    if pegado:
        continue
    valor = int("".join(str(glifos[j]["d"]) for j in ent)) + glifos[dec]["d"] / 10
    if valor > 15:
        continue
    usados.update(ent + [dec])
    cx = (x0 + G["x"] + G["w"]) / 2; cy = G["y"] + G["h"] / 2
    X = gt[0] + cx * gt[1]; Y = gt[3] + cy * gt[5]
    lon = math.degrees(X / 6378137); lat = math.degrees(2 * math.atan(math.exp(Y / 6378137)) - math.pi / 2)
    sondajes.append({"lat": round(lat, 6), "lon": round(lon, 6), "z": round(valor, 1)})

OUT.write_text(json.dumps({"fuente": "SHN H-118 (ed. 2016), sondajes leídos automáticamente; referidos al cero de la carta",
                           "sondajes": sondajes}, ensure_ascii=False), encoding="utf-8")
zs = np.array([s["z"] for s in sondajes])
print(len(sondajes), "sondajes; z min/mediana/max", zs.min(), np.median(zs), zs.max())
print("histograma", np.histogram(zs, bins=[0, 0.5, 1, 1.5, 2, 3, 5, 8, 15])[0])
