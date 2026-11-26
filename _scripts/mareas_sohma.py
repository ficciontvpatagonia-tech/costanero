#!/usr/bin/env python3
"""Tablas de mareas SOHMA 2026 (Colonia, Montevideo) → docs/datos/mareas_uy.json
Alturas horarias previstas (astronómicas, sin efecto del viento), hora oficial UY = UTC-3 (igual que Argentina).
Colonia: cm sobre el cero de la escala; el plano de reducción de la carta 52 está 10 cm arriba de ese cero.
Montevideo: cm sobre el plano de reducción (= cero de la escala = ex-Wharton)."""
import json, re, subprocess, pathlib
R = pathlib.Path(__file__).resolve().parent.parent; T = R / "_trabajo/mareas_uy"
MES = {m: i for i, m in enumerate(["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"], 1)}
out = {}
for puerto, archivo, corr in [("colonia", "COLONIA.pdf", -10), ("montevideo", "MONTEVIDEO.pdf", 0)]:
    txt = subprocess.run(["pdftotext", "-layout", str(T / archivo), "-"], capture_output=True, text=True).stdout
    mes = None; serie = {}
    for ln in txt.splitlines():
        m = re.search(r"\b(" + "|".join(MES) + r")\s+2026\b", ln)
        if m: mes = MES[m.group(1)]; continue
        m = re.match(r"^\s*(\d{1,2})((?:\s+-?\d{1,3}){24})\s*$", ln)
        if m and mes:
            v = [int(x) + corr for x in m.group(2).split()]
            serie[f"2026-{mes:02d}-{int(m.group(1)):02d}"] = v
    out[puerto] = {"unidad": "cm sobre el plano de reducción de sondas (hora UTC-3)", "serie": serie}
    print(puerto, len(serie), "días", list(serie)[:1], list(serie)[-1:])
out["fuente"] = "SOHMA, Tablas de Mareas 2026 (Publicación N° 3, 40ª ed.): predicción astronómica"
(R / "docs/datos/mareas_uy.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
print((R / "docs/datos/mareas_uy.json").stat().st_size // 1024, "KB")
