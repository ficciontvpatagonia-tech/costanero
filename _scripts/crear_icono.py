#!/usr/bin/env python3
"""Ícono de la app MS_Costanero: "MS" grande + canal (línea naranja entre boya roja y verde) sobre azul noche."""
import pathlib
from PIL import Image, ImageDraw, ImageFont
D = pathlib.Path(__file__).resolve().parent.parent / "docs"

def fuente(tam):
    for idx in range(12):
        try:
            f = ImageFont.truetype('/System/Library/Fonts/Avenir Next Condensed.ttc', tam, index=idx)
            if f.getname()[1] in ('Heavy', 'Bold'):
                return f
        except Exception:
            pass
    return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', tam, index=1)

def icono(S, redondeo=True):
    k = S / 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if redondeo: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(96 * k), fill='#0b2a3c')
    else: d.rectangle([0, 0, S, S], fill='#0b2a3c')
    d.text((S / 2, int(168 * k)), 'MS', font=fuente(int(220 * k)), fill='#ffffff', anchor='mm')
    d.line([(int(96 * k), int(446 * k)), (int(416 * k), int(316 * k))], fill='#ff7a00', width=max(2, int(15 * k)))
    def boya(cx, cy, color, tope):
        w = max(1, int(5 * k))
        d.polygon([(cx - int(30 * k), cy + int(46 * k)), (cx + int(30 * k), cy + int(46 * k)), (cx + int(22 * k), cy - int(18 * k)), (cx - int(22 * k), cy - int(18 * k))], fill=color, outline='#ffffff', width=w)
        if tope == 'cono': d.polygon([(cx - int(20 * k), cy - int(30 * k)), (cx + int(20 * k), cy - int(30 * k)), (cx, cy - int(64 * k))], fill=color, outline='#ffffff', width=w)
        else: d.rectangle([cx - int(17 * k), cy - int(62 * k), cx + int(17 * k), cy - int(30 * k)], fill=color, outline='#ffffff', width=w)
    boya(int(196 * k), int(336 * k), '#d7262e', 'cono')   # roja arriba-izquierda de la línea
    boya(int(336 * k), int(430 * k), '#14953d', 'cil')    # verde abajo-derecha
    return im

if __name__ == '__main__':
    print('fuente:', fuente(100).getname())
    for S in (192, 512): icono(S).save(D / f'icono-{S}.png')
    icono(512, False).save(D / 'icono-maskable-512.png')
    icono(180, False).convert('RGB').save(D / 'apple-touch-icon.png')
    prev = Image.new('RGB', (760, 560), '#dddddd')
    for img, xy in ((icono(512), (20, 24)), (icono(96), (580, 60)), (icono(64), (596, 200)), (icono(48), (604, 300))):
        prev.paste(img, xy, img)
    prev.save('/tmp/claude-501/icono_prev.png')
