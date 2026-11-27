#!/usr/bin/env python3
"""Tierra fuera de las cartas de detalle (pedido de Marto 27/11/2026: "pintar todo de marrón").
Toma tierra y zona que se seca de la SHN H-116 (vectorizada con vectorizar_carta.py) y le resta lo que ya cubren
carta.geojson, carta_este.geojson, carta_colonia.geojson y la caja de costa_uy (OSM). Al oeste de la H-116 (58°54' W): todo tierra.
Uso: .venv/bin/python _scripts/relleno_h116.py h116.geojson  → docs/datos/carta_h116.geojson"""
import json, sys, pathlib
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union
R = pathlib.Path(__file__).resolve().parents[1] / 'docs/datos'
def cobertura(f):
    fs = json.load(open(R / f))['features']
    return unary_union([shape(x['geometry']).buffer(0.0005) for x in fs if x['geometry']]).buffer(-0.0003)
cub = unary_union([cobertura('carta.geojson'), cobertura('carta_este.geojson'), cobertura('carta_colonia.geojson'),
                   box(*shape(json.load(open(R / 'costa_uy.geojson'))['features'][0]['geometry']).bounds)])
h = json.load(open(sys.argv[1]))['features']
out = []
for z in ('tierra', 'seca'):
    g = unary_union([shape(x['geometry']).buffer(0) for x in h if x['properties'].get('z') == z])
    if z == 'tierra': g = g.union(box(-61.0, -35.6, -58.899, -33.0))   # al oeste de la H-116
    g = g.difference(cub).simplify(0.0004, preserve_topology=True)
    gs = [g] if g.geom_type == 'Polygon' else [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']
    for p in gs:
        compacto = 4 * 3.14159 * p.area / (p.length ** 2 or 1)  # las líneas de los canales salen como 'seca' finita
        if p.area > 2e-7 and (z == 'tierra' or (p.area > 2e-6 and compacto > 0.05)): out.append({'type': 'Feature', 'properties': {'z': z, 'fuente': 'SHN H-116 (fuera de las cartas de detalle)'}, 'geometry': mapping(p)})
def red(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, (list, tuple)): return [red(v) for v in o]
    if isinstance(o, dict): return {k: red(v) for k, v in o.items()}
    return o
json.dump(red({'type': 'FeatureCollection', 'features': out}), open(R / 'carta_h116.geojson', 'w'), separators=(',', ':'), ensure_ascii=False)
print(len(out), 'polígonos', (R / 'carta_h116.geojson').stat().st_size // 1024, 'KB')
