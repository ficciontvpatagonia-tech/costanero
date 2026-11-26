#!/usr/bin/env python3
"""Costa del Río Luján en San Fernando–Punta Chica–San Isidro (clubes y dársenas) con OpenStreetMap.
La H-118 (1:100.000) la dibuja muy tosca. Pedido de Marto 26/11/2026.

Método (como puerto_osm.py): se corta la caja con todas las líneas de agua de OSM (Río Luján, Río de la Plata,
canales, ríos, marinas); cada pedazo es tierra si la carta SHN lo tiene mayormente como tierra, salvo los
espejos de agua cerrados de OSM (marinas, dársenas), que son agua siempre.
Entrada: datos/osm_san_fernando.json (Overpass, out geom recortado a la caja), docs/datos/carta.geojson
Salida:  docs/datos/carta.geojson (tierra SHN de la caja reemplazada por la de OSM)"""
import json, pathlib
from shapely.geometry import LineString, Polygon, box, shape, mapping
from shapely.ops import polygonize, unary_union, linemerge

R = pathlib.Path(__file__).resolve().parent.parent
W, S, E, N = -58.600, -34.448, -58.488, -34.405   # al sur de -34.448 ya está la costa OSM San Isidro–Núñez
caja = box(W, S, E, N)
el = json.load(open(R / "datos/osm_san_fernando.json"))["elements"]
NO = {"pond", "reservoir", "basin", "fountain", "reflecting_pool", "wastewater", "lake"}


def tramos(g):  # out geom(bbox) deja null en los nodos de afuera: partes continuas
    partes, cur = [], []
    for p in g + [None]:
        if p is None:
            if len(cur) > 1: partes.append(LineString(cur))
            cur = []
        else: cur.append((p["lon"], p["lat"]))
    return partes


lineas, cerrados, islas = [caja.exterior], [], []
for e in el:
    t = e.get("tags", {})
    if t.get("natural") != "water" or t.get("water") in NO: continue
    geoms = [e["geometry"]] if e["type"] == "way" else [m["geometry"] for m in e.get("members", []) if m.get("geometry") and m.get("role") != "inner"]
    lineas += [l for m in (e.get("members", []) if e["type"] == "relation" else []) if m.get("role") == "inner" and m.get("geometry") for l in tramos(m["geometry"])]
    for m in (e.get("members", []) if e["type"] == "relation" else []):  # islas del río (anillos interiores completos)
        g = m.get("geometry")
        if m.get("role") == "inner" and g and None not in g and len(g) > 3:
            islas.append(Polygon([(q["lon"], q["lat"]) for q in g]).buffer(0))
    for g in geoms:
        lineas += tramos(g)
        if g and None not in g and len(g) > 3 and (g[0]["lon"], g[0]["lat"]) == (g[-1]["lon"], g[-1]["lat"]):
            p = Polygon([(q["lon"], q["lat"]) for q in g]).buffer(0)
            if p.area < 3e-5: cerrados.append(p)   # marinas y dársenas (no los ríos enteros)
caras = [c for c in polygonize(unary_union(lineas)) if c.representative_point().within(caja)]
carta = json.load(open(R / "docs/datos/carta.geojson"))
# la tierra SHN para clasificar sale SIEMPRE del respaldo previo (si no, una segunda corrida no encuentra tierra y la borra)
ORIG = R / "datos/carta_antes_sf.geojson"
tierra_shn = unary_union([shape(f["geometry"]) for f in json.load(open(ORIG))["features"] if f["properties"]["z"] == "tierra" and not f["properties"].get("fuente")]).buffer(0)
agua_cerrada = unary_union(cerrados).buffer(0) if cerrados else Polygon()
BOCA = box(-58.522, -34.4475, -58.505, -34.440)  # boca del Luján frente a Las Heras: 2 bancos de arena (OSM los tiene como islas)
bancos = unary_union([i for i in islas if i.intersects(BOCA)])
tierra = []
for c in caras:
    if c.area < 1e-9: continue
    if agua_cerrada.contains(c.representative_point()): continue
    if not bancos.is_empty and bancos.contains(c.representative_point()): continue  # banco de arena: va como "se seca", no tierra
    if any(i.contains(c.representative_point()) for i in islas): tierra.append(c); continue  # isla en OSM: tierra aunque la carta 2016 no la tenga
    if c.intersection(tierra_shn).area / c.area > 0.5: tierra.append(c)
nueva = unary_union(tierra).difference(agua_cerrada).intersection(caja).simplify(0.00001).buffer(0)
feats = []
for f in carta["features"]:
    g = shape(f["geometry"])
    if f["properties"]["z"] == "tierra" and not f["properties"].get("fuente") and g.intersects(caja):
        g = g.difference(caja)
        if g.is_empty: continue
        f = {**f, "geometry": mapping(g)}
    if f["properties"].get("fuente") == "OSM San Fernando": continue  # se rehace
    feats.append(f)
r6 = lambda geom: json.loads(json.dumps(mapping(geom)), parse_float=lambda x: round(float(x), 6))
feats = [f for f in feats if f["properties"].get("fuente") != "margen islas Luján"]  # se rehace
feats.append({"type": "Feature", "properties": {"z": "tierra", "fuente": "OSM San Fernando"}, "geometry": r6(nueva)})
# los 2 bancos de arena de la boca del Luján (Marto 26/11: "son bancos de arena"): todo "se seca", con el borde
# de ~15 m (separados, como en Navionics) y C-MAP alrededor del contorno de OSM
if not bancos.is_empty:
    seca_b = bancos.buffer(0.00013).difference(agua_cerrada).buffer(0)
    feats.append({"type": "Feature", "properties": {"z": "seca", "fuente": "margen islas Luján"}, "geometry": r6(seca_b.simplify(0.00001))})
    print("bancos de arena (se secan) en la boca del Luján:", len(getattr(bancos, "geoms", [bancos])))
carta["features"] = feats
(R / "docs/datos/carta.geojson").write_text(json.dumps(carta, separators=(",", ":")), encoding="utf-8")
print("caras", len(caras), "tierra", len(tierra), "islas OSM", len(islas), "espejos cerrados", len(cerrados), "km² tierra", round(nueva.area * 111 * 92, 2))
