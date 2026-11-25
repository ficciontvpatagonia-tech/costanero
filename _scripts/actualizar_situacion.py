#!/usr/bin/env python3
"""Arma web/datos/situacion.json con la situación del río (lo corre el Action cada 30 min).

Fuentes oficiales:
  - SHN API alturas horarias: observada (últimas 12 h) + astronómica (hasta +8 h) por mareógrafo
  - SHN radioavisos Río de la Plata: pronóstico mareológico (pleamar/bajamar corregidas), olas Canal Costanero,
    novedades de balizamiento Canal Costanero
  - Prefectura Naval: alturas en Tigre, San Fernando, San Isidro, Buenos Aires (crece/baja, alerta, evacuación)

Si una fuente falla, se conserva lo último que se tenía de esa fuente (con su fecha) y se sigue con las demás.
"""
import json, re, html, datetime, pathlib, urllib.request

R = pathlib.Path(__file__).resolve().parent.parent
SALIDA = R / "docs" / "datos" / "situacion.json"
UA = {"User-Agent": "Mozilla/5.0 (app-nautica-rdp)"}
AR = datetime.timezone(datetime.timedelta(hours=-3))

ESTACIONES = {  # código SHN → nombre
    "PNOR": "Pilote Norden", "SFER": "San Fernando", "BSAS": "Buenos Aires", "MAGA": "Martín García", "LPLA": "La Plata",
}


def bajar(url, enc="utf-8"):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode(enc, errors="replace")


def texto(h):
    h = re.sub(r"<br[^>]*>|</p>|</tr>|</div>", "\n", h, flags=re.I)
    return html.unescape(re.sub(r"<[^>]+>", " ", h))


def mareografos():
    pagina = bajar("https://www.hidro.gob.ar/oceanografia/alturashorarias.asp")
    fecha = re.search(r'data-fecha="(\d{12})"', pagina).group(1)
    out = {}
    for cod, nombre in ESTACIONES.items():
        d = json.loads(bajar(f"https://www.hidro.gob.ar/api/v1/AlturasHorarias/{cod}/{fecha}"))
        out[cod] = {
            "nombre": nombre,
            "observada": [[x["fecha"], round(x["altura"], 2)] for x in d.get("lecturas", []) if x.get("altura") is not None],
            "astronomica": [[x["fecha"], round(x["altura"], 2)] for x in d.get("astronomica", []) if x.get("altura") is not None],
            "nota": d.get("observaciones", ""),
        }
    return out


def radioavisos():
    t = texto(bajar("https://www.hidro.gob.ar/nautica/RadioavisosNauticos.asp?op=10"))
    t = re.sub(r"[ \t]+", " ", t)
    res = {}
    # Pronóstico mareológico (el SHN cambia mayúsculas y tabulado entre boletines: parseo tolerante)
    m = re.search(r"PRON[OÓ]STICO MAREOL[OÓ]GICO(.*?)(?=RIO DE LA PLATA - \d|PERSPECTIVAS|$)", t, re.S | re.I)
    if m:
        sec = m.group(1)
        v = re.search(r"V[aá]lido desde[^\n]*", sec, re.I)
        res["pronostico_valido"] = v.group(0).strip() if v else ""
        txt = re.search(r"RIO DE LA PLATA INTERIOR:\s*(.*?)(?:Observaciones|Correcci)", sec, re.S | re.I)
        res["pronostico_interior"] = re.sub(r"\s+", " ", txt.group(1)).strip(" .-") if txt else ""
        ob = re.search(r"Observaciones\s*(.*?)Correcci", sec, re.S | re.I)
        res["observaciones"] = re.sub(r"\s+", " ", ob.group(1)).strip(" .-") if ob else ""
        interior = re.split(r"RIO DE LA PLATA EXTERIOR", sec, flags=re.I)[0]
        puertos, actual = {}, None
        nombres = {"PUERTO LA PLATA": "La Plata", "PUERTO DE BUENOS AIRES": "Buenos Aires", "SAN FERNANDO": "San Fernando"}
        for tok in re.finditer(r"(PUERTO LA PLATA|PUERTO DE BUENOS AIRES|SAN FERNANDO)|(PLEAMAR|BAJAMAR)\s+(\d\d/\d\d/\d{4})\s+(\d\d:\d\d)\s+([\d.]+)", interior, re.I):
            if tok.group(1):
                actual = nombres[tok.group(1).upper()]
            elif actual:
                puertos.setdefault(actual, []).append({"estado": tok.group(2).lower(), "fecha": tok.group(3), "hora": tok.group(4), "altura": float(tok.group(5))})
        res["pleamar_bajamar"] = puertos
    p = re.search(r"PERSPECTIVAS V[AÁ]LIDAS PARA EL ([\d/]+)\s*RIO DE LA PLATA INTERIOR:\s*(.*?)RIO DE LA PLATA EXTERIOR", t, re.S | re.I)
    if p:
        res["perspectiva"] = {"fecha": p.group(1), "texto": re.sub(r"\s+", " ", p.group(2)).strip(" .-")}
    # Olas Canal Costanero Km 17 (hoy y mañana)
    olas = []
    for fecha, bloque in re.findall(r"PRONOSTICO DE OLAS PARA EL RDP VALIDO PARA EL ([\d-]+)(.*?)(?=PRONOSTICO DE OLAS|ALTURA SIG)", t, re.S):
        o = re.search(r"CANAL COSTANERO\s*KM\. ?17\s+([\d.]+)\s+(\d+)\.?\s+([A-Z]+)\s+([\d.]+)\s+(\d+)\.?\s+([A-Z]+)", bloque)
        if o:
            olas.append({"fecha": fecha, "manana": {"alt": float(o.group(1)), "per": int(o.group(2)), "dir": o.group(3)},
                         "tarde": {"alt": float(o.group(4)), "per": int(o.group(5)), "dir": o.group(6)}})
    res["olas_costanero_km17"] = olas
    # Novedades de balizamiento del Canal Costanero (UNEN)
    b = re.search(r"\*\*BALIZAMIENTO UNEN - CANAL COSTANERO[^\n]*\n(.*?)\*\*", t, re.S)
    if b:
        res["avisos_costanero"] = [re.sub(r"\s+", " ", x).strip() for x in b.group(1).split("\n") if x.strip()]
    res["actualizado_shn"] = (re.search(r"Actualizado:\s*([\d/]+)", t) or [None, ""])[1]
    return res


def prefectura():
    h = bajar("https://contenidosweb.prefecturanaval.gob.ar/alturas/")
    out = {}
    for fila in re.findall(r"<tr.*?</tr>", h, re.S | re.I):
        c = [html.unescape(re.sub(r"<[^>]+>|\s+", " ", x)).strip() for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", fila, re.S | re.I)]
        if len(c) >= 12 and c[0] in ("TIGRE", "SAN FERNANDO", "SAN ISIDRO", "BUENOS AIRES"):
            num = lambda v: float(v) if re.fullmatch(r"-?[\d.]+", v) else None
            out[c[0].title()] = {"altura": num(c[2]), "variacion": num(c[3]), "fecha": c[5], "estado": c[6].lower(),
                                 "anterior": num(c[8]), "alerta": num(c[10]), "evacuacion": num(c[11])}
    return out


ZONAS_SMN = ("CAPITAL FEDERAL", "CIUDAD AUTONOMA", "CIUDAD AUTÓNOMA", "CABA", "SAN ISIDRO", "TIGRE", "SAN FERNANDO",
             "VICENTE LOPEZ", "VICENTE LÓPEZ", "ESCOBAR", "CAMPANA", "ZARATE", "ZÁRATE", "DELTA", "ISLAS", "RIO DE LA PLATA",
             "RÍO DE LA PLATA", "AVELLANEDA", "QUILMES", "AMBA", "CONURBANO", "GRAN BUENOS AIRES")


def smn_avisos():
    """Avisos meteorológicos a muy corto plazo del SMN (CAP/RSS, CC BY 4.0). Solo los que nombran nuestra zona."""
    t = bajar("https://ssl.smn.gob.ar/feeds/CAP/avisocortoplazo/rss_acpCAP.xml")
    out = []
    for item in re.findall(r"<item>(.*?)</item>", t, re.S):
        g = lambda tag: html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(rf"<{tag}>(.*?)</{tag}>", item, re.S) or [None, ""])[1])).strip()
        titulo, desc = g("title"), re.sub(r"<[^>]+>", " ", g("description"))
        if "NO SE HAN EMITIDO" in desc.upper():
            continue
        texto = (titulo + " " + desc).upper()
        out.append({"titulo": titulo, "texto": re.sub(r"\s+", " ", desc).strip()[:400], "fecha": g("pubDate"),
                    "link": g("link"), "zona": any(z in texto for z in ZONAS_SMN)})
    return out


def main():
    previo = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else {}
    sit = {"generado": datetime.datetime.now(AR).isoformat(timespec="minutes"), "errores": []}
    for clave, fn in (("mareografos", mareografos), ("radioavisos", radioavisos), ("prefectura", prefectura), ("smn", smn_avisos)):
        try:
            sit[clave] = fn()
            sit[clave + "_ok"] = sit["generado"]
        except Exception as e:  # conservar lo anterior de esa fuente
            sit["errores"].append(f"{clave}: {e}")
            sit[clave] = previo.get(clave)
            sit[clave + "_ok"] = previo.get(clave + "_ok")
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(sit, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("situacion.json listo;", "errores:", sit["errores"] or "ninguno")


if __name__ == "__main__":
    main()
