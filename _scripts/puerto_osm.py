#!/usr/bin/env python3
"""Puerto de Buenos Aires con contorno de OpenStreetMap (la carta RNC lo dibuja tosco).

Entrada: datos/osm_puerto.json (Overpass: coastline, dársenas, escolleras), datos/carta_antes_puerto.geojson
Salida:  docs/datos/carta.geojson (tierra del recuadro del puerto reemplazada por OSM menos dársenas)
         docs/datos/puerto.json  → clave "escolleras" (líneas) y "rotulosPuerto"
"""
import json, pathlib
from shapely.geometry import shape, mapping, box, LineString, Polygon, MultiPolygon
from shapely.ops import polygonize, unary_union, linemerge

R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.395, -34.655, -58.320, -34.560   # recuadro del puerto
caja = box(W, S, E, N)
osm = json.load(open(R / "datos/osm_puerto.json"))["elements"]
carta = json.load(open(R / "datos/carta_antes_puerto.geojson"))

linea = lambda g: LineString([(p["lon"], p["lat"]) for p in g])
# tierra de la carta (para decidir de qué lado está la tierra en cada cara)
tierra_carta = unary_union([shape(f["geometry"]) for f in carta["features"] if f["properties"]["z"] == "tierra"]).buffer(0)

# 1) Costa OSM + borde del recuadro → caras; tierra = caras que la carta ya tiene mayormente como tierra
costas = [linea(e["geometry"]) for e in osm if e["type"] == "way" and e.get("tags", {}).get("natural") == "coastline"]
caras = list(polygonize(unary_union(costas + [caja.exterior])))
caras = [c for c in caras if c.within(caja.buffer(1e-9))]
tierra_osm = unary_union([c for c in caras if c.intersection(tierra_carta).area > 0.5 * c.area])

# 2) Agua portuaria: dársenas, antepuertos, diques, Dock Sud, Riachuelo...
NO = {"Río de la Plata"}
def poligono(e):
    if e["type"] == "way":
        g = e["geometry"]; return Polygon([(p["lon"], p["lat"]) for p in g]) if len(g) > 3 else None
    ls = [linea(m["geometry"]) for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    ps = list(polygonize(linemerge(ls))) if ls else []
    return unary_union(ps) if ps else None
agua = []
for e in osm:
    t = e.get("tags", {})
    if t.get("natural") != "water" or t.get("name") in NO: continue
    if t.get("water") in ("pond", "reflecting_pool", "wastewater", "reservoir"): continue
    p = poligono(e)
    if p is not None and p.is_valid and p.intersects(caja): agua.append(p)
agua = unary_union(agua).buffer(0)
nueva = tierra_osm.difference(agua).intersection(caja).buffer(0)

# 3) Carta: tierra fuera del recuadro + tierra OSM adentro
feats = []
for f in carta["features"]:
    g = shape(f["geometry"])
    if f["properties"]["z"] == "tierra" and g.intersects(caja):
        g = g.difference(caja)
        if g.is_empty: continue
        f = {**f, "geometry": mapping(g)}
    feats.append(f)
r6 = lambda geom: json.loads(json.dumps(mapping(geom.simplify(0.00002)), default=float), parse_float=lambda x: round(float(x), 6))
feats.append({"type": "Feature", "properties": {"z": "tierra", "fuente": "OSM puerto"}, "geometry": r6(nueva)})
carta["features"] = feats
(R / "docs/datos/carta.geojson").write_text(json.dumps(carta, separators=(",", ":")), encoding="utf-8")

# 4) Escolleras
esc = [[[round(p["lat"], 6), round(p["lon"], 6)] for p in e["geometry"]] for e in osm
       if e["type"] == "way" and e.get("tags", {}).get("man_made") == "breakwater"]
pj = json.load(open(R / "docs/datos/puerto.json"))
pj["escolleras"] = esc
pj["rotulosPuerto"] = [
    {"n": "Puerto de Buenos Aires", "lat": -34.5800, "lon": -58.3760, "z": 12},
    {"n": "Dársena Norte", "lat": -34.5949, "lon": -58.3665, "z": 14},
    {"n": "Dársena Sur", "lat": -34.6286, "lon": -58.3545, "z": 14},
    {"n": "Dock Sud", "lat": -34.6472, "lon": -58.3401, "z": 14},
]
(R / "docs/datos/puerto.json").write_text(json.dumps(pj, ensure_ascii=False), encoding="utf-8")
print("caras", len(caras), "tierra OSM km2≈", round(tierra_osm.area * 111 * 92, 2), "agua portuaria km2≈", round(agua.area * 111 * 92, 2), "escolleras", len(esc))
