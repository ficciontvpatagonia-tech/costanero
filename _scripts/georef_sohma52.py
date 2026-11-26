#!/usr/bin/env python3
"""Georreferencia la carta SOHMA 52 (Colonia, ed. 2019) con la grilla de 1' detectada en el escaneo.
Ajuste afín píxel → (lon, y Mercator); residuo en píxeles. Salida: _trabajo/sohma52/georef.json"""
import json, math, pathlib
import numpy as np
R = pathlib.Path(__file__).resolve().parent.parent
merc = lambda la: math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
lonm = lambda m: -(57 + m / 60)   # minutos de 57° W
latm = lambda m: -(34 + m / 60)
V = {900: {335: 57, 663: 56, 1319: 54, 1647: 53, 1975: 52, 2303: 51},
     1900: {331: 57, 659: 56, 987: 55, 1315: 54, 1644: 53, 1972: 52, 2300: 51, 2629: 50, 2957: 49, 3286: 48, 3615: 47, 3943: 46, 4600.3: 44},
     2450: {657: 56, 985: 55, 1313: 54, 1641: 53, 2297.6: 51, 2626: 50, 2955: 49, 3284: 48, 3613: 47, 3941: 46, 4269: 45, 4598: 44}}
Hh = {300: {278: 25, 676: 26, 1468: 28, 1865: 29, 2264: 30, 2661: 31, 3057: 32},
      2150: {1077: 27, 1472: 28, 1869: 29, 2268: 30, 3061: 32},
      4450: {1082: 27, 1477: 28, 2273: 30, 2670: 31, 3066: 32}}
filasL, vL, filasM, vM = [], [], [], []
for y, d in V.items():
    for x, m in d.items(): filasL.append([1, x, y]); vL.append(math.radians(lonm(m)))
for x, d in Hh.items():
    for y, m in d.items(): filasM.append([1, x, y]); vM.append(merc(latm(m)))
a, *_ = np.linalg.lstsq(np.array(filasL), np.array(vL), rcond=None)
b, *_ = np.linalg.lstsq(np.array(filasM), np.array(vM), rcond=None)
rl = (np.array(filasL) @ a - vL) / a[1]; rm = (np.array(filasM) @ b - vM) / b[2]
print("residuo px lon max %.2f  lat max %.2f" % (abs(rl).max(), abs(rm).max()))
print("m por px ≈ %.2f" % (abs(a[1]) * 6378137 * math.cos(math.radians(34.47))))
json.dump({"a": a.tolist(), "b": b.tolist(), "nota": "lon_rad = a·[1,x,y]; mercY = b·[1,x,y]"}, open(R / "_trabajo/sohma52/georef.json", "w"))
def pix2ll(x, y):
    lo = math.degrees(a @ [1, x, y]); m = b @ [1, x, y]
    return math.degrees(2 * math.atan(math.exp(m)) - math.pi / 2), lo
print("esquina SO del marco (96,3177) →", pix2ll(96, 3177), " (rotulado 34°32'18\"S 57°57'42\"W = ", -(34 + 32 / 60 + 18 / 3600), -(57 + 57 / 60 + 42 / 3600), ")")
