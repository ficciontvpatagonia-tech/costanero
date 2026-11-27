#!/usr/bin/env python3
"""Nombres de ríos, arroyos y canales del Delta (OSM, datos/osm_delta.json) → docs/datos/nombres_delta.json
Cada nombre una vez por tramo continuo (>400 m); en tramos largos, uno cada ~5 km. g=1 ríos (zoom ≥12), g=2 arroyos y canales (zoom ≥14).
Ángulo en Mercator, como lo calculaba app.js para rios.geojson."""
import json, math, pathlib
from shapely.geometry import LineString, box
from shapely.ops import linemerge, unary_union
R = pathlib.Path(__file__).resolve().parent.parent
el = json.load(open(R / 'datos/osm_delta.json'))['elements']
por = {}
for e in el:
    t = e.get('tags', {}); n = t.get('name')
    if e['type'] != 'way' or t.get('waterway') not in ('river', 'stream', 'canal') or not n or not n[0].isupper(): continue
    c = [(p['lon'], p['lat']) for p in e['geometry'] if p]
    if len(c) > 1: por.setdefault(n, {'l': [], 'rio': False})['l'].append(LineString(c)); por[n]['rio'] |= t['waterway'] == 'river'
merc = lambda la: math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
M = 1 / 100000  # ~1 m en grados (aprox., para distancias de etiquetas)
# Grafía de la carta SHN H-118 cuando difiere de OSM (pedido de Marto: "fijate en la carta también")
CARTA = {'Arroyo Gelves': 'Arroyo Gélvez', 'Arroyo Las Chicas': 'Arroyo Las Chilcas', 'Arroyo Tutuparé': 'Arroyo Tuyuparé',
         'Arroyo Baldozas': 'Arroyo Baldosas', 'Canal 3': 'Canal Nº 3', 'Arroyo de los Angelitos': 'Arroyo Los Angelitos', 'Arroyo Luciano': 'Canal Luciano'}
ya = {k for f in json.load(open(R / 'docs/datos/rios.geojson'))['features'] for k in (f['properties']['nombre'], *[o for o, c in CARTA.items() if c == f['properties']['nombre']])}  # esos ya tienen etiqueta (rios.geojson)
out = []
for n, d in por.items():
    if n in ya: continue
    u = unary_union(d['l']).intersection(box(-58.95, -34.47, -58.33, -33.85))
    if u.is_empty: continue
    g = linemerge(u) if u.geom_type == 'MultiLineString' else u
    for l in (g.geoms if hasattr(g, 'geoms') else [g]):
        largo = l.length / M
        if largo < 400: continue
        k = max(1, int(largo // 5000))
        for i in range(k):
            s = l.length * (i + 0.5) / k
            p, a, b = l.interpolate(s), l.interpolate(max(s - 150 * M, 0)), l.interpolate(min(s + 150 * M, l.length))
            ang = math.degrees(math.atan2(-(merc(b.y) - merc(a.y)), math.radians(b.x - a.x)))
            if ang > 90: ang -= 180
            if ang < -90: ang += 180
            out.append([CARTA.get(n, n), round(p.y, 5), round(p.x, 5), round(ang, 1), 1 if CARTA.get(n, n).startswith(('Río', 'Paraná')) else 2])
json.dump(out, open(R / 'docs/datos/nombres_delta.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), 'etiquetas de', len(por), 'nombres')
