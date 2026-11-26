#!/usr/bin/env python3
"""Carta SOHMA 52 → polígonos (tierra / seca / agua / profunda) + grilla de profundidad de Colonia.
Salidas: docs/datos/carta_colonia.geojson, docs/datos/profundidad_colonia.json"""
import json, math, pathlib, base64, subprocess, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.interpolate import griddata
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/sohma52"
cls = np.load(T / "clases.npy").copy()
geo = json.load(open(T / "georef.json")); a, b = np.array(geo["a"]), np.array(geo["b"])
def ll(x, y):
    lo = math.degrees(a @ [1, x, y]); m = b @ [1, x, y]
    return math.degrees(2 * math.atan(math.exp(m)) - math.pi / 2), lo
X0, Y0, X1, Y1 = 104, 165, 4856, 3172
# 1) agua conectada al río; lo demás dentro del marco = tierra (cuadros de notas, recuadros sobre tierra)
agua = np.isin(cls, [3, 4, 5]); lab, n = ndimage.label(agua)
tam = ndimage.sum(agua, lab, range(1, n + 1))
borde = set(np.unique(np.r_[lab[Y0 + 2, X0:X1], lab[Y1 - 3, X0:X1], lab[Y0:Y1, X0 + 2], lab[Y0:Y1, X1 - 3]])) - {0}
keep = np.zeros(n + 1, bool); keep[[i for i in borde if tam[i - 1] > 2000]] = True; keep[np.argmax(tam) + 1] = True
fuera = agua & ~keep[lab]
cls[fuera] = 1
dentro = np.zeros_like(agua); dentro[Y0:Y1, X0:X1] = True
# huecos dentro del marco (recuadros, regla de escala): la clase más cercana
hueco = (cls == 0) & dentro
if hueco.any():
    _, (iy, ix) = ndimage.distance_transform_edt(hueco | ~dentro, return_indices=True)
    cls[hueco] = cls[iy[hueco], ix[hueco]]
# manchitas de tierra/seca en el agua (símbolos, letras): menos de 300 px → agua de alrededor
solido = np.isin(cls, [1, 2]); lt, nt = ndimage.label(solido)
tam_t = ndimage.sum(solido, lt, range(1, nt + 1))
chica = solido & np.isin(lt, np.where(tam_t < 300)[0] + 1)
if chica.any():
    _, (iy, ix) = ndimage.distance_transform_edt(chica | ~np.isin(cls, [3, 4, 5]), return_indices=True)
    cls[chica] = cls[iy[chica], ix[chica]]
# "se seca" solo si toca el agua (lo verde suelto sobre tierra es texto o vegetación)
seca = cls == 2; ls_, ns_ = ndimage.label(seca)
toca = np.unique(ls_[seca & ndimage.binary_dilation(np.isin(cls, [3, 4, 5]), iterations=2)])
cls[seca & ~np.isin(ls_, toca[toca > 0])] = 1
cls[~dentro] = 0
np.save(T / "clases_final.npy", cls)
# 2) polígonos: GeoTIFF en EPSG:3857 (la georreferencia es afín en Mercator) → gdal polygonize
RT = 6378137.0
gt = [RT * a[0], RT * a[1], RT * a[2], RT * b[0], RT * b[1], RT * b[2]]
red = cls[::2, ::2]  # ~9 m por píxel
gt2 = [gt[0], gt[1] * 2, gt[2] * 2, gt[3], gt[4] * 2, gt[5] * 2]
zona = np.zeros_like(red); zona[red == 1] = 1; zona[red == 2] = 2; zona[np.isin(red, [3, 4])] = 3; zona[red == 5] = 4
zona = ndimage.median_filter(zona, size=3)
tmp = pathlib.Path(tempfile.mkdtemp())
Image.fromarray(zona.astype(np.uint8)).save(tmp / "z.tif")
# world file con rotación (centro del píxel sup-izq)
A, B, C, D, E, F = gt2[1], gt2[2], gt2[0] + gt2[1] * 0.5 + gt2[2] * 0.5, gt2[4], gt2[5], gt2[3] + gt2[4] * 0.5 + gt2[5] * 0.5
(tmp / "z.tfw").write_text(f"{A}\n{D}\n{B}\n{E}\n{C}\n{F}\n")
subprocess.run(["gdal_translate", "-q", "-a_srs", "EPSG:3857", str(tmp / "z.tif"), str(tmp / "z3857.tif")], check=True)
subprocess.run(["gdal", "raster", "polygonize", "-q", "--attribute-name", "v", str(tmp / "z3857.tif"), str(tmp / "z.gpkg")], check=True)
subprocess.run(["ogr2ogr", "-q", "-f", "GeoJSON", "-t_srs", "EPSG:4326", str(tmp / "z.geojson"), str(tmp / "z.gpkg")], check=True)
NOM = {1: "tierra", 2: "seca", 3: "agua", 4: "profunda"}
polys = {k: [] for k in NOM}
for f in json.load(open(tmp / "z.geojson"))["features"]:
    v = f["properties"]["v"]
    if v in NOM: polys[v].append(shape(f["geometry"]).buffer(0))
feats = []
for k, nom in NOM.items():
    if not polys[k]: continue
    g = unary_union(polys[k]).buffer(0.00003).buffer(-0.00003).simplify(0.00004)   # ~4 m: sin escalones de píxel
    g = g.buffer(0)
    gs = [g] if g.geom_type == "Polygon" else list(g.geoms)
    gs = [p for p in gs if p.area > 2e-8]
    for p in gs:
        feats.append({"type": "Feature", "properties": {"z": nom, "fuente": "SOHMA 52 (2019)"},
                      "geometry": json.loads(json.dumps(mapping(p)), parse_float=lambda x: round(float(x), 6))})
sw, ne = ll(X0, Y1), ll(X1, Y0)
caja = {"w": round(min(ll(X0, Y0)[1], ll(X0, Y1)[1]), 5), "e": round(max(ll(X1, Y0)[1], ll(X1, Y1)[1]), 5),
        "s": round(min(ll(X0, Y1)[0], ll(X1, Y1)[0]), 5), "n": round(max(ll(X0, Y0)[0], ll(X1, Y0)[0]), 5)}
(R / "docs/datos/carta_colonia.geojson").write_text(json.dumps({"type": "FeatureCollection", "caja": caja, "features": feats}, separators=(",", ":")), encoding="utf-8")
print("caja", caja, "polígonos", len(feats), "KB", (R / "docs/datos/carta_colonia.geojson").stat().st_size // 1024)

# 3) grilla de profundidad (al plano de reducción de Colonia): sondajes + isobatas de las franjas, acotada por franja
CEL = 0.0005
W_, E_, S_, N_ = caja["w"], caja["e"], caja["s"], caja["n"]
cols, rows = int(round((E_ - W_) / CEL)), int(round((N_ - S_) / CEL))
# clase de cada celda: muestreo del mapa de clases en el centro de la celda (inverso de la georreferencia)
M = np.array([[a[1], a[2]], [b[1], b[2]]]); Mi = np.linalg.inv(M)
lon_c = W_ + (np.arange(cols) + 0.5) * CEL; lat_c = N_ - (np.arange(rows) + 0.5) * CEL
LO, LA = np.meshgrid(np.radians(lon_c), np.log(np.tan(np.pi / 4 + np.radians(lat_c) / 2)))
px = Mi[0, 0] * (LO - a[0]) + Mi[0, 1] * (LA - b[0]); py = Mi[1, 0] * (LO - a[0]) + Mi[1, 1] * (LA - b[0])
xi = np.clip(px.round().astype(int), 0, cls.shape[1] - 1); yi = np.clip(py.round().astype(int), 0, cls.shape[0] - 1)
cc = cls[yi, xi]; cc[(px < X0) | (px > X1) | (py < Y0) | (py > Y1)] = 0
son = json.load(open(R / "datos/sondajes_sohma52.json"))["sondajes"]
pts = [((s_["lon"] - W_) / CEL - 0.5, (N_ - s_["lat"]) / CEL - 0.5) for s_ in son]; zs = [s_["z"] for s_ in son]
# isobatas: borde entre franjas (azul|celeste = 3 m, celeste|blanco = 5 m, agua|tierra/seca = 0 m)
for c1, c2, zv in [(3, 4, 3.0), (4, 5, 5.0), (3, 1, 0.0), (3, 2, 0.0)]:
    m = (cc == c1) & ndimage.binary_dilation(cc == c2)
    ys_, xs_ = np.nonzero(m)
    for y_, x_ in list(zip(ys_, xs_))[::4]: pts.append((x_, y_)); zs.append(zv)
gy, gx = np.mgrid[0:rows, 0:cols]
z = griddata(np.array(pts), np.array(zs), (gx, gy), method="linear")
zn = griddata(np.array(pts), np.array(zs), (gx, gy), method="nearest"); z = np.where(np.isnan(z), zn, z)
# acotar por franja (la franja de la carta manda sobre la interpolación)
z = np.where(cc == 3, np.clip(z, 0.0, 3.0), z); z = np.where(cc == 4, np.clip(z, 3.0, 5.0), z); z = np.where(cc == 5, np.maximum(z, 5.0), z)
z[cc == 2] = -0.1
z[np.isin(cc, [0, 1])] = np.nan
q = np.where(np.isnan(z), -128, np.clip(np.round(z * 10), -127, 127)).astype(np.int8)
(R / "docs/datos/profundidad_colonia.json").write_text(json.dumps({"w": W_, "s": S_, "e": E_, "n": N_, "cols": cols, "rows": rows, "ref": "colonia",
    "unidad": "decimetros al plano de reduccion de Colonia (SOHMA), -128 sin dato", "fuente": "SOHMA carta 52 (ed. 2019): sondajes leídos + franjas de color",
    "b64": base64.b64encode(q.tobytes()).decode()}), encoding="utf-8")
v = q[q > -128] / 10
print(f"grilla {cols}x{rows}; agua {v.size}; <2 m {(v < 2).mean():.0%}; KB {(R / 'docs/datos/profundidad_colonia.json').stat().st_size // 1024}")
vis = np.zeros((rows, cols, 3), np.uint8); vis[:] = (200, 200, 200)
dd = np.where(q > -128, q / 10, np.nan)
for lo_, hi_, col in [(-1, 1, (20, 20, 20)), (1, 2, (90, 120, 200)), (2, 3, (120, 190, 235)), (3, 5, (190, 225, 245)), (5, 99, (250, 252, 255))]:
    vis[(dd >= lo_) & (dd < hi_)] = col
Image.fromarray(vis).resize((cols * 2, rows * 2), Image.NEAREST).save(T / "control_grilla_colonia.png")
