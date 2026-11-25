#!/usr/bin/env python3
"""Arma las capas finales del mapa para la web (todo WGS84):
  web/datos/carta.geojson  ← carta H-118 vectorizada (+ corrección del recuadro inserto sobre Buenos Aires)
  web/datos/rios.geojson   ← ejes de los ríos principales del Delta (OpenStreetMap), con nombre
  web/datos/boyas.json     ← copia de datos/boyas_unen.json (la posición de UNEN manda)

Uso: python3 _scripts/armar_carta.py
"""
import json, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
WEB = R / "docs" / "datos"
WEB.mkdir(parents=True, exist_ok=True)

# 1) Carta: H-118 + máscara del recuadro inserto (esquina SO de la carta, sobre Gran Buenos Aires).
carta = json.load(open(R / "datos/carta/h118.geojson"))
# Al oeste de 58°36' W la H-118 termina: se completa con la H-130 (Delta) recortada a esa franja
oeste = R / "_trabajo/h130_oeste.geojson"
if oeste.exists():
    for f in json.load(open(oeste))["features"]:
        if f.get("geometry") and f["geometry"]["type"] in ("Polygon", "MultiPolygon"):
            carta["features"].append(f)
MASCARA = [-58.605, -34.705, -58.49, -34.525]  # oeste, sur, este, norte: ahí no hay agua navegable real
w, s, e, n = MASCARA
carta["features"].append({"type": "Feature", "properties": {"z": "tierra", "nota": "mascara recuadro inserto"},
                          "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}})


import math

def _dp(pts, tol):
    """Douglas-Peucker (en grados, corrigiendo longitud por latitud)."""
    if len(pts) < 3: return pts
    kx = math.cos(math.radians(pts[0][1]))
    def dseg(p, a, b):
        ax, ay, bx, by, px, py = a[0] * kx, a[1], b[0] * kx, b[1], p[0] * kx, p[1]
        dx, dy = bx - ax, by - ay
        if dx == dy == 0: return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)
    keep = [False] * len(pts); keep[0] = keep[-1] = True; pila = [(0, len(pts) - 1)]
    while pila:
        i, j = pila.pop(); dmax, idx = 0, None
        for k in range(i + 1, j):
            d = dseg(pts[k], pts[i], pts[j])
            if d > dmax: dmax, idx = d, k
        if idx is not None and dmax > tol:
            keep[idx] = True; pila += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]

def _chaikin(ring, it=2):
    """Redondea esquinas de un anillo cerrado (corte 1/4–3/4)."""
    for _ in range(it):
        r = ring[:-1] if ring[0] == ring[-1] else ring
        if len(r) < 4: return ring
        nuevo = []
        for i in range(len(r)):
            a, b = r[i], r[(i + 1) % len(r)]
            nuevo += [[a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]]
        ring = nuevo + [nuevo[0]]
    return ring

TOL = 0.00011  # ~12 m: un píxel de la carta; convierte los escalones en diagonales
def suavizar(geom):
    def anillo(r):
        if len(r) < 5: return r
        s_ = _dp(r, TOL)
        if s_[0] != s_[-1]: s_.append(s_[0])
        return _chaikin(s_, 2) if len(s_) >= 4 else r
    if geom["type"] == "Polygon":
        geom["coordinates"] = [anillo(r) for r in geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        geom["coordinates"] = [[anillo(r) for r in poly] for poly in geom["coordinates"]]
    return geom


def redondear(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]  # 5 decimales ≈ 1 m
    return [redondear(x) for x in c]


orden = {"agua": 0, "profunda": 1, "seca": 2, "tierra": 3}
carta["features"].sort(key=lambda f: orden.get(f["properties"]["z"], 9))
for f in carta["features"]:
    if f["properties"].get("nota") != "mascara recuadro inserto":
        suavizar(f["geometry"])
    f["geometry"]["coordinates"] = redondear(f["geometry"]["coordinates"])
json.dump({"type": "FeatureCollection", "fuente": "SHN cartas H-118 y H-130 (ed. 2016), redibujadas", "features": carta["features"]},
          open(WEB / "carta.geojson", "w"), separators=(",", ":"))

# 2) Ríos principales (OpenStreetMap). Solo los que un navegante usa como referencia.
PRINCIPALES = {
    "Río Luján", "Río Paraná de las Palmas", "Río Sarmiento", "Río Tigre", "Río San Antonio", "Río Capitán",
    "Río Carapachay", "Río de la Reconquista", "Canal de Vinculación", "Río Paraná Miní", "Río Barca Grande",
    "Río Capitancito", "Arroyo Abra Vieja", "Riachuelo", "Arroyo Gelves", "Arroyo Espera", "Río Urión",
    "Arroyo Las Cañas", "Canal Gobernador Arias", "Arroyo Toro",
}
osm = json.load(open(R / "_trabajo/rios.json"))["elements"]
feats = []
for el in osm:
    nombre = el["tags"].get("name")
    if nombre not in PRINCIPALES or "geometry" not in el:
        continue
    coords = [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]
    if len(coords) < 2:
        continue
    feats.append({"type": "Feature", "properties": {"nombre": "Río Urión" if nombre == "Río URíon" else nombre},
                  "geometry": {"type": "LineString", "coordinates": coords}})
json.dump({"type": "FeatureCollection", "fuente": "© colaboradores de OpenStreetMap (ODbL)", "features": feats},
          open(WEB / "rios.geojson", "w"), separators=(",", ":"))

# 3) Boyas UNEN
(WEB / "boyas.json").write_text((R / "datos/boyas_unen.json").read_text(encoding="utf-8"), encoding="utf-8")

print("carta:", len(carta["features"]), "polígonos,", round((WEB / "carta.geojson").stat().st_size / 1e6, 2), "MB")
print("ríos:", len(feats), "tramos", sorted({f["properties"]["nombre"] for f in feats}))
