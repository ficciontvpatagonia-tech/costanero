#!/usr/bin/env python3
"""Ríos y arroyos del Delta con OpenStreetMap (pedido de Marto 27/11/2026: mejorar el dibujo; Google Maps no: su licencia no lo permite).
Entrada: datos/osm_delta.json (Overpass out geom, caja -34.47,-58.95,-33.85,-58.33: natural=water, waterway=riverbank, waterway=river|stream|canal)
Salida:  docs/datos/delta.geojson — z='agua' (espejos de agua de ríos y canales) y z='arroyo' (líneas que no tienen superficie dibujada)."""
import json, pathlib
from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union, linemerge
R = pathlib.Path(__file__).resolve().parent.parent
el = json.load(open(R / 'datos/osm_delta.json'))['elements']
NO = {'pond', 'reservoir', 'basin', 'fountain', 'reflecting_pool', 'wastewater', 'swimming_pool', 'treatment', 'lagoon'}
def coords(g): return [(p['lon'], p['lat']) for p in g if p]
polis, lineas = [], []
for e in el:
    t = e.get('tags', {})
    if t.get('name') == 'Río de la Plata': continue  # el estuario lo dibujan las cartas (y su costa ya está rehecha con OSM)
    es_agua = (t.get('natural') == 'water' and t.get('water') not in NO) or t.get('waterway') == 'riverbank'
    if e['type'] == 'way' and es_agua:
        c = coords(e['geometry'])
        if len(c) > 3 and c[0] == c[-1]: polis.append(Polygon(c).buffer(0))
    elif e['type'] == 'relation' and es_agua:
        outer = [LineString(coords(m['geometry'])) for m in e['members'] if m.get('role') == 'outer' and m.get('geometry') and len(coords(m['geometry'])) > 1]
        inner = [LineString(coords(m['geometry'])) for m in e['members'] if m.get('role') == 'inner' and m.get('geometry') and len(coords(m['geometry'])) > 1]
        o = unary_union(list(polygonize(linemerge(outer)))) if outer else None
        if o is None or o.is_empty: continue
        if inner:
            i = unary_union(list(polygonize(linemerge(inner))))
            if not i.is_empty: o = o.difference(i)
        polis.append(o.buffer(0))
    elif e['type'] == 'way' and t.get('waterway') in ('river', 'stream', 'canal'):
        c = coords(e['geometry'])
        if len(c) > 1: lineas.append(LineString(c))
agua = unary_union(polis)
# solo donde las cartas tienen tierra: el agua de las cartas (canales UNEN, degradé, dársenas) no se toca
from shapely.geometry import shape as _sh
tierra = unary_union([_sh(f['geometry']).buffer(0) for n in ('carta.geojson', 'carta_h116.geojson')
                      for f in json.load(open(R / 'docs/datos' / n))['features'] if f['properties'].get('z') == 'tierra'])
agua = agua.intersection(tierra)
lineas = [unary_union(lineas).intersection(tierra)]
agua_s = agua.simplify(0.00006, preserve_topology=True)
# arroyos: solo lo que queda fuera de los espejos de agua
resto = unary_union(lineas).difference(agua.buffer(0.00003))
feats = []
for p in (agua_s.geoms if hasattr(agua_s, 'geoms') else [agua_s]):
    if p.geom_type == 'Polygon' and p.area > 1e-9: feats.append({'type': 'Feature', 'properties': {'z': 'agua'}, 'geometry': mapping(p)})
r = resto.simplify(0.00006)
for l in (r.geoms if hasattr(r, 'geoms') else [r]):
    if l.geom_type == 'LineString' and l.length > 0.003: feats.append({'type': 'Feature', 'properties': {'z': 'arroyo'}, 'geometry': mapping(l)})
def red(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, (list, tuple)): return [red(v) for v in o]
    if isinstance(o, dict): return {k: red(v) for k, v in o.items()}
    return o
json.dump(red({'type': 'FeatureCollection', 'fuente': '© OpenStreetMap', 'features': feats}), open(R / 'docs/datos/delta.geojson', 'w'), separators=(',', ':'))
print(sum(f['properties']['z'] == 'agua' for f in feats), 'espejos ·', sum(f['properties']['z'] == 'arroyo' for f in feats), 'arroyos ·', (R / 'docs/datos/delta.geojson').stat().st_size // 1024, 'KB')
