#!/usr/bin/env python3
"""Arma las capas finales del mapa para la web (todo WGS84):
  web/datos/carta.geojson  ← carta H-118 vectorizada (+ corrección del recuadro inserto sobre Buenos Aires)
  web/datos/rios.geojson   ← ejes de los ríos principales del Delta (OpenStreetMap), con nombre
  web/datos/boyas.json     ← copia de datos/boyas_unen.json (la posición de UNEN manda)

Uso: python3 _scripts/armar_carta.py
"""
import json, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
WEB = R / "docs" / "datos"
WEB.mkdir(parents=True, exist_ok=True)

# 1) Carta: H-118 + máscara del recuadro inserto (esquina SO de la carta, sobre Gran Buenos Aires).
carta = json.load(open(R / "datos/carta/h118.geojson"))
# Al oeste de 58°36' W la H-118 termina: se completa con la H-130 (Delta) recortada a esa franja
oeste = R / "_trabajo/h130_oeste.geojson"
if oeste.exists():
    for f in json.load(open(oeste))["features"]:
        if f.get("geometry") and f["geometry"]["type"] in ("Polygon", "MultiPolygon"):
            carta["features"].append(f)
MASCARA = [-58.605, -34.705, -58.49, -34.525]  # oeste, sur, este, norte: ahí no hay agua navegable real
w, s, e, n = MASCARA
carta["features"].append({"type": "Feature", "properties": {"z": "tierra", "nota": "mascara recuadro inserto"},
                          "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}})


def redondear(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 5), round(c[1], 5)]  # 5 decimales ≈ 1 m
    return [redondear(x) for x in c]


orden = {"agua": 0, "profunda": 1, "seca": 2, "tierra": 3}
carta["features"].sort(key=lambda f: orden.get(f["properties"]["z"], 9))
for f in carta["features"]:
    f["geometry"]["coordinates"] = redondear(f["geometry"]["coordinates"])
json.dump({"type": "FeatureCollection", "fuente": "SHN cartas H-118 y H-130 (ed. 2016), redibujadas", "features": carta["features"]},
          open(WEB / "carta.geojson", "w"), separators=(",", ":"))

# 2) Ríos principales (OpenStreetMap). Solo los que un navegante usa como referencia.
PRINCIPALES = {
    "Río Luján", "Río Paraná de las Palmas", "Río Sarmiento", "Río Tigre", "Río San Antonio", "Río Capitán",
    "Río Carapachay", "Río de la Reconquista", "Canal de Vinculación", "Río Paraná Miní", "Río Barca Grande",
    "Río Capitancito", "Arroyo Abra Vieja", "Riachuelo", "Arroyo Gelves", "Arroyo Espera", "Río Urión",
    "Arroyo Las Cañas", "Canal Gobernador Arias", "Arroyo Toro",
}
osm = json.load(open(R / "_trabajo/rios.json"))["elements"]
feats = []
for el in osm:
    nombre = el["tags"].get("name")
    if nombre not in PRINCIPALES or "geometry" not in el:
        continue
    coords = [[round(p["lon"], 5), round(p["lat"], 5)] for p in el["geometry"]]
    if len(coords) < 2:
        continue
    feats.append({"type": "Feature", "properties": {"nombre": "Río Urión" if nombre == "Río URíon" else nombre},
                  "geometry": {"type": "LineString", "coordinates": coords}})
json.dump({"type": "FeatureCollection", "fuente": "© colaboradores de OpenStreetMap (ODbL)", "features": feats},
          open(WEB / "rios.geojson", "w"), separators=(",", ":"))

# 3) Boyas UNEN
(WEB / "boyas.json").write_text((R / "datos/boyas_unen.json").read_text(encoding="utf-8"), encoding="utf-8")

print("carta:", len(carta["features"]), "polígonos,", round((WEB / "carta.geojson").stat().st_size / 1e6, 2), "MB")
print("ríos:", len(feats), "tramos", sorted({f["properties"]["nombre"] for f in feats}))
