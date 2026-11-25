#!/usr/bin/env python3
"""Grilla de profundidad (al cero de la carta) para la capa dinámica "no pasás".

Entrada: datos/sondajes_h118.json + docs/datos/carta.geojson (tierra / seca / agua / profunda)
Salida:  docs/datos/profundidad.json  {w,s,e,n,cols,rows,b64}  int8 en decímetros, -128 = sin dato
Reglas:
  - interpolación lineal entre sondajes (triangulación); fuera de la red de sondajes: sin dato
  - zonas que se secan (verde de la carta) = -0,1 m; bordes de esas zonas = 0 m
  - canales dragados (blanco de la carta) = al menos 5 m
  - tierra = sin dato
"""
import json, base64, pathlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import griddata
from scipy import ndimage

R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.60, -34.70, -58.10, -34.10
CEL = 0.0015  # ~150 m
cols, rows = int(round((E - W) / CEL)), int(round((N - S) / CEL))

son = json.load(open(R / "datos/sondajes_h118.json"))["sondajes"]
carta = json.load(open(R / "docs/datos/carta.geojson"))["features"]

def ij(lon, lat):
    return (lon - W) / CEL, (N - lat) / CEL

def mascara(zona):
    im = Image.new("L", (cols, rows), 0); d = ImageDraw.Draw(im)
    for f in carta:
        if f["properties"].get("z") != zona: continue
        g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for p in polys:
            d.polygon([ij(*c) for c in p[0]], fill=1)
            for h in p[1:]:
                d.polygon([ij(*c) for c in h], fill=0)
    return np.array(im, bool)

seca, prof, tierra = mascara("seca"), mascara("profunda"), mascara("tierra")
agua = mascara("agua") | prof

# puntos: sondajes + borde de zonas que se secan (0 m)
pts = [(ij(s["lon"], s["lat"]), s["z"]) for s in son]
borde = seca & ~ndimage.binary_erosion(seca)
ys, xs = np.nonzero(borde)
pts += [((x, y), 0.0) for y, x in zip(ys[::3], xs[::3])]
P = np.array([p[0] for p in pts]); Z = np.array([p[1] for p in pts])
gy, gx = np.mgrid[0:rows, 0:cols]
z = griddata(P, Z, (gx + 0.5, gy + 0.5), method="linear")

# sin sondaje a menos de 2,5 km = sin dato (ríos del Delta, zonas no relevadas): no inventar profundidad
from scipy.spatial import cKDTree
arbol = cKDTree(np.array([ij(s_["lon"], s_["lat"]) for s_ in son]))
dist, _ = arbol.query(np.c_[(gx + 0.5).ravel(), (gy + 0.5).ravel()])
z[(dist.reshape(rows, cols) * CEL * 111000) > 2500] = np.nan
# recuadro inserto de la carta sobre Buenos Aires (no es agua)
mw, ms, me, mn = -58.605, -34.705, -58.49, -34.525
x0, y0 = ij(mw, mn); x1, y1 = ij(me, ms)
z[max(int(y0), 0):int(y1) + 1, max(int(x0), 0):int(x1) + 1] = np.nan
agua[max(int(y0), 0):int(y1) + 1, max(int(x0), 0):int(x1) + 1] = False
z[seca] = -0.1
z[prof] = np.where(np.isnan(z[prof]), 5.0, np.maximum(z[prof], 5.0))
z[tierra & ~agua & ~seca] = np.nan
z[~(agua | seca)] = np.nan
# suavizado leve sólo donde hay dato
val = ~np.isnan(z)
zz = np.where(val, z, 0); ww = val.astype(float)
zs = ndimage.gaussian_filter(zz, 1.0) / np.maximum(ndimage.gaussian_filter(ww, 1.0), 1e-6)
z = np.where(val, np.minimum(zs, np.where(seca, -0.1, 99)), np.nan)

q = np.where(np.isnan(z), -128, np.clip(np.round(z * 10), -127, 127)).astype(np.int8)
(R / "docs/datos/profundidad.json").write_text(json.dumps({
    "w": W, "s": S, "e": E, "n": N, "cols": cols, "rows": rows, "unidad": "decimetros al cero de la carta, -128 sin dato",
    "fuente": "Sondajes SHN H-118 (ed. 2016) interpolados; aproximado",
    "b64": base64.b64encode(q.tobytes()).decode()}), encoding="utf-8")
v = q[q > -128] / 10
print(f"grilla {cols}x{rows}; con dato {v.size} celdas; <1 m al cero: {(v < 1).mean():.0%}; tamaño {(R / 'docs/datos/profundidad.json').stat().st_size // 1024} KB")
# vista de control
img = np.zeros((rows, cols, 3), np.uint8); img[:] = (200, 200, 200)
dd = np.where(q > -128, q / 10, np.nan)
img[dd < 1] = (20, 20, 20); img[(dd >= 1) & (dd < 2)] = (120, 190, 235); img[dd >= 2] = (235, 245, 252)
img[np.isnan(dd) & tierra] = (242, 223, 107)
Image.fromarray(img).resize((cols * 2, rows * 2), Image.NEAREST).save(R / "_trabajo/control_grilla.png")
