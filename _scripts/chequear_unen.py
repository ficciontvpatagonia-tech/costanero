#!/usr/bin/env python3
"""Chequea las posiciones de boyas publicadas por UNEN (unen.org.ar/data.js).

Compara con datos/boyas_unen.json y, si hay cambios:
  - actualiza datos/boyas_unen.json (la posición de UNEN manda)
  - agrega cada cambio a datos/historial_boyas.json (fecha, boya, metros movidos)
  - imprime un resumen (para el log del Action o la terminal)

Uso: python3 _scripts/chequear_unen.py
Sale con código 0 siempre que pudo leer UNEN; 2 si UNEN no respondió (no toca nada).
"""
import json, math, re, sys, urllib.request, datetime, pathlib

URL = "https://unen.org.ar/data.js"
BASE = pathlib.Path(__file__).resolve().parent.parent / "datos"
ACTUAL = BASE / "boyas_unen.json"
HIST = BASE / "historial_boyas.json"
UMBRAL_M = 5  # menos de 5 m se considera el mismo lugar (redondeo de UNEN)


def metros(a, b):
    """Distancia en metros entre dos (lat, lon) WGS84 (haversine)."""
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def bajar_unen():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (chequeo-boyas)"})
    with urllib.request.urlopen(req, timeout=40) as r:
        js = r.read().decode("utf-8")
        modificado = r.headers.get("Last-Modified", "")
    # data.js es "const UNEN_DATA = {...};" — tomar el objeto y extraer el array buoys sin ejecutar JS
    m = re.search(r'"buoys"\s*:\s*(\[.*?\n  \])', js, re.S)
    if not m:
        raise ValueError("No encontré la lista de boyas en data.js (¿cambió el formato?)")
    return json.loads(m.group(1)), modificado


def main():
    try:
        nuevas, modificado = bajar_unen()
    except Exception as e:
        print(f"UNEN no respondió o cambió el formato: {e}")
        return 2

    viejo = json.loads(ACTUAL.read_text(encoding="utf-8")) if ACTUAL.exists() else {"boyas": []}
    prev = {b["name"]: b for b in viejo.get("boyas", [])}
    hoy = datetime.date.today().isoformat()
    cambios = []

    for b in nuevas:
        p = prev.pop(b["name"], None)
        if p is None:
            cambios.append({"fecha": hoy, "boya": b["name"], "tipo": "nueva", "lat": b["lat"], "lon": b["lon"]})
            continue
        d = metros((p["lat"], p["lon"]), (b["lat"], b["lon"]))
        if d >= UMBRAL_M:
            cambios.append({"fecha": hoy, "boya": b["name"], "tipo": "movida", "metros": round(d),
                            "de": [p["lat"], p["lon"]], "a": [b["lat"], b["lon"]]})
        if p.get("status") != b.get("status"):
            cambios.append({"fecha": hoy, "boya": b["name"], "tipo": "estado",
                            "de": p.get("status"), "a": b.get("status")})
    for nombre, p in prev.items():
        cambios.append({"fecha": hoy, "boya": nombre, "tipo": "retirada", "lat": p["lat"], "lon": p["lon"]})

    if not cambios:
        print(f"Sin cambios en {len(nuevas)} señales de UNEN (archivo UNEN: {modificado}).")
        return 0

    ACTUAL.write_text(json.dumps({"fuente": URL, "descargado": hoy, "archivo_modificado": modificado,
                                  "boyas": nuevas}, ensure_ascii=False, indent=1), encoding="utf-8")
    hist = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else []
    hist.extend(cambios)
    HIST.write_text(json.dumps(hist, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(cambios)} cambio(s) en UNEN:")
    for c in cambios:
        extra = f"{c['metros']} m" if c["tipo"] == "movida" else (f"{c.get('de')} → {c.get('a')}" if c["tipo"] == "estado" else "")
        print(f"  - {c['boya']}: {c['tipo']} {extra}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
