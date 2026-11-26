#!/usr/bin/env python3
"""Veriles (bordes rojo y verde) de los canales del Puerto de Buenos Aires: Canal Norte (Huergo), Canal Sur y Canal de Acceso
hasta donde empiezan los veriles oficiales de Vías Navegables (veriles.json). Mismo estilo que el Emilio Mitre.

OSM solo trae el eje de cada canal; el borde se pone a la distancia media de las boyas laterales de cada lado
(las boyas están en pares, a ~100 m del eje) y el color de cada lado sale de las boyas (mayoría: hay boyas mal
etiquetadas en OSM). En la bifurcación se recorta lo que cae dentro de otro canal.
Entrada/salida: docs/datos/puerto.json (agrega la clave "veriles": {"rojo": [...], "verde": [...]}, puntos [lat, lon])."""
import json, math, pathlib, statistics
from shapely.geometry import LineString, Point, MultiLineString
from shapely.ops import unary_union, transform
import warnings; warnings.filterwarnings('ignore', category=DeprecationWarning)

R = pathlib.Path(__file__).resolve().parent.parent
ARCH = R / "docs/datos/puerto.json"
d = json.load(open(ARCH))
LAT0 = -34.6
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540  # metros por grado (local, alcanza para ~20 km)
a_m = lambda x, y, z=None: (x * KX, y * KY)
a_g = lambda x, y, z=None: (x / KX, y / KY)
LIMITE_AGP = -58.2345  # al este de acá el Canal de Acceso ya tiene veriles oficiales (Vías Navegables)
AGP = json.load(open(R / "docs/datos/veriles.json"))  # puntos [lon, lat]

ejes = {c["n"]: transform(a_m, LineString([(p[1], p[0]) for p in c["c"]])) for c in d["canales"] if not c.get("soloRotulo")}
lado = {n: {"roja": [], "verde": [], "izq": [], "der": []} for n in ejes}
for b in d["boyas"]:
    if b["k"] not in ("roja", "verde"): continue
    p = transform(a_m, Point(b["lon"], b["lat"]))
    n = min(ejes, key=lambda k: ejes[k].distance(p))
    eje = ejes[n]
    if eje.distance(p) > 200: continue
    s = eje.project(p); q0 = eje.interpolate(max(s - 5, 0)); q1 = eje.interpolate(min(s + 5, eje.length))
    cruz = (q1.x - q0.x) * (p.y - q0.y) - (q1.y - q0.y) * (p.x - q0.x)  # >0: a la izquierda del sentido del eje
    sitio = "izq" if cruz > 0 else "der"
    lado[n][sitio].append(eje.distance(p)); lado[n][b["k"]].append(sitio)

corredores = {n: e.buffer(statistics.median(lado[n]["izq"] + lado[n]["der"]) * 0.97) for n, e in ejes.items()}
salida = {"rojo": [], "verde": []}
for n, eje in ejes.items():
    L = lado[n]
    rojo_izq = L["roja"].count("izq") >= L["roja"].count("der")
    for sitio, signo in (("izq", 1), ("der", -1)):
        dist = statistics.median(L[sitio]) if L[sitio] else statistics.median(L["izq"] + L["der"])
        g = eje.offset_curve(signo * dist, join_style="mitre")
        otros = unary_union([c for k, c in corredores.items() if k != n])
        g = g.difference(otros)
        g = transform(a_g, g)
        if n == "Canal de Acceso":  # el resto lo dibujan los veriles oficiales
            from shapely.geometry import box
            g = g.intersection(box(-58.40, -34.70, LIMITE_AGP, -34.55))
        col = "rojo" if (sitio == "izq") == rojo_izq else "verde"
        partes = [g] if g.geom_type == "LineString" else list(getattr(g, "geoms", []))
        for parte in partes:
            if parte.length * 100000 < 30: continue
            pts = [[round(y, 6), round(x, 6)] for x, y in parte.coords]
            if n == "Canal de Acceso":  # empalmar con el primer punto del veril oficial del mismo color (sin escalón)
                if pts[0][1] > pts[-1][1]: pts.reverse()
                ini = min((t[0] for t in AGP[col]), key=lambda q: math.hypot(q[0] - pts[-1][1], q[1] - pts[-1][0]))
                pts[-1] = [ini[1], ini[0]]
            salida[col].append(pts)
    print(f"{n}: boyas izq {len(L['izq'])} der {len(L['der'])} · rojas a la {'izq' if rojo_izq else 'der'} "
          f"· distancia media {statistics.median(L['izq'] + L['der']):.0f} m")

d["veriles"] = salida
ARCH.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("tramos rojo", len(salida["rojo"]), "verde", len(salida["verde"]))
