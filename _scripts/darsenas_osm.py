#!/usr/bin/env python3
"""Dársenas, diques y marinas (OpenStreetMap): adentro la app no pinta profundidad, rayado ni sondajes
(la carta SHN 1:100.000 las marca como "se seca" y no lo son: están dragadas). Pedido de Marto 26/11/2026.

Entrada: datos/osm_costa_si.json (San Isidro–Núñez), datos/osm_puerto.json (Puerto de Buenos Aires)
Salida:  docs/datos/darsenas.json  {"poligonos": [[[lat, lon], ...], ...]}"""
import json, pathlib, re
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, linemerge, unary_union

R = pathlib.Path(__file__).resolve().parent.parent
NO = {"pond", "reservoir", "basin", "fountain", "reflecting_pool", "lake", "wastewater", "lagoon"}
NOMBRE = re.compile(r"^(Dársena|Dique|Antepuerto|Dock Sud|Canal de Pasaje|Marina)", re.I)
lin = lambda g: LineString([(p["lon"], p["lat"]) for p in g])


def poligonos(e):
    if any(p is None for p in e.get("geometry", []) or []) or any(p is None for m in e.get("members", []) for p in (m.get("geometry") or [])):
        return []  # recortado por la caja (ríos enteros): no es una dársena
    if e["type"] == "way" and len(e.get("geometry", [])) > 3:
        return [Polygon([(p["lon"], p["lat"]) for p in e["geometry"]]).buffer(0)]
    if e["type"] == "relation":
        ls = [lin(m["geometry"]) for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
        return [p.buffer(0) for p in polygonize(linemerge(ls))] if ls else []
    return []


sal = []
for archivo in ("datos/osm_costa_si.json", "datos/osm_puerto.json", "datos/osm_san_fernando.json"):
    el = json.load(open(R / archivo))["elements"]
    rdlp = unary_union([p for e in el if e.get("tags", {}).get("name") == "Río de la Plata" for p in poligonos(e)])
    for e in el:
        t = e.get("tags", {})
        if t.get("natural") != "water" or t.get("name") == "Río de la Plata" or t.get("water") in NO:
            continue
        marina = t.get("leisure") == "marina" or bool(NOMBRE.match(t.get("name", "")))
        for p in poligonos(e):
            if p.is_empty or p.area > 2e-5:  # nada más grande que ~0,2 km² (no son dársenas)
                continue
            # sin etiqueta de marina: solo si es agua pegada al río (dársena de club), no un río ni un estanque
            luján = archivo.endswith("san_fernando.json")  # costa del Luján: las dársenas de club vienen como agua sin tipo
            if not marina and (t.get("water") == "river" or (not luján and (rdlp.is_empty or p.distance(rdlp) > 0.003))):
                continue
            sal.append(p)
# dársenas que OSM dibuja solo con la costa (entrante del agua, sin polígono propio; ej. Centro Naval):
# "bolsillos" de agua que se cierran si se engorda la tierra ~130 m
from shapely.geometry import shape, box
carta = json.load(open(R / "docs/datos/carta.geojson"))["features"]
# sin San Fernando: el Luján es angosto y se "cerraría" como si fuera dársena
tierra_osm = unary_union([shape(f["geometry"]) for f in carta if f["properties"].get("fuente") in ("OSM San Isidro-Núñez", "OSM puerto")]).buffer(0)
r = 0.0016  # ~160 m: cierra bocas de hasta ~300 m (Puerto Olivos, Puerto Núñez)
cerrada = tierra_osm.buffer(r, join_style=2).buffer(-r, join_style=2)
bolsillos = cerrada.difference(tierra_osm.buffer(0.00002))
bolsillos = [g for g in (bolsillos.geoms if hasattr(bolsillos, "geoms") else [bolsillos]) if g.geom_type == "Polygon" and g.area > 1e-7]
print("bolsillos de agua (dársenas sin polígono propio):", len(bolsillos))
sal += bolsillos
# agua encerrada por la tierra OSM (huecos del polígono: dársenas interiores)
from shapely.geometry import Polygon as Pg
for g in (tierra_osm.geoms if hasattr(tierra_osm, "geoms") else [tierra_osm]):
    for h in g.interiors:
        ph = Pg(h)
        if 1e-7 < ph.area < 2e-5: sal.append(ph)
# dársenas anchas con boca angosta (ej. Puerto Núñez): al cerrar las bocas quedan como huecos encerrados
for g in (cerrada.geoms if hasattr(cerrada, "geoms") else [cerrada]):
    for h in g.interiors:
        ph = Pg(h).difference(tierra_osm)
        if 1e-7 < ph.area < 2e-5: sal.append(ph)
union = unary_union(sal)
geoms = [union] if union.geom_type == "Polygon" else list(union.geoms)
out = [[[round(y, 6), round(x, 6)] for x, y in g.simplify(0.00002).exterior.coords] for g in geoms if g.area > 2e-8]
(R / "docs/datos/darsenas.json").write_text(json.dumps({"fuente": "© colaboradores de OpenStreetMap (ODbL)", "poligonos": out},
                                                       ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(out), "dársenas/marinas;", (R / "docs/datos/darsenas.json").stat().st_size // 1024, "KB")
