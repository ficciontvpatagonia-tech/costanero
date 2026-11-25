# Costanero (beta)

Carta simple del Río de la Plata interior y el Delta para celular y tablet: GPS con línea de rumbo, boyas UNEN, ruta del Canal Costanero por el centro de las boyas, alturas del río (SHN, Prefectura), pronóstico mareológico, olas y viento a 3 días.

**No reemplaza la carta náutica oficial, los avisos a los navegantes ni el plotter.**

- Sitio: carpeta `docs/` (GitHub Pages).
- `_scripts/actualizar_situacion.py` y `_scripts/chequear_unen.py` corren cada 30 min en GitHub Actions.
- Carta base: SHN H-118 y H-130 (ed. 2016) redibujadas (`_scripts/vectorizar_carta.py`, `_scripts/armar_carta.py`).
- Fuentes: Servicio de Hidrografía Naval, Prefectura Naval Argentina, UNEN, OpenStreetMap (ODbL), Open-Meteo.
