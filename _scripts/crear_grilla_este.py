#!/usr/bin/env python3
"""Profundidad y carta de la parte este de la H-118 (58°07' W → 57°45' W): llena el hueco entre el Emilio Mitre y Colonia
(Banco Ortiz, Paso del Farallón, Playa Honda) y la costa uruguaya hasta Martín García. Mismas reglas que crear_grilla.py.

Entrada: datos/sondajes_h118_este.json (+ sondajes oeste cerca del empalme), datos/carta/h118_este.geojson,
         docs/datos/costa_uy.geojson (tierra uruguaya OSM), docs/datos/carta_colonia.geojson (caja SOHMA 52: ahí manda esa carta)
Salida:  docs/datos/profundidad_este.json (grilla, se carga al acercarse) · docs/datos/carta_este.geojson (agua/profunda/seca)"""
import json, base64, pathlib
import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import griddata
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.115, -34.70, -57.747, -34.10
CEL = 0.0015
cols, rows = int(round((E - W) / CEL)), int(round((N - S) / CEL))
MASCARAS = [(-58.1301, -34.1208, -57.7639, -34.0990), (-57.9263, -34.3136, -57.7650, -34.1550),
            (-58.0440, -34.2280, -58.0124, -34.2064), (-57.8151, -34.4413, -57.7530, -34.3928)]  # recuadros y tablas
col = json.load(open(R / "docs/datos/carta_colonia.geojson"))["caja"]
COLONIA = box(col["w"], col["s"], col["e"], col["n"])

son = json.load(open(R / "datos/sondajes_h118_este.json"))["sondajes"]
son += [s for s in json.load(open(R / "datos/sondajes_h118.json"))["sondajes"] if s["lon"] > -58.17]  # empalme suave con la grilla oeste
carta = json.load(open(R / "datos/carta/h118_este.geojson"))["features"]
tierra_uy = unary_union([shape(f["geometry"]) for f in json.load(open(R / "docs/datos/costa_uy.geojson"))["features"]]).buffer(0)
fuera = unary_union([box(*m) for m in MASCARAS] + [COLONIA])
# en la grilla se deja ~1,5 km de solape dentro de la caja de Colonia: la app funde una carta con la otra (sin escalón)
fuera_grilla = unary_union([box(*m) for m in MASCARAS] + [COLONIA.buffer(-0.015, join_style=2)])

ij = lambda lon, lat: ((lon - W) / CEL, (N - lat) / CEL)
def mascara(zona):
    im = Image.new("L", (cols, rows), 0); d = ImageDraw.Draw(im)
    for f in carta:
        if f["properties"].get("z") != zona: continue
        g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for p in polys:
            d.polygon([ij(*c) for c in p[0]], fill=1)
            for h in p[1:]: d.polygon([ij(*c) for c in h], fill=0)
    return np.array(im, bool)
def mascara_geom(g):
    im = Image.new("L", (cols, rows), 0); d = ImageDraw.Draw(im)
    for p in ([g] if g.geom_type == "Polygon" else g.geoms):
        d.polygon([ij(*c) for c in p.exterior.coords], fill=1)
        for h in p.interiors: d.polygon([ij(*c) for c in h.coords], fill=0)
    return np.array(im, bool)

seca, prof, tierra = mascara("seca"), mascara("profunda"), mascara("tierra")
agua = mascara("agua") | prof
tierra |= mascara_geom(tierra_uy.intersection(box(W, S, E, N)))
nada = mascara_geom(fuera_grilla.intersection(box(W, S, E, N)))

pts = [(ij(s["lon"], s["lat"]), s["z"]) for s in son]
borde = seca & ~ndimage.binary_erosion(seca)
ys, xs = np.nonzero(borde)
pts += [((x, y), 0.0) for y, x in zip(ys[::3], xs[::3])]
P = np.array([p[0] for p in pts]); Z = np.array([p[1] for p in pts])
gy, gx = np.mgrid[0:rows, 0:cols]
z = griddata(P, Z, (gx + 0.5, gy + 0.5), method="linear")
arbol = cKDTree(np.array([ij(s_["lon"], s_["lat"]) for s_ in son]))
dist, _ = arbol.query(np.c_[(gx + 0.5).ravel(), (gy + 0.5).ravel()])
z[(dist.reshape(rows, cols) * CEL * 111000) > 2500] = np.nan
z[seca] = -0.1
z[prof] = np.where(np.isnan(z[prof]), 5.0, np.maximum(z[prof], 5.0))
z[tierra & ~seca] = np.nan
z[~(agua | seca)] = np.nan
z[nada] = np.nan
val = ~np.isnan(z)
zz = np.where(val, z, 0); ww = val.astype(float)
zs = ndimage.gaussian_filter(zz, 1.0) / np.maximum(ndimage.gaussian_filter(ww, 1.0), 1e-6)
z = np.where(val, np.minimum(zs, np.where(seca, -0.1, 99)), np.nan)
q = np.where(np.isnan(z), -128, np.clip(np.round(z * 10), -127, 127)).astype(np.int8)
sal = R / "docs/datos/profundidad_este.json"
sal.write_text(json.dumps({"w": W, "s": S, "e": E, "n": N, "cols": cols, "rows": rows, "ref": "shn",
                           "unidad": "decimetros al cero de la carta, -128 sin dato",
                           "fuente": "Sondajes SHN H-118 (ed. 2016), parte este, interpolados; aproximado",
                           "b64": base64.b64encode(q.tobytes()).decode()}), encoding="utf-8")
v = q[q > -128] / 10
print(f"grilla este {cols}x{rows}; con dato {v.size} celdas; <1 m: {(v < 1).mean():.0%}; {sal.stat().st_size // 1024} KB")

# carta este para el mapa: agua, profunda y seca (la tierra uruguaya ya viene de OSM); fuera de recuadros y de la caja de Colonia
feats = []
for f in carta:
    zc = f["properties"]["z"]
    if zc == "tierra": continue
    g = shape(f["geometry"]).buffer(0).difference(fuera)
    if zc == "seca": g = g.difference(tierra_uy)
    if g.is_empty or g.area < 2e-7: continue
    feats.append({"type": "Feature", "properties": {"z": zc, "fuente": "SHN H-118 este"},
                  "geometry": json.loads(json.dumps(mapping(g.simplify(0.0001))), parse_float=lambda x: round(float(x), 6))})
(R / "docs/datos/carta_este.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
print("carta este", len(feats), "polígonos", (R / "docs/datos/carta_este.geojson").stat().st_size // 1024, "KB")
# control
img = np.zeros((rows, cols, 3), np.uint8); img[:] = (200, 200, 200)
dd = np.where(q > -128, q / 10, np.nan)
img[dd < 1] = (20, 20, 20); img[(dd >= 1) & (dd < 2)] = (120, 190, 235); img[(dd >= 2) & (dd < 4)] = (190, 225, 245); img[dd >= 4] = (240, 248, 253)
img[np.isnan(dd) & tierra] = (242, 223, 107)
Image.fromarray(img).resize((cols * 2, rows * 2), Image.NEAREST).save(R / "_trabajo/control_grilla_este.png")
