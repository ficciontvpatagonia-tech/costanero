#!/usr/bin/env python3
"""Costa San Isidro–Olivos–Núñez con OpenStreetMap (la H-118 1:100.000 no tiene dársenas ni clubes).
Entrada: datos/osm_costa_si.json, docs/datos/carta.geojson · Salida: docs/datos/carta.geojson (tierra del recuadro reemplazada)"""
import json, math, pathlib
from shapely.geometry import LineString, Point, Polygon, box, shape, mapping
from shapely.ops import polygonize, unary_union, linemerge
R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.545, -34.565, -58.395, -34.448
caja = box(W, S, E, N)
el = json.load(open(R / "datos/osm_costa_si.json"))["elements"]
lin = lambda g: LineString([(p["lon"], p["lat"]) for p in g])
costas = [lin(e["geometry"]) for e in el if e["type"] == "way" and e.get("tags", {}).get("natural") == "coastline"]
caras = [c for c in polygonize(unary_union(costas + [caja.exterior])) if c.representative_point().within(caja)]
izq = []
for l in costas:
    cs = list(l.coords)
    for (x1, y1), (x2, y2) in zip(cs, cs[1:]):
        dx, dy = x2 - x1, y2 - y1; n = math.hypot(dx, dy) or 1
        izq.append(Point((x1 + x2) / 2 - dy / n * 1e-5, (y1 + y2) / 2 + dx / n * 1e-5))
tierra = unary_union([c for c in caras if any(c.contains(p) for p in izq)])
# marinas y dársenas con agua (no estanques, piletas ni lagos interiores)
NO = {"pond", "reservoir", "basin", "fountain", "reflecting_pool", "lake", "wastewater"}
agua = []
for e in el:
    t = e.get("tags", {})
    if t.get("natural") != "water" or t.get("water") in NO or t.get("name") == "Río de la Plata": continue
    if e["type"] == "way" and len(e["geometry"]) > 3: agua.append(Polygon([(p["lon"], p["lat"]) for p in e["geometry"]]).buffer(0))
    elif e["type"] == "relation":
        ls = [lin(m["geometry"]) for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        agua += [p.buffer(0) for p in polygonize(linemerge(ls))] if ls else []
nueva = tierra.difference(unary_union(agua)).intersection(caja).simplify(0.00001).buffer(0)
carta = json.load(open(R / "docs/datos/carta.geojson"))
feats = []
for f in carta["features"]:
    g = shape(f["geometry"])
    if f["properties"]["z"] == "tierra" and g.intersects(caja):
        g = g.difference(caja)
        if g.is_empty: continue
        f = {**f, "geometry": mapping(g)}
    feats.append(f)
r6 = lambda geom: json.loads(json.dumps(mapping(geom)), parse_float=lambda x: round(float(x), 6))
feats.append({"type": "Feature", "properties": {"z": "tierra", "fuente": "OSM San Isidro-Núñez"}, "geometry": r6(nueva)})
carta["features"] = feats
(R / "docs/datos/carta.geojson").write_text(json.dumps(carta, separators=(",", ":")), encoding="utf-8")
print("caras", len(caras), "tierra km2", round(tierra.area * 111 * 92, 2), "agua marinas", len(agua))
