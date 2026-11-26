#!/usr/bin/env python3
"""Tierra de la costa uruguaya (OSM) entre la carta del río interior (-58,10) y Riachuelo, fuera del recuadro de la carta SOHMA 52.
Entrada: datos/osm_costa_uy.json · Salida: docs/datos/costa_uy.geojson"""
import json, math, pathlib
from shapely.geometry import LineString, Point, box, mapping
from shapely.ops import polygonize, unary_union
R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.10, -34.60, -57.66, -34.05
caja = box(W, S, E, N)
el = json.load(open(R / "datos/osm_costa_uy.json"))["elements"]
lineas = [LineString([(p["lon"], p["lat"]) for p in e["geometry"]]) for e in el if e["type"] == "way" and len(e["geometry"]) > 1]
caras = [c for c in polygonize(unary_union(lineas + [caja.exterior])) if c.representative_point().within(caja)]
# la tierra queda a la izquierda del sentido de la costa en OSM
izq = []
for l in lineas:
    cs = list(l.coords)
    for (x1, y1), (x2, y2) in list(zip(cs, cs[1:]))[::5]:
        dx, dy = x2 - x1, y2 - y1; n = math.hypot(dx, dy) or 1
        izq.append(Point((x1 + x2) / 2 - dy / n * 2e-5, (y1 + y2) / 2 + dx / n * 2e-5))
tierra = unary_union([c for c in caras if sum(c.contains(p) for p in izq) > 0])
colonia = json.load(open(R / "docs/datos/carta_colonia.geojson"))["caja"]
# se deja ~50 m de solape con la tierra de la carta de Colonia: sin rendija (línea fina) en el borde de su caja
tierra = tierra.difference(box(colonia["w"], colonia["s"], colonia["e"], colonia["n"]).buffer(-0.0005, join_style=2)).intersection(caja).simplify(0.00003).buffer(0)
gs = [tierra] if tierra.geom_type == "Polygon" else list(tierra.geoms)
feats = [{"type": "Feature", "properties": {"z": "tierra", "fuente": "OSM"}, "geometry": json.loads(json.dumps(mapping(g)), parse_float=lambda x: round(float(x), 6))} for g in gs if g.area > 1e-8]
(R / "docs/datos/costa_uy.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
print("caras", len(caras), "tierra", len(feats), "KB", (R / "docs/datos/costa_uy.geojson").stat().st_size // 1024)
