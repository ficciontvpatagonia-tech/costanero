#!/usr/bin/env python3
"""Redibuja en vectorial una carta raster SHN (BSB/KAP): tierra, zona que se seca, agua y agua profunda.

Uso: .venv/bin/python _scripts/vectorizar_carta.py CARTA.KAP oeste sur este norte salida.geojson

Todo queda en WGS84 (EPSG:4326). La carta se lee en su georreferencia original (WGS84/Mercator),
sin correr nada: la coherencia lat/lon la da GDAL.
"""
import json, subprocess, sys, pathlib, tempfile
import numpy as np
from PIL import Image
from scipy import ndimage

# Clases
TIERRA, SECA, AGUA, PROFUNDA = 1, 2, 3, 4


def clasificar_paleta(pal):
    """Asigna clase a cada color de la paleta de la carta (0 = texto/línea, se rellena después)."""
    clases = {}
    for i in range(len(pal) // 3):
        r, g, b = pal[3 * i:3 * i + 3]
        c = 0
        if abs(r - g) < 6 and abs(g - b) < 6 and 175 <= r <= 185:
            c = TIERRA                      # gris urbano
        elif r > 240 and g > 240 and 180 <= b <= 225:
            c = TIERRA                      # amarillo pálido (tierra)
        elif g > 235 and r < 190 and b < 190 and r > 120:
            c = SECA                        # verde pálido (se seca / bañado)
        elif r < 175 and g > 235 and b > 240:
            c = AGUA                        # celeste (aguas someras)
        elif r > 160 and g > 160 and b > 240 and r < 190:
            c = AGUA                        # lavanda
        elif r > 248 and g > 248 and b > 248:
            c = PROFUNDA                    # blanco (más hondo / canal dragado)
        clases[i] = c
    return clases


def main(kap, w, s, e, n, salida):
    tmp = pathlib.Path(tempfile.mkdtemp())
    tif = tmp / "recorte.tif"
    subprocess.run(["gdalwarp", "-q", "-overwrite", "-t_srs", "EPSG:3857", "-te_srs", "EPSG:4326",
                    "-te", str(w), str(s), str(e), str(n), "-r", "near", "-dstnodata", "255", kap, str(tif)], check=True)
    info = json.loads(subprocess.run(["gdalinfo", "-json", str(tif)], capture_output=True, text=True, check=True).stdout)
    gt = info["geoTransform"]
    im = Image.open(tif)
    a = np.array(im)
    pal = im.getpalette()
    tabla = clasificar_paleta(pal)
    lut = np.zeros(256, dtype=np.uint8)
    for i, c in tabla.items():
        if i < 256:
            lut[i] = c
    cls = lut[a]
    fuera = (a == 255) if 255 not in tabla else np.zeros_like(cls, bool)

    # Cuadros blancos de leyenda sobre tierra: componente blanca rodeada mayormente de tierra -> tierra
    lab, nlab = ndimage.label(cls == PROFUNDA)
    if nlab:
        borde = ndimage.binary_dilation(cls == PROFUNDA, iterations=8) & (cls != PROFUNDA)
        H, Wd = cls.shape
        for k, sl in enumerate(ndimage.find_objects(lab), start=1):
            # trabajar solo en la caja de la componente (+8 px) para que sea rápido
            y0, y1 = max(sl[0].start - 8, 0), min(sl[0].stop + 8, H)
            x0, x1 = max(sl[1].start - 8, 0), min(sl[1].stop + 8, Wd)
            comp = lab[y0:y1, x0:x1] == k
            anillo = ndimage.binary_dilation(comp, iterations=8) & borde[y0:y1, x0:x1]
            vecinos = cls[y0:y1, x0:x1][anillo]
            vecinos = vecinos[vecinos > 0]
            # cuadro de leyenda (rectángulo lleno) o zona sin carta (toca el borde), rodeado de tierra -> tierra
            area = comp.sum()
            relleno = area / ((sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start))
            toca_borde = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == H or sl[1].stop == Wd
            mas_tierra = (vecinos == TIERRA).sum() > (vecinos == AGUA).sum()
            if mas_tierra and (relleno > 0.85 or toca_borde or area < 400):
                cls[y0:y1, x0:x1][comp] = TIERRA

    # Texto, números y líneas: se rellenan con la clase más cercana
    desconocido = cls == 0
    if desconocido.any():
        _, (iy, ix) = ndimage.distance_transform_edt(desconocido, return_indices=True)
        cls = cls[iy, ix]

    # Limpieza: filtro de moda 5x5 para sacar manchitas
    votos = np.stack([ndimage.uniform_filter((cls == c).astype(np.float32), size=5) for c in range(5)])
    cls = votos.argmax(axis=0).astype(np.uint8)
    cls[fuera] = 0

    # Guardar raster de clases con su georreferencia y poligonizar
    png = tmp / "clases.png"
    Image.fromarray(cls).save(png)
    (tmp / "clases.pgw").write_text("\n".join(map(str, [gt[1], gt[2], gt[4], gt[5], gt[0] + gt[1] / 2, gt[3] + gt[5] / 2])))
    clases_tif = tmp / "clases.tif"
    subprocess.run(["gdal_translate", "-q", "-a_srs", "EPSG:3857", "-a_nodata", "0", str(png), str(clases_tif)], check=True)
    sieved = tmp / "clases_s.tif"
    subprocess.run(["gdal", "raster", "sieve", "-q", "-s", "40", "-c", str(clases_tif), str(sieved)], check=True)
    poly = tmp / "poly.geojson"
    subprocess.run(["gdal", "raster", "polygonize", "-q", "-c", "--attribute-name", "clase",
                    "--output-layer", "zonas", "-f", "GeoJSON", str(sieved), str(poly)], check=True)
    pathlib.Path(salida).unlink(missing_ok=True)
    subprocess.run(["ogr2ogr", "-q", "-f", "GeoJSON", "-t_srs", "EPSG:4326", "-simplify", "6",
                    "-lco", "COORDINATE_PRECISION=6", "-where", "clase > 0", salida, str(poly)], check=True)
    d = json.load(open(salida))
    nombres = {TIERRA: "tierra", SECA: "seca", AGUA: "agua", PROFUNDA: "profunda"}
    for f in d["features"]:
        f["properties"] = {"z": nombres.get(f["properties"]["clase"], "?")}
    json.dump(d, open(salida, "w"), separators=(",", ":"))
    from collections import Counter
    print(salida, len(d["features"]), "polígonos", dict(Counter(f["properties"]["z"] for f in d["features"])))


if __name__ == "__main__":
    k, w, s, e, n, out = sys.argv[1:7]
    main(k, float(w), float(s), float(e), float(n), out)
