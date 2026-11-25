/* Costanero · carta simple del Río de la Plata interior y Delta
   Todo en WGS84 (lat/lon). Leaflet dibuja en Web Mercator: una sola proyección para todas las capas. */
{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };

/* ---------- Formatos náuticos ---------- */
const fmtLat = lat => { const a = Math.abs(lat), g = Math.floor(a), m = (a - g) * 60; return `${g}°${m.toFixed(3).replace('.', ',')}' ${lat < 0 ? 'S' : 'N'}`; };
const fmtLon = lon => { const a = Math.abs(lon), g = Math.floor(a), m = (a - g) * 60; return `${String(g).padStart(3, '0')}°${m.toFixed(3).replace('.', ',')}' ${lon < 0 ? 'W' : 'E'}`; };
const R_T = 6371000;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function distM(a, b) { const dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng); const h = Math.sin(dLa/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLo/2)**2; return 2*R_T*Math.asin(Math.sqrt(h)); }
function rumbo(a, b) { const y = Math.sin(rad(b.lng-a.lng))*Math.cos(rad(b.lat)); const x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lng-a.lng)); return (deg(Math.atan2(y, x)) + 360) % 360; }
const fmtDist = m => m < 1852 * 0.5 ? `${Math.round(m)} m` : `${(m / 1852).toFixed(2).replace('.', ',')} MN`;
const fmtRumbo = r => `${String(Math.round(r) % 360).padStart(3, '0')}°`;
const num = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toFixed(d).replace('.', ',');

/* ---------- Mapa ---------- */
const mapa = L.map('mapa', { zoomControl: false, preferCanvas: true, minZoom: 11, maxZoom: 17,
  rotate: true, bearing: 0, touchRotate: false, shiftKeyRotate: false, rotateControl: false,
  maxBounds: [[-34.72, -58.66], [-34.08, -58.06]], maxBoundsViscosity: 0.8, attributionControl: true }).setView([-34.47, -58.47], 13);
L.control.zoom({ position: 'bottomright' }).addTo(mapa);
// Con mapa girable: capas de dibujo dentro del panel que gira; etiquetas en el que no gira (texto siempre derecho)
const panelGira = mapa.getPane('rotatePane'), panelFijo = mapa.getPane('norotatePane');
const nuevoPanel = (nombre, z, fijo) => { const p = mapa.createPane(nombre, (fijo ? panelFijo : panelGira) || undefined); p.style.zIndex = z; return p; };
mapa.attributionControl.setPrefix('').addAttribution('Carta: SHN H‑118 · Boyas: UNEN · Ríos: © OpenStreetMap');
const renderer = L.canvas({ padding: 0.3 });
nuevoPanel('carta', 200);
nuevoPanel('grilla', 300);
nuevoPanel('ruta', 390);
// Cada capa con su propio lienzo: si no, la carta (opaca) tapa la grilla y la ruta
const lienzoCarta = L.canvas({ pane: 'carta', padding: 0.8 }), lienzoGrilla = L.canvas({ pane: 'grilla', padding: 0.8 });
nuevoPanel('etiquetas', 420, true);

// Colores de carta (estándar de plotter). Día y noche: se eligen según el modo del teléfono.
const PALETA = {
  dia:   { agua: '#7cc6ec', profunda: '#eef7fc', seca: '#a8d08d', tierra: '#f2df6b', borde: '#00000040', grilla: '#c2188f' },
  noche: { agua: '#1d4f6e', profunda: '#2f6b8d', seca: '#3f5a33', tierra: '#4d4726', borde: '#ffffff30', grilla: '#e05bb7' },
};
const oscuro = matchMedia('(prefers-color-scheme: dark)');
const modo = () => { const t = document.documentElement.dataset.theme; return t === 'dark' ? 'noche' : t === 'light' ? 'dia' : oscuro.matches ? 'noche' : 'dia'; };
const col = k => PALETA[modo()][k];
let capasCarta = [];
const estiloZona = f => ({ stroke: f.properties.z === 'tierra' || f.properties.z === 'seca', color: col('borde'), weight: 0.6,
  fillColor: col(f.properties.z) || col('agua'), fillOpacity: 1 });
nuevoPanel('tierra', 260); // la tierra siempre arriba del degradé y del rayado
const lienzoTierra = L.canvas({ pane: 'tierra', padding: 0.8 });
fetch('datos/carta.geojson').then(r => r.json()).then(gj => {
  const esTierra = f => f.properties.z === 'tierra' || f.properties.z === 'seca';
  capasCarta.push(L.geoJSON(gj, { pane: 'carta', renderer: lienzoCarta, interactive: false, style: estiloZona, filter: f => !esTierra(f) }).addTo(mapa));
  capasCarta.push(L.geoJSON(gj, { pane: 'tierra', renderer: lienzoTierra, interactive: false, style: estiloZona, filter: esTierra }).addTo(mapa));
}).catch(() => {});
oscuro.addEventListener('change', () => { capasCarta.forEach(c => c.setStyle(estiloZona)); if (typeof dibujarNoPasa === 'function') dibujarNoPasa(); document.getElementById('mapa').style.background = col('agua'); dibujarGrilla(); });
document.getElementById('mapa').style.background = col('agua');

/* ---------- Grilla de latitud y longitud ---------- */
const grilla = L.layerGroup().addTo(mapa);
function dibujarGrilla() {
  grilla.clearLayers();
  const z = mapa.getZoom(), b = mapa.getBounds().pad(0.1);
  const paso = z >= 15 ? 0.5 : z >= 13 ? 1 : z >= 11 ? 5 : 10; // minutos
  const p = paso / 60, cg = col('grilla');
  for (let la = Math.floor(b.getSouth() / p) * p; la <= b.getNorth(); la += p) {
    L.polyline([[la, b.getWest()], [la, b.getEast()]], { pane: 'grilla', color: cg, weight: 0.7, opacity: 0.55, interactive: false, renderer: lienzoGrilla }).addTo(grilla);
    L.marker([la, mapa.getBounds().getWest()], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: 'grat', html: esc(fmtLat(la).replace(/,000'/, "'")), iconAnchor: [-4, 18] }) }).addTo(grilla);
  }
  for (let lo = Math.floor(b.getWest() / p) * p; lo <= b.getEast(); lo += p) {
    L.polyline([[b.getSouth(), lo], [b.getNorth(), lo]], { pane: 'grilla', color: cg, weight: 0.7, opacity: 0.55, interactive: false, renderer: lienzoGrilla }).addTo(grilla);
    L.marker([mapa.getBounds().getSouth(), lo], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: 'grat', html: esc(fmtLon(lo).replace(/,000'/, "'")), iconAnchor: [-4, 44] }) }).addTo(grilla);
  }
}
mapa.on('moveend zoomend', dibujarGrilla); dibujarGrilla();

/* ---------- Ríos y lugares ---------- */
const etRios = L.layerGroup();
const merc = lat => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
fetch('datos/rios.geojson').then(r => r.json()).then(gj => {
  const porNombre = {};
  for (const f of gj.features) { const n = f.properties.nombre; const c = f.geometry.coordinates; if (!porNombre[n] || c.length > porNombre[n].length) porNombre[n] = c; }
  for (const [n, c] of Object.entries(porNombre)) {
    const i = Math.floor(c.length / 2), a = c[Math.max(i - 2, 0)], b = c[Math.min(i + 2, c.length - 1)];
    let ang = deg(Math.atan2(-(merc(b[1]) - merc(a[1])), rad(b[0] - a[0])));
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const corto = n.replace(/^Río /, 'Río ').replace('Río de la Reconquista', 'Río Reconquista');
    L.marker([c[i][1], c[i][0]], { pane: 'etiquetas', interactive: false,
      icon: L.divIcon({ className: '', html: `<div class="et-rio" style="transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">${esc(corto)}</div>`, iconSize: [0, 0] }) }).addTo(etRios);
  }
});
const LUGARES = [ // posiciones de referencia para nombres (no son puntos de navegación)
  ['San Isidro', -34.4715, -58.5135], ['Olivos', -34.5085, -58.4865], ['Núñez', -34.5440, -58.4610], ['Tigre', -34.4230, -58.5800],
  ['San Fernando', -34.4420, -58.5560], ['Buenos Aires', -34.6040, -58.3900], ['Isla Martín García', -34.1760, -58.2560],
];
const etLugares = L.layerGroup(LUGARES.map(([n, la, lo]) => L.marker([la, lo], { pane: 'etiquetas', interactive: false,
  icon: L.divIcon({ className: '', html: `<div class="et-lugar" style="transform:translate(-50%,-50%)">${esc(n)}</div>`, iconSize: [0, 0] }) })));
const etRdlp = L.marker([-34.42, -58.30], { pane: 'etiquetas', interactive: false,
  icon: L.divIcon({ className: '', html: '<div class="et-grande" style="transform:translate(-50%,-50%)">Río de la Plata</div>', iconSize: [0, 0] }) });
function etiquetasSegunZoom() {
  const z = mapa.getZoom();
  z >= 12 ? etRios.addTo(mapa) : etRios.remove();
  z >= 11 ? etLugares.addTo(mapa) : etLugares.remove();
  z <= 12 ? etRdlp.addTo(mapa) : etRdlp.remove();
  z >= 15 ? etBoyas.addTo(mapa) : etBoyas.remove();
}

/* ---------- Boyas (posición UNEN manda) ---------- */
const capaBoyas = L.layerGroup().addTo(mapa), etBoyas = L.layerGroup(), etDestacadas = L.layerGroup().addTo(mapa);
// Referencias importantes: nombre siempre visible, a cualquier zoom
const DESTACADAS = ['DON ALEJANDRO', 'NORMA MABEL', 'UNEN A', 'UNEN B'];
const nombreLindo = n => n.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
function tipoBoya(b) {
  const t = `${b.name} ${b.funcType || ''} ${b.structure || ''}`.toUpperCase();
  if (/CARDINAL\s+(NORTE|SUR|ESTE|OESTE)|CARDINAL\s+(N|S|E|W)\b/.test(t)) return { k: 'card', d: (t.match(/CARDINAL\s+(NORTE|SUR|ESTE|OESTE)/) || [, 'ESTE'])[1][0].replace('O', 'W') };
  if (/BIFURCA|PREFERIDO/.test(t)) return { k: 'bif' };
  if (/PELIGRO/.test(t)) return { k: 'peligro' };
  if (/AGUAS SEGURAS/.test(t)) return { k: 'segura' };
  if (/ESPECIAL|MAREÓGRAFO|AMARILLA/.test(t)) return { k: 'especial' };
  if (/ROJ/.test(t)) return { k: 'roja' };
  if (/VERDE/.test(t)) return { k: 'verde' };
  return { k: 'especial' };
}
function iconoBoya(tp) {
  const R = '#d7262e', G = '#14953d', Y = '#f2c400', K = '#1a1a1a', W = '#ffffff';
  let cuerpo = '';
  if (tp.k === 'roja') cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${R}" stroke="${K}"/><path d="M9 8h6l-3-6z" fill="${R}" stroke="${K}"/>`;
  else if (tp.k === 'verde') cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${G}" stroke="${K}"/><rect x="9" y="4" width="6" height="6" fill="${G}" stroke="${K}"/>`;
  else if (tp.k === 'bif') cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${R}" stroke="${K}"/><rect x="7.6" y="17" width="8.8" height="3" fill="${G}"/><path d="M9 8h6l-3-6z" fill="${R}" stroke="${K}"/>`;
  else if (tp.k === 'peligro') cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${K}"/><rect x="7.6" y="17" width="8.8" height="3.4" fill="${R}"/><circle cx="12" cy="4" r="2.2" fill="${K}"/><circle cx="12" cy="9" r="2.2" fill="${K}"/>`;
  else if (tp.k === 'segura') cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${R}" stroke="${K}"/><path d="M10.5 12v14M13.5 12v14" stroke="${W}" stroke-width="1.6"/><circle cx="12" cy="7" r="3" fill="${R}" stroke="${K}"/>`;
  else if (tp.k === 'card') { const arriba = tp.d === 'N' || tp.d === 'E', abajo = tp.d === 'S' || tp.d === 'E';
    cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${Y}" stroke="${K}"/><rect x="7.6" y="${tp.d==='S'?19:12}" width="8.8" height="${tp.d==='E'||tp.d==='W'?4:7}" fill="${K}"/>`
      + `<path d="${arriba ? 'M8 9l4-6 4 6z' : 'M8 3l4 6 4-6z'}" fill="${K}"/>` + (tp.d === 'E' || tp.d === 'W' ? `<path d="${abajo ? 'M8 11l4-6' : 'M8 5l4 6'}" fill="none"/>` : '') ; }
  else cuerpo = `<path d="M7 26h10l-1.5-14h-7z" fill="${Y}" stroke="${K}"/><path d="M8.5 6l7 5M15.5 6l-7 5" stroke="${Y}" stroke-width="2.2"/>`;
  return L.divIcon({ className: '', iconSize: [24, 30], iconAnchor: [12, 26], popupAnchor: [0, -24],
    html: `<svg width="24" height="30" viewBox="0 0 24 30" aria-hidden="true"><circle cx="12" cy="26" r="1.6" fill="#000"/>${cuerpo}</svg>` });
}
const NOMBRE_TIPO = { roja: 'Lateral roja (estribor entrando)', verde: 'Lateral verde (babor entrando)', bif: 'Bifurcación de canal', peligro: 'Peligro aislado', segura: 'Aguas seguras', card: 'Cardinal', especial: 'Especial' };
let boyas = [], posGps = null;
function popupBoya(b, tp) {
  const p = L.latLng(b.lat, b.lon);
  const desde = posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(distM(posGps, p))}</p>` : '';
  return `<h3>${esc(b.name)}</h3><p>${esc(NOMBRE_TIPO[tp.k] + (tp.d ? ' ' + tp.d : ''))}${b.funcType ? ' · ' + esc(b.funcType) : ''}</p>`
    + (b.characteristics ? `<p>Luz: ${esc(b.characteristics)}</p>` : '')
    + `<p style="font-variant-numeric:tabular-nums">${esc(fmtLat(b.lat))}<br>${esc(fmtLon(b.lon))}</p>`
    + `<p class="nota">Estado UNEN: ${esc(b.status || '—')} · posición UNEN ${esc(boyasFecha)}</p>${desde}`;
}
let boyasFecha = '';
fetch('datos/boyas.json').then(r => r.json()).then(d => {
  boyasFecha = d.archivo_modificado ? new Date(d.archivo_modificado).toLocaleDateString('es-AR') : (d.descargado || '');
  boyas = d.boyas.filter(b => typeof b.lat === 'number' && typeof b.lon === 'number');
  for (const b of boyas) {
    const tp = tipoBoya(b);
    L.marker([b.lat, b.lon], { icon: iconoBoya(tp), title: b.name, keyboard: true }).bindPopup(() => popupBoya(b, tp)).addTo(capaBoyas);
    const destacada = DESTACADAS.includes(b.name.toUpperCase());
    L.marker([b.lat, b.lon], { pane: 'etiquetas', interactive: false,
      icon: L.divIcon({ className: '', html: `<div class="${destacada ? 'et-boya et-destacada' : 'et-boya'}" style="transform:translate(12px,-22px)">${esc(destacada ? nombreLindo(b.name) : b.name.replace(/\s*\((Roja|Verde)\)/i, ''))}</div>`, iconSize: [0, 0] }) }).addTo(destacada ? etDestacadas : etBoyas);
  }
  etiquetasSegunZoom();
  dibujarRuta();
  armarCorredor(); dibujarNoPasa(); dibujarPasoMitre();
});
mapa.on('zoomend', etiquetasSegunZoom);

/* ---------- Capa dinámica "no pasás": profundidad de carta + altura actual del río < calado + margen ---------- */
const MARGEN = 0.30; // m bajo la quilla
const GRAD = { dia: [[86, 172, 226], [246, 251, 255]], noche: [[18, 58, 92], [52, 110, 140]] }; // somero → hondo
let prof = null, capaNoPasa = null;
const LAT_SF = -34.44, LAT_BA = -34.58;
function alturaRio(lat) { // interpola San Fernando ↔ Buenos Aires por latitud; sin dato: 0 (cero de la carta, conservador)
  const m = sit && sit.mareografos, sf = m && ultimo(m.SFER && m.SFER.observada), ba = m && ultimo(m.BSAS && m.BSAS.observada);
  const hs = sf ? sf[1] : (ba ? ba[1] : 0), hb = ba ? ba[1] : hs;
  const t = Math.min(Math.max((lat - LAT_SF) / (LAT_BA - LAT_SF), 0), 1);
  return hs + (hb - hs) * t;
}
function profCarta(lat, lon) { // bilineal, null si no hay dato
  if (!prof) return null;
  const fx = (lon - prof.w) / (prof.e - prof.w) * prof.cols - 0.5, fy = (prof.n - lat) / (prof.n - prof.s) * prof.rows - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy); if (x0 < 0 || y0 < 0 || x0 + 1 >= prof.cols || y0 + 1 >= prof.rows) return null;
  const g = (x, y) => prof.q[y * prof.cols + x];
  const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
  if (a === -128 || b === -128 || c === -128 || d === -128) return null;
  const tx = fx - x0, ty = fy - y0;
  return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) / 10;
}
// Corredor del Canal Costanero entre las boyas UNEN (rojas de un lado, verdes del otro): ahí manda la determinante
let corredor = null;
function armarCorredor() {
  const B = Object.fromEntries(boyas.map(b => [b.name, b]));
  const rojas = ['KM 24 (Roja)', 'KM 23', 'KM 22 ROJA', 'KM 21 ROJO', 'KM 20.2 ROJA', 'KM 19.3 EX C1'].map(n => B[n]).filter(Boolean);
  const verdes = ['KM 24 (Verde)', 'KM 23 VERDE', 'KM 22 VERDE', 'KM 21 VERDE', 'KM 20.2 VERDE EX C2', 'KM 19.3 EX C1'].map(n => B[n]).filter(Boolean);
  corredor = rojas.length > 2 && verdes.length > 2 ? [...rojas, ...verdes.reverse()].map(b => [b.lon, b.lat]) : null;
}
function enCorredor(lon, lat) {
  if (!corredor) return false;
  let dentro = false;
  for (let i = 0, j = corredor.length - 1; i < corredor.length; j = i++) {
    const [xi, yi] = corredor[i], [xj, yj] = corredor[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
// Capa con trama: un <div> con rayado CSS (tamaño fijo en pantalla) recortado por una máscara georreferenciada
const CapaTrama = L.ImageOverlay.extend({
  _initImage() {
    const el = this._image = L.DomUtil.create('div', 'capa-trama leaflet-image-layer' + (this._zoomAnimated ? ' leaflet-zoom-animated' : ''));
    el.style.maskImage = el.style.webkitMaskImage = `url(${this._url})`;
    el.style.maskSize = el.style.webkitMaskSize = '100% 100%';
    el.style.maskRepeat = el.style.webkitMaskRepeat = 'no-repeat';
  },
  setUrl(url) { this._url = url; if (this._image) this._image.style.maskImage = this._image.style.webkitMaskImage = `url(${url})`; return this; },
});
let capaGrad = null;
function dibujarNoPasa() {
  if (!prof) return;
  const umbral = (parseFloat(calado.value) || 0) + MARGEN;
  const ESC = 6, Wc = prof.cols * ESC, Hc = prof.rows * ESC;
  const cvG = document.createElement('canvas'), cvM = document.createElement('canvas'); cvG.width = cvM.width = Wc; cvG.height = cvM.height = Hc;
  const gG = cvG.getContext('2d'), gM = cvM.getContext('2d'), imG = gG.createImageData(Wc, Hc), imM = gM.createImageData(Wc, Hc), pg = imG.data, pm = imM.data;
  const yN = merc(prof.n), yS = merc(prof.s), A = GRAD[modo()];
  for (let r = 0; r < Hc; r++) {
    // fila en Mercator → latitud real (misma proyección que el mapa: sin corrimientos)
    const lat = deg(2 * Math.atan(Math.exp(yN - (yN - yS) * (r + 0.5) / Hc)) - Math.PI / 2), h = alturaRio(lat);
    for (let c = 0; c < Wc; c++) {
      const lon = prof.w + (prof.e - prof.w) * (c + 0.5) / Wc;
      let z = profCarta(lat, lon);
      if (z === null) continue;
      if (z < DETERMINANTE && lat > -34.475 && lat < -34.445 && lon > -58.505 && lon < -58.465 && enCorredor(lon, lat)) z = DETERMINANTE;
      const i = (r * Wc + c) * 4, dAhora = z + h;
      if (dAhora < umbral) { pm[i + 3] = 255; } // máscara "no pasás"
      if (z > -0.05) { // degradé tipo plotter: azul donde hay poca agua → blanco donde sobra
        const t = Math.min(Math.max((dAhora - umbral) / 3, 0), 1);
        pg[i] = A[0][0] + (A[1][0] - A[0][0]) * t; pg[i + 1] = A[0][1] + (A[1][1] - A[0][1]) * t; pg[i + 2] = A[0][2] + (A[1][2] - A[0][2]) * t; pg[i + 3] = 255;
      }
    }
  }
  gG.putImageData(imG, 0, 0); gM.putImageData(imM, 0, 0);
  const b = [[prof.s, prof.w], [prof.n, prof.e]];
  if (!capaGrad) {
    nuevoPanel('gradiente', 240); nuevoPanel('nopasa', 250);
    capaGrad = L.imageOverlay(cvG.toDataURL(), b, { pane: 'gradiente', interactive: false }).addTo(mapa);
    capaNoPasa = new CapaTrama(cvM.toDataURL(), b, { pane: 'nopasa', interactive: false }).addTo(mapa);
  } else { capaGrad.setUrl(cvG.toDataURL()); capaNoPasa.setUrl(cvM.toDataURL()); }
  const hSF = alturaRio(LAT_SF), hBA = alturaRio(LAT_BA);
  const ley = document.getElementById('leyNoPasa');
  if (ley) ley.textContent = `Rayado negro = ahora no pasás con ${num(parseFloat(calado.value) || 0)} m de calado (+${num(MARGEN)} m de margen). Río: San Fernando ${num(hSF)} m, Buenos Aires ${num(hBA)} m.`;
}
fetch('datos/profundidad.json').then(r => r.json()).then(d => {
  const bin = atob(d.b64), q = new Int8Array(bin.length); for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
  prof = { ...d, q }; dibujarNoPasa();
}).catch(() => {});

/* ---------- Veriles oficiales de los canales troncales (Emilio Mitre, Paraná de las Palmas…) ---------- */
fetch('datos/veriles.json').then(r => r.json()).then(v => {
  const capa = L.layerGroup().addTo(mapa);
  const info = '<h3>Canal troncal (Emilio Mitre / Paraná de las Palmas)</h3><p>Límites oficiales del canal (veriles) según Vías Navegables / AGP. Canal de buques: cruzarlo rápido y en perpendicular, con vigilancia de buques; no navegar a lo largo.</p>';
  for (const t of v.rojo) L.polyline(t.map(p => [p[1], p[0]]), { pane: 'ruta', color: '#d7262e', weight: 2.5, dashArray: '8 5', opacity: 0.9 }).bindPopup(info).addTo(capa);
  for (const t of v.verde) L.polyline(t.map(p => [p[1], p[0]]), { pane: 'ruta', color: '#14953d', weight: 2.5, dashArray: '8 5', opacity: 0.9 }).bindPopup(info).addTo(capa);
}).catch(() => {});

/* ---------- Clubes y amarras (OpenStreetMap) ---------- */
const capaClubes = L.layerGroup(), etClubes = L.layerGroup();
const iconoClub = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10],
  html: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#0b2a3c" stroke="#fff" stroke-width="1.5"/><path d="M11 5v11M7.5 8h7M6 12.5c1 2.6 3 3.6 5 3.6s4-1 5-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="11" cy="5" r="1.4" fill="#fff"/></svg>' });
fetch('datos/clubes.json').then(r => r.json()).then(d => {
  for (const c of d.clubes) {
    const p = L.latLng(c.lat, c.lon);
    L.marker(p, { icon: iconoClub, title: c.n }).bindPopup(() => `<h3>${esc(c.n)}</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(c.lat))}<br>${esc(fmtLon(c.lon))}</p>${posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(distM(posGps, p))}</p>` : ''}<p class="nota">Ubicación aproximada del club o amarra (OpenStreetMap), no de su canal de acceso.</p>`).addTo(capaClubes);
    L.marker(p, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-club" style="transform:translate(14px,-50%)">${esc(c.n)}</div>`, iconSize: [0, 0] }) }).addTo(etClubes);
  }
  clubesSegunZoom();
}).catch(() => {});
function clubesSegunZoom() { const z = mapa.getZoom(); z >= 12 ? capaClubes.addTo(mapa) : capaClubes.remove(); z >= 14 ? etClubes.addTo(mapa) : etClubes.remove(); }
mapa.on('zoomend', clubesSegunZoom);

/* ---------- Referencias propias (no están en UNEN): El Marciano ---------- */
fetch('datos/referencias.json').then(r => r.json()).then(d => {
  for (const r of d.referencias) {
    const p = L.latLng(r.lat, r.lon);
    L.marker(p, { icon: iconoBoya({ k: r.tipo || 'peligro' }), title: r.n }).bindPopup(() => `<h3>${esc(r.n)}</h3><p>${esc(r.nota)}</p><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(r.lat))}<br>${esc(fmtLon(r.lon))}</p>${posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(distM(posGps, p))}</p>` : ''}<p class="nota">${esc(r.fuente)}</p>`).addTo(capaBoyas);
    L.marker(p, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-boya et-destacada" style="transform:translate(12px,-22px)">${esc(r.n)}</div>`, iconSize: [0, 0] }) }).addTo(etDestacadas);
  }
}).catch(() => {});

/* ---------- Ruta segura del Canal Costanero: centro de cada par de boyas UNEN (se recalcula sola si UNEN mueve una boya) ---------- */
const PARES_COSTANERO = [
  ['Km 24', ['KM 24 (Roja)', 'KM 24 (Verde)']], ['Km 23', ['KM 23', 'KM 23 VERDE']], ['Km 22', ['KM 22 ROJA', 'KM 22 VERDE']],
  ['Km 21', ['KM 21 ROJO', 'KM 21 VERDE']], ['Km 20,2', ['KM 20.2 ROJA', 'KM 20.2 VERDE EX C2']], ['Km 19,3 (espeque aguas seguras)', ['KM 19.3 EX C1']],
];
const capaRuta = L.layerGroup().addTo(mapa);
function dibujarRuta() {
  capaRuta.clearLayers();
  const porNombre = Object.fromEntries(boyas.map(b => [b.name, b]));
  const pts = [];
  for (const [n, nombres] of PARES_COSTANERO) {
    const bs = nombres.map(x => porNombre[x]).filter(Boolean);
    if (bs.length !== nombres.length) continue; // si UNEN saca una boya, ese punto no se dibuja
    pts.push({ n, lat: bs.reduce((a, b) => a + b.lat, 0) / bs.length, lon: bs.reduce((a, b) => a + b.lon, 0) / bs.length });
  }
  if (pts.length < 2) return;
  const info = `<h3>Ruta Canal Costanero</h3><p>Pasa por el centro de cada par de boyas, según las posiciones de UNEN del ${esc(boyasFecha)}. Se recalcula sola cuando UNEN mueve una boya.</p><p><strong>Mínimo 1,20 m</strong> entre Km 20,2 y Km 19,3 (más la altura del río). Mirá el semáforo.</p><p class="nota">No reemplaza la carta ni los avisos a los navegantes.</p>`;
  L.polyline(pts.map(p => [p.lat, p.lon]), { pane: 'ruta', color: '#ff7a00', weight: 4, opacity: 0.95 }).bindPopup(info).addTo(capaRuta);
  for (const p of pts) L.circleMarker([p.lat, p.lon], { pane: 'ruta', radius: 5, color: '#ff7a00', fillColor: '#fff', fillOpacity: 1, weight: 2 })
    .bindPopup(() => `<h3>${esc(p.n)}</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(p.lat))}<br>${esc(fmtLon(p.lon))}</p>${posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, L.latLng(p.lat, p.lon)))} · ${fmtDist(distM(posGps, L.latLng(p.lat, p.lon)))}</p>` : ''}<p class="nota">Centro entre boyas UNEN (${esc(boyasFecha)})</p>`).addTo(capaRuta);
}

/* ---------- Pasos seguros del Canal Emilio Mitre ----------
   Principal: cruzar a la altura del Km 25,2 y seguir a UNEN B → UNEN A (entre las zonas de refulado).
   Alternativa: cruce por el Km 13,6–14, frente al Puerto de Buenos Aires.
   UNEN A y B se toman de las posiciones UNEN (si se mueven, el paso se corrige solo). */
function etiquetaPaso(latlng, texto) {
  L.marker(latlng, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-boya et-destacada" style="transform:translate(10px,-50%);border-left-color:#ff7a00">${esc(texto)}</div>`, iconSize: [0, 0] }) }).addTo(capaRuta);
}
function dibujarPasoMitre() {
  fetch('datos/pasos_mitre.json').then(r => r.json()).then(P => {
    const B = Object.fromEntries(boyas.map(b => [b.name, b])), a = B['UNEN A'], b = B['UNEN B'];
    const nota = '<p>Cruzar el canal troncal rápido y en perpendicular, atento al tráfico de buques.</p><p class="nota">Referencia: rutas del Club de Veleros Piedrabuena (2026); límites del canal: Vías Navegables. No reemplaza la carta.</p>';
    if (a && b) {
      const pts = [P.principal.km252, [b.lat, b.lon], [a.lat, a.lon]];
      L.polyline(pts, { pane: 'ruta', color: '#ff7a00', weight: 4, opacity: 0.95, dashArray: '10 6' })
        .bindPopup(`<h3>${esc(P.principal.nombre)}</h3><p>${esc(P.principal.nota)}</p><p>UNEN B y UNEN A: posiciones UNEN ${esc(boyasFecha)}.</p>${nota}`).addTo(capaRuta);
      L.circleMarker(P.principal.km252, { pane: 'ruta', radius: 5, color: '#ff7a00', fillColor: '#fff', fillOpacity: 1, weight: 2 })
        .bindPopup(`<h3>Cruce Km 25,2</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(P.principal.km252[0]))}<br>${esc(fmtLon(P.principal.km252[1]))}</p><p>~50 m al SW de la boya verde del Km 25,2 (Club Piedrabuena 2026).</p>`).addTo(capaRuta);
      etiquetaPaso([(b.lat + a.lat) / 2, (b.lon + a.lon) / 2], 'Paso seguro Mitre (Km 25,2)');
    }
    const al = P.alternativa;
    L.polyline(al.cruce, { pane: 'ruta', color: '#ff7a00', weight: 4, opacity: 0.85, dashArray: '4 6' })
      .bindPopup(`<h3>${esc(al.nombre)}</h3><p>${esc(al.nota)}</p>${nota}`).addTo(capaRuta);
    etiquetaPaso(al.cruce[1], 'Cruce alternativo Km 14');
  }).catch(() => {});
}

/* ---------- GPS ---------- */
let marcaBarco = null, precision = null, seguir = leer('seguir', false), watchId = null;
const iconoBarco = rumboDeg => L.divIcon({ // en pantalla: rumbo real + giro del mapa
  _r: 0, className: 'barco', iconSize: [30, 30], iconAnchor: [15, 15],
  html: `<svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(${((rumboDeg || 0) + (mapa.getBearing ? mapa.getBearing() : 0)) % 360}deg)"><path d="M15 2l7 22-7-5-7 5z" fill="#c2188f" stroke="#fff" stroke-width="2"/></svg>` });
/* Línea de rumbo (COG) como en un plotter: largo = distancia que se recorre en N minutos a la velocidad actual */
let lineaRumbo = null, finRumbo = null, ultFix = null, cogCalc = null, sogCalc = null;
const minutosRumbo = () => parseInt(leer('minRumbo', 10), 10);
function destino(p, rumboDeg, m) { // punto a m metros con rumbo dado (distancias cortas: suficiente)
  const d = m / R_T, b = rad(rumboDeg), la1 = rad(p.lat), lo1 = rad(p.lng);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return L.latLng(deg(la2), deg(lo2));
}
function actualizarPos(p) {
  const { latitude: la, longitude: lo, accuracy, heading, speed } = p.coords;
  try { puntoTrack(p); } catch (e) {}
  posGps = L.latLng(la, lo);
  // Rumbo y velocidad: los del GPS si vienen; si no, calculados con la posición anterior
  if (ultFix) { const dm = distM(ultFix.p, posGps), dt = (p.timestamp - ultFix.t) / 1000;
    if (dm > Math.max(8, accuracy * 0.5) && dt > 0) { cogCalc = rumbo(ultFix.p, posGps); sogCalc = dm / dt; ultFix = { p: posGps, t: p.timestamp }; } }
  else ultFix = { p: posGps, t: p.timestamp };
  const sog = speed != null && !isNaN(speed) ? speed : sogCalc;               // m/s
  const cog = heading != null && !isNaN(heading) && (sog ?? 0) > 0.25 ? heading : cogCalc;
  const kn = sog != null ? sog * 1.94384 : null;
  const navegando = cog != null && kn != null && kn >= 0.5;
  if (!marcaBarco) { marcaBarco = L.marker(posGps, { icon: iconoBarco(navegando ? cog : 0), zIndexOffset: 1000, keyboard: false }).addTo(mapa); precision = L.circle(posGps, { radius: accuracy, color: '#c2188f', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(mapa); }
  else { marcaBarco.setLatLng(posGps).setIcon(iconoBarco(navegando ? cog : 0)); precision.setLatLng(posGps).setRadius(accuracy); }
  if (navegando) {
    const largo = Math.max(sog * 60 * minutosRumbo(), 150), fin = destino(posGps, cog, largo);
    if (!lineaRumbo) { lineaRumbo = L.polyline([posGps, fin], { color: '#c2188f', weight: 3, interactive: false }).addTo(mapa); finRumbo = L.circleMarker(fin, { radius: 4, color: '#c2188f', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(mapa); }
    else { lineaRumbo.setLatLngs([posGps, fin]).addTo(mapa); finRumbo.setLatLng(fin).addTo(mapa); }
  } else if (lineaRumbo) { lineaRumbo.remove(); finRumbo.remove(); }
  $('#posTxt').innerHTML = `${esc(fmtLat(la))}<br>${esc(fmtLon(lo))}`;
  $('#sog').textContent = kn != null ? num(kn, 1) : '—';
  $('#cog').textContent = navegando ? fmtRumbo(cog) : '—';
  $('#posSub').textContent = `± ${Math.round(accuracy)} m` + (navegando ? '' : ' · quieto: sin línea de rumbo');
  if (orient === 'rumbo' && navegando && mapa.setBearing) { mapa.setBearing(360 - cog); marcaBarco.setIcon(iconoBarco(cog)); }
  if (seguir) mapa.panTo(posGps, { animate: true });
  const ais = $('#linkAis'); if (ais) ais.href = `https://www.marinetraffic.com/en/ais/home/centerx:${lo.toFixed(3)}/centery:${la.toFixed(3)}/zoom:14`;
}
function iniciarGps(centrar) {
  if (!('geolocation' in navigator)) { $('#posSub').textContent = 'Este navegador no tiene GPS'; return; }
  if (watchId == null) watchId = navigator.geolocation.watchPosition(actualizarPos, e => {
    $('#posSub').textContent = e.code === 1 ? 'Permiso de ubicación denegado' : 'Sin señal GPS';
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  if (centrar && posGps) mapa.setView(posGps, Math.max(mapa.getZoom(), 14));
  else if (centrar) navigator.geolocation.getCurrentPosition(p => mapa.setView([p.coords.latitude, p.coords.longitude], 14), () => {}, { enableHighAccuracy: true });
}
$('#btnGps').onclick = () => iniciarGps(true);
/* Orientación: Norte arriba (mapa fijo) / Rumbo arriba (el mapa gira para que tu rumbo apunte hacia arriba) */
let orient = leer('orient', 'norte');
const btnOrient = $('#btnOrient');
function aplicarOrient() {
  const r = orient === 'rumbo';
  btnOrient.setAttribute('aria-pressed', r);
  $('#orientIco').textContent = r ? '▲' : 'N';
  $('#orientTxt').textContent = r ? 'rumbo' : 'norte';
  if (!r && mapa.setBearing) mapa.setBearing(0);
  if (r) { seguir = true; btnSeguir.setAttribute('aria-pressed', true); iniciarGps(true); }
  if (marcaBarco) marcaBarco.setIcon(iconoBarco(cogCalc ?? 0));
}
btnOrient.onclick = () => { orient = orient === 'rumbo' ? 'norte' : 'rumbo'; guardar('orient', orient); aplicarOrient(); };

const selRumbo = $('#minRumbo'); selRumbo.value = String(minutosRumbo()); selRumbo.onchange = () => guardar('minRumbo', parseInt(selRumbo.value, 10));
const btnSeguir = $('#btnSeguir');
btnSeguir.setAttribute('aria-pressed', seguir);
btnSeguir.onclick = () => { seguir = !seguir; btnSeguir.setAttribute('aria-pressed', seguir); guardar('seguir', seguir); if (seguir) iniciarGps(true); };
mapa.on('dragstart', () => { if (seguir) { seguir = false; btnSeguir.setAttribute('aria-pressed', false); guardar('seguir', false); } });
if (leer('gpsUsado', false)) iniciarGps(false);
$('#btnGps').addEventListener('click', () => guardar('gpsUsado', true));

/* ---------- Toque en el mapa: coordenadas, rumbo y distancia ---------- */
let marcaToque = null;
mapa.on('click', e => {
  const p = e.latlng;
  if (!marcaToque) marcaToque = L.circleMarker(p, { radius: 6, color: '#000', fillColor: '#ffd400', fillOpacity: 1, weight: 2 }).addTo(mapa); else marcaToque.setLatLng(p);
  $('#toqueTxt').innerHTML = `${esc(fmtLat(p.lat))}<br>${esc(fmtLon(p.lng))}`;
  const zc = profCarta(p.lat, p.lng), hr = alturaRio(p.lat);
  const prf = zc === null ? '' : ` · Prof. ≈ ${num(zc + hr, 1)} m ahora (carta ${num(zc, 1)} + río ${num(hr, 1)})`;
  $('#toqueSub').textContent = (posGps ? `Desde tu posición: ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(distM(posGps, p))}` : 'Activá el GPS para ver rumbo y distancia') + prf;
  $('#hudToque').hidden = false;
});
$('#cerrarToque').onclick = () => { $('#hudToque').hidden = true; marcaToque && marcaToque.remove(); marcaToque = null; };

/* ---------- Panel ---------- */
const panel = $('#panel');
const abrirPanel = v => { panel.classList.toggle('abierto', v); document.body.classList.toggle('con-panel', v); guardar('panel', v); };
$('#btnPanel').onclick = () => abrirPanel(!panel.classList.contains('abierto'));
$('#cerrarPanel').onclick = () => abrirPanel(false);
if (leer('panel', innerWidth > 900)) abrirPanel(true);
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); });
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('on', v.id === 'v-' + t.dataset.t));
  guardar('tab', t.dataset.t);
  if (t.dataset.t === 'viento') cargarViento();
});


/* ---------- Situación del río ---------- */
const calado = $('#calado');
calado.value = leer('calado', 1.5);
calado.oninput = () => { guardar('calado', parseFloat(calado.value)); pintarSemaforo(); clearTimeout(calado._t); calado._t = setTimeout(() => { dibujarNoPasa(); pintarAlertas(); }, 250); };
const DETERMINANTE = 1.20; // m, Canal Costanero zona menos profunda Km 19,3–20,2 (CVPB oct‑2026)
let sit = null, vientoAhora = {};
const ultimo = a => a && a.length ? a[a.length - 1] : null;
const hora = iso => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

function estimacion(est) { // astronómica + diferencia actual (observada − astronómica): estimación simple de las próximas horas
  const obs = est.observada, ast = est.astronomica, u = ultimo(obs);
  if (!u) return null;
  const a = ast.find(x => x[0] === u[0]);
  const dif = a ? u[1] - a[1] : 0;
  return { dif, futuro: ast.filter(x => x[0] > u[0]).map(x => [x[0], +(x[1] + dif).toFixed(2)]) };
}

function pintarSemaforo() {
  const luz = $('#semLuz'), det = $('#semDet');
  const sf = sit && sit.mareografos && sit.mareografos.SFER;
  const u = sf && ultimo(sf.observada);
  if (!u) { luz.className = 'sem-luz'; luz.textContent = 'Sin dato de altura'; det.textContent = ''; return; }
  const c = parseFloat(calado.value) || 0, agua = DETERMINANTE + u[1], margen = agua - c;
  luz.className = 'sem-luz ' + (margen >= 0.5 ? 'verde' : margen >= 0.2 ? 'ambar' : 'rojo');
  luz.textContent = margen >= 0.5 ? 'Pasa con margen' : margen >= 0.2 ? 'Justo: con cuidado' : 'No da';
  const est = estimacion(sf);
  let prox = '';
  if (est && est.futuro.length) {
    const ok = est.futuro.find(x => DETERMINANTE + x[1] - c >= 0.5), malo = est.futuro.find(x => DETERMINANTE + x[1] - c < 0.2);
    if (margen < 0.5 && ok) prox = ` Estimado: margen bueno desde las ${hora(ok[0])}.`;
    else if (margen >= 0.2 && malo) prox = ` Estimado: deja de dar a las ${hora(malo[0])}.`;
  }
  det.textContent = `Agua en el paso ≈ ${num(agua)} m · bajo la quilla ≈ ${num(margen)} m (San Fernando ${num(u[1])} m a las ${hora(u[0])}).${prox}`;
  curva(sf, est);
}

function curva(est, e) {
  const caja = $('#curvaSF');
  const dibujar = () => {
    const W = caja.clientWidth, H = caja.clientHeight; if (!W) return;
    const obs = est.observada, fut = e ? e.futuro : [], ast = est.astronomica;
    const todos = [...obs, ...ast, ...fut]; if (!todos.length) return;
    const t0 = Math.min(...todos.map(x => +new Date(x[0]))), t1 = Math.max(...todos.map(x => +new Date(x[0])));
    const c = parseFloat(calado.value) || 0, lim = c - DETERMINANTE + 0.2; // altura mínima para 0,2 m bajo la quilla
    const vals = [...todos.map(x => x[1]), lim]; const lo = Math.min(...vals) - 0.15, hi = Math.max(...vals) + 0.15;
    const X = t => 34 + (W - 44) * (+new Date(t) - t0) / Math.max(t1 - t0, 1), Y = v => 8 + (H - 30) * (hi - v) / (hi - lo);
    const linea = (a, col, extra = '') => a.length ? `<polyline fill="none" stroke="${col}" stroke-width="2.4" ${extra} points="${a.map(x => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(' ')}"/>` : '';
    let s = `<rect x="34" y="${Y(lim)}" width="${W - 44}" height="${Math.max(H - 22 - Y(lim), 0)}" fill="#d7262e" opacity=".12"/>`;
    s += `<line x1="34" x2="${W - 10}" y1="${Y(lim)}" y2="${Y(lim)}" stroke="#d7262e" stroke-dasharray="4 3"/>`;
    for (let v = Math.ceil(lo * 2) / 2; v <= hi; v += 0.5) s += `<text x="2" y="${Y(v) + 4}" font-size="11" fill="currentColor">${num(v, 1)}</text><line x1="34" x2="${W - 10}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/>`;
    s += linea(ast, '#8aa0ad', 'stroke-dasharray="2 3"') + linea(obs, '#0a6fb0') + linea(fut, '#c2188f', 'stroke-dasharray="6 4"');
    const ahora = ultimo(obs); if (ahora) s += `<circle cx="${X(ahora[0])}" cy="${Y(ahora[1])}" r="4" fill="#0a6fb0"/>`;
    if (W > 300) s += `<text x="${W - 12}" y="${H - 4}" font-size="11" text-anchor="end" fill="currentColor">azul medida · gris marea astronómica · magenta estimación</text>`;
    caja.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Altura en San Fernando">${s}</svg>`;
  };
  if (!caja._ro) { caja._ro = new ResizeObserver(dibujar); caja._ro.observe(caja); }
  caja._dibujar = dibujar; dibujar();
}

const SITUACIONES = [ // lo que importa: Pilote Norden, San Isidro, Puerto de Buenos Aires
  { id: 'SI', titulo: 'San Isidro', viento: 'si' },
  { id: 'BSAS', titulo: 'Puerto de Buenos Aires', viento: 'bsas' },
  { id: 'PNOR', titulo: 'Pilote Norden', viento: 'pnor' },
];
function tarjeta(s) {
  const m = sit.mareografos || {}, pref = sit.prefectura || {};
  let alt = '—', tend = '', det = '', chips = '';
  if (s.id === 'SI') {
    const p = pref['San Isidro'], sf = m.SFER, u = sf && ultimo(sf.observada), prev = sf && sf.observada[sf.observada.length - 2];
    alt = u ? num(u[1]) + ' m' : '—';
    if (u && prev) tend = u[1] > prev[1] ? '<span class="tend sube">▲ crece</span>' : u[1] < prev[1] ? '<span class="tend baja">▼ baja</span>' : '<span class="tend">= estable</span>';
    det = `San Fernando (SHN, cada hora)${u ? ' a las ' + hora(u[0]) : ''}.`;
    if (p) { det += ` Regla Prefectura San Isidro: ${num(p.altura)} m, ${esc(p.estado)} (${esc(p.fecha)}).`;
      chips = p.altura >= p.evacuacion ? '<span class="chip evac">Evacuación</span>' : p.altura >= p.alerta ? '<span class="chip alerta">Alerta</span>' : ''; }
    const e = sf && estimacion(sf); if (e) det += ` Sobre la marea astronómica: ${e.dif >= 0 ? '+' : ''}${num(e.dif)} m.`;
  } else {
    const est = m[s.id], u = est && ultimo(est.observada), prev = est && est.observada[est.observada.length - 2];
    alt = u ? num(u[1]) + ' m' : '—';
    if (u && prev) tend = u[1] > prev[1] ? '<span class="tend sube">▲ crece</span>' : u[1] < prev[1] ? '<span class="tend baja">▼ baja</span>' : '<span class="tend">= estable</span>';
    const e = est && estimacion(est);
    det = u ? `SHN a las ${hora(u[0])}.` : 'Sin lectura reciente.';
    if (e) det += ` Sobre la marea astronómica: ${e.dif >= 0 ? '+' : ''}${num(e.dif)} m${e.dif >= 0.3 ? ' (crecida por viento)' : e.dif <= -0.3 ? ' (bajante por viento)' : ''}.`;
    if (s.id === 'BSAS') { const p = pref['Buenos Aires']; if (p) chips = p.altura >= p.evacuacion ? '<span class="chip evac">Evacuación</span>' : p.altura >= p.alerta ? '<span class="chip alerta">Alerta</span>' : ''; }
  }
  const v = vientoAhora[s.viento];
  const vt = v ? `<div class="viento" aria-label="Viento">${flecha(v.dir)} ${Math.round(v.vel)}<small>/${Math.round(v.raf)} kn</small><div class="nota">${esc(cardinal(v.dir))}</div></div>` : '<div class="viento nota">viento…</div>';
  return `<div class="est"><h3>${esc(s.titulo)} ${chips}</h3><div><div class="alt">${alt}</div>${tend}</div>${vt}<div class="det">${det}</div></div>`;
}
function pintarSituacion() {
  if (!sit) return;
  $('#estaciones').innerHTML = SITUACIONES.map(tarjeta).join('');
  const r = sit.radioavisos || {};
  const pb = r.pleamar_bajamar || {};
  const filas = ['San Fernando', 'Buenos Aires'].filter(p => pb[p]).map(p => `<tr><th class="r">${esc(p)}</th>${pb[p].map(x => `<td>${esc(x.estado)}<br><strong>${esc(x.hora)}</strong> · ${num(x.altura)} m</td>`).join('')}</tr>`).join('');
  $('#pronostico').innerHTML = `<h2>Pronóstico mareológico SHN</h2><p class="nota">${esc(r.pronostico_valido || '')}</p>`
    + (r.pronostico_interior ? `<p><strong>Río de la Plata interior:</strong> ${esc(r.pronostico_interior.toLowerCase())}.</p>` : '')
    + (r.observaciones ? `<p>${esc(r.observaciones.toLowerCase())}.</p>` : '')
    + (filas ? `<div class="scroll"><table class="vt">${filas}</table></div>` : '')
    + (r.olas_costanero_km17 && r.olas_costanero_km17.length ? `<p><strong>Olas Canal Costanero Km 17:</strong> ${r.olas_costanero_km17.map(o => `${esc(o.fecha)} mañana ${num(o.manana.alt, 1)} m ${esc(o.manana.dir)}, tarde ${num(o.tarde.alt, 1)} m ${esc(o.tarde.dir)}`).join(' · ')}</p>` : '');
  const edadMin = (Date.now() - new Date(sit.generado)) / 60000, act = $('#actualizado');
  act.textContent = 'datos ' + new Date(sit.generado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    + (edadMin > 90 ? ` · ATENCIÓN: datos de hace ${edadMin > 120 ? Math.round(edadMin / 60) + ' h' : Math.round(edadMin) + ' min'}` : '');
  act.style.color = edadMin > 90 ? '#ffb347' : ''; act.style.fontWeight = edadMin > 90 ? '700' : '';
  pintarSemaforo();
  pintarAvisos();
}
function pintarAvisos() {
  const r = (sit && sit.radioavisos) || {};
  const av = r.avisos_costanero || [];
  let grupo = '', h = '<h2>Balizamiento Canal Costanero (SHN)</h2>';
  for (const l of av) { if (/:$/.test(l)) { grupo = l.replace(':', ''); continue; } h += `<div class="aviso ${/FALTA|AVERIADA/.test(grupo) ? 'falta' : ''}"><strong>${esc(grupo.toLowerCase())}:</strong> ${esc(l)}</div>`; }
  if (!av.length) h += '<p class="nota">Sin novedades publicadas.</p>';
  h += `<p class="nota">Radioavisos vigentes SHN, actualizado ${esc(r.actualizado_shn || '—')}. Verificar siempre por VHF / NAVTEX.</p>`;
  if (sit && sit.errores && sit.errores.length) h += `<div class="aviso">No se pudo actualizar: ${esc(sit.errores.join(' · '))}. Se muestra lo último disponible.</div>`;
  $('#avisos').innerHTML = h;
}
function cargarSituacion() {
  fetch('datos/situacion.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { sit = d; pintarSituacion(); dibujarNoPasa(); pintarAlertas(); })
    .catch(() => { $('#actualizado').textContent = 'sin conexión'; });
}
cargarSituacion(); setInterval(cargarSituacion, 10 * 60 * 1000);

/* ---------- Viento (Open‑Meteo) ---------- */
const PUNTOS = {
  si: { n: 'San Isidro / Canal Costanero', lat: -34.46, lon: -58.48 },
  bsas: { n: 'Puerto de Buenos Aires', lat: -34.58, lon: -58.36 },
  pnor: { n: 'Pilote Norden', lat: -34.617, lon: -57.917 },
  mg: { n: 'Martín García', lat: -34.18, lon: -58.25 },
  tigre: { n: 'Tigre / Delta', lat: -34.40, lon: -58.56 },
};
const sel = $('#puntoViento');
sel.innerHTML = Object.entries(PUNTOS).map(([k, p]) => `<option value="${k}">${esc(p.n)}</option>`).join('');
sel.value = leer('puntoViento', 'si');
sel.onchange = () => { guardar('puntoViento', sel.value); cargarViento(true); };
const flecha = d => `<span class="flecha" style="transform:rotate(${(d + 180) % 360}deg)" aria-hidden="true">↑</span>`;
const cardinal = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16];
const colorViento = kn => kn < 5 ? '#e8f4fb' : kn < 10 ? '#a8e0c4' : kn < 15 ? '#5fd07a' : kn < 20 ? '#f4e04d' : kn < 25 ? '#f6a33a' : kn < 30 ? '#ef5a3a' : '#c2188f';
const urlViento = p => `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code&wind_speed_unit=kn&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=3&models=ecmwf_ifs025,gfs_seamless`;
const cacheViento = {}; // v2: incluye weather_code
Object.keys(PUNTOS).forEach(k => { const v = leer('viento_' + k, null); if (v && !v.d?.hourly?.weather_code_ecmwf_ifs025 && !v.d?.hourly?.weather_code_gfs_seamless) guardar('viento_' + k, null); });
async function datosViento(k) {
  if (cacheViento[k] && Date.now() - cacheViento[k].t < 30 * 60 * 1000) return cacheViento[k].d;
  const d = await fetch(urlViento(PUNTOS[k])).then(r => r.json());
  cacheViento[k] = { t: Date.now(), d }; guardar('viento_' + k, cacheViento[k]); return d;
}
function vientoActual(k, d) {
  const h = d.hourly, now = new Date(), i = h.time.findIndex(t => new Date(t) > now) - 1;
  const j = Math.max(i, 0), v = h.wind_speed_10m_ecmwf_ifs025?.[j] ?? h.wind_speed_10m_gfs_seamless?.[j];
  const r = h.wind_gusts_10m_ecmwf_ifs025?.[j] ?? h.wind_gusts_10m_gfs_seamless?.[j];
  const dir = h.wind_direction_10m_ecmwf_ifs025?.[j] ?? h.wind_direction_10m_gfs_seamless?.[j];
  if (v != null) vientoAhora[k] = { vel: v, raf: r ?? v, dir: dir ?? 0 };
}
async function cargarViento(forzar) {
  const k = sel.value, caja = $('#tablaViento');
  try {
    const d = await datosViento(k); vientoActual(k, d); pintarTablaViento(d);
  } catch (e) {
    const viejo = leer('viento_' + k, null);
    if (viejo) { pintarTablaViento(viejo.d); caja.insertAdjacentHTML('afterbegin', `<p class="aviso">Sin conexión: pronóstico guardado del ${esc(new Date(viejo.t).toLocaleString('es-AR'))}.</p>`); }
    else caja.innerHTML = '<p class="aviso">No se pudo cargar el pronóstico de viento.</p>';
  }
}
function pintarTablaViento(d) {
  const h = d.hourly, idx = [];
  const now = new Date();
  h.time.forEach((t, i) => { const f = new Date(t); if (f >= new Date(now - 3600e3) && f.getHours() % 2 === 0) idx.push(i); });
  const dias = idx.map(i => new Date(h.time[i]));
  const celda = (v, r) => v == null ? '<td>—</td>' : `<td class="n" style="background:${colorViento(v)}">${Math.round(v)}</td>`;
  const fila = (nombre, mod) => `<tr><th class="r">${nombre}</th>${idx.map((i, n) => celda(h[`wind_speed_10m_${mod}`]?.[i])).join('')}</tr>`
    + `<tr><th class="r">ráfaga</th>${idx.map(i => celda(h[`wind_gusts_10m_${mod}`]?.[i])).join('')}</tr>`
    + `<tr><th class="r">dirección</th>${idx.map(i => { const dd = h[`wind_direction_10m_${mod}`]?.[i]; return dd == null ? '<td>—</td>' : `<td title="${cardinal(dd)}">${flecha(dd)}<br><small>${cardinal(dd)}</small></td>`; }).join('')}</tr>`;
  let cab1 = '<tr><th class="r"></th>', ultimoDia = '';
  dias.forEach(f => { const dl = f.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }); cab1 += `<th class="${dl !== ultimoDia ? 'dia' : ''}">${dl !== ultimoDia ? esc(dl) : ''}</th>`; ultimoDia = dl; });
  const cab2 = '<tr><th class="r">hora</th>' + dias.map(f => `<th>${f.getHours()}</th>`).join('') + '</tr>';
  $('#tablaViento').innerHTML = `<table class="vt">${cab1}</tr>${cab2}<tr><th class="r" colspan="1"><strong>ECMWF</strong></th></tr>${fila('viento', 'ecmwf_ifs025')}<tr><th class="r"><strong>GFS</strong></th></tr>${fila('viento', 'gfs_seamless')}</table>`;
}
// Viento actual para las tarjetas de situación
Promise.allSettled(['si', 'bsas', 'pnor'].map(k => datosViento(k).then(d => vientoActual(k, d)))).then(() => { sit && pintarSituacion(); pintarAlertas(); });

/* Pantalla siempre encendida (Screen Wake Lock): se vuelve a pedir al volver a la app */
let wake = null, quiereWake = leer('pantalla', false);
const btnPant = $('#btnPantalla');
async function pedirWake() {
  if (!('wakeLock' in navigator)) { $('#pantTxt').textContent = 'no disp.'; return false; }
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; pintarPant(); }); pintarPant(); return true; }
  catch (e) { wake = null; pintarPant(); return false; }
}
function pintarPant() { const on = !!wake; btnPant.setAttribute('aria-pressed', on); $('#pantTxt').textContent = on ? 'siempre on' : 'pantalla'; }
btnPant.onclick = async () => {
  quiereWake = !quiereWake; guardar('pantalla', quiereWake);
  if (quiereWake) await pedirWake(); else { try { await wake?.release(); } catch (e) {} wake = null; pintarPant(); }
};
document.addEventListener('visibilitychange', () => { if (quiereWake && document.visibilityState === 'visible' && !wake) pedirWake(); });
if (quiereWake) pedirWake();
aplicarOrient();

/* ---------- Alertas del día (solo lo que queda de HOY) ---------- */
const UMBRAL_RAFAGA = 30, UMBRAL_OLA = 1.0, UMBRAL_BAJANTE = 0.30, UMBRAL_SOBREELEV = -0.80;
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function alertasDelDia() {
  const A = [], ahora = new Date(), hoy = hoyISO();
  const [yy, mm, dd] = hoy.split('-');
  // 1-2) viento y tormentas (Open-Meteo, horas que quedan de hoy; el modelo que dé más)
  for (const k of ['si', 'bsas', 'pnor']) {
    const h = cacheViento[k]?.d?.hourly; if (!h) continue;
    let max = 0, hMax = null, torm = null;
    h.time.forEach((t, i) => {
      if (!t.startsWith(hoy) || new Date(t) < new Date(ahora - 3600e3)) return;
      const r = Math.max(h.wind_gusts_10m_ecmwf_ifs025?.[i] ?? 0, h.wind_gusts_10m_gfs_seamless?.[i] ?? 0);
      if (r > max) { max = r; hMax = t; }
      const wc = [h.weather_code_ecmwf_ifs025?.[i], h.weather_code_gfs_seamless?.[i]];
      if (!torm && wc.some(c => c >= 95)) torm = t;
    });
    if (max >= UMBRAL_RAFAGA) A.push({ n: 'rojo', t: `Ráfagas de hasta ${Math.round(max)} kn hoy (${PUNTOS[k].n}, ~${hora(hMax)} h)` });
    if (torm) A.push({ n: 'rojo', t: `Tormentas eléctricas previstas hoy desde las ${hora(torm)} h (${PUNTOS[k].n})` });
  }
  // 3) avisos a muy corto plazo del SMN que nombran la zona
  for (const a of (sit?.smn || [])) if (a.zona) A.push({ n: 'rojo', t: `SMN: ${a.titulo}. ${a.texto}` });
  // 4) olas Canal Costanero Km 17 (pronóstico SHN de hoy)
  const ol = (sit?.radioavisos?.olas_costanero_km17 || []).find(o => o.fecha === `${dd}-${mm}-${yy.slice(2)}`);
  if (ol) { const m = Math.max(ol.manana.alt, ol.tarde.alt); if (m >= UMBRAL_OLA) A.push({ n: 'ambar', t: `Olas de ${num(m, 1)} m previstas hoy en el Canal Costanero (Km 17)` }); }
  // 5-6) crecidas y bajantes extremas (medido ahora y pleamar/bajamar de hoy)
  const pref = sit?.prefectura || {}, pb = sit?.radioavisos?.pleamar_bajamar || {}, m = sit?.mareografos || {};
  for (const [cod, nom, lvl] of [['SFER', 'San Fernando', pref['San Fernando']?.alerta ?? 3.0], ['BSAS', 'Buenos Aires', pref['Buenos Aires']?.alerta ?? 3.3]]) {
    const u = m[cod] && ultimo(m[cod].observada), e = m[cod] && estimacion(m[cod]);
    if (u && u[1] >= lvl) A.push({ n: 'rojo', t: `Crecida: ${nom} ${num(u[1])} m (alerta Prefectura ${num(lvl)} m)` });
    if (u && u[1] <= UMBRAL_BAJANTE) A.push({ n: 'rojo', t: `Bajante extrema: ${nom} ${num(u[1])} m` });
    if (e && e.dif <= UMBRAL_SOBREELEV) A.push({ n: 'ambar', t: `Bajante por viento: ${nom} ${num(-e.dif)} m por debajo de la marea normal` });
    for (const x of (pb[nom] || [])) {
      if (x.fecha !== `${dd}/${mm}/${yy}`) continue;
      if (x.estado === 'pleamar' && x.altura >= lvl) A.push({ n: 'rojo', t: `Crecida prevista hoy: pleamar ${num(x.altura)} m a las ${x.hora} en ${nom} (alerta ${num(lvl)} m)` });
      if (x.estado === 'bajamar' && x.altura <= UMBRAL_BAJANTE) A.push({ n: 'rojo', t: `Bajante extrema prevista hoy: bajamar ${num(x.altura)} m a las ${x.hora} en ${nom}` });
    }
  }
  // 7) calado vs. altura del río: ¿hoy hay momentos en que no pasás el Canal Costanero?
  const cal = parseFloat(calado.value) || 0, sf = m.SFER;
  if (sf && cal > 0) {
    const pts = [], e = estimacion(sf), u = ultimo(sf.observada);
    if (u) pts.push([u[0], u[1], 'medido']);
    if (e) for (const x of e.futuro) if (x[0].startsWith(hoy)) pts.push([x[0], x[1], 'estimado']);
    for (const x of (pb['San Fernando'] || [])) if (x.estado === 'bajamar' && x.fecha === `${dd}/${mm}/${yy}`) {
      const [hh, mi] = x.hora.split(':'); const t = `${hoy}T${hh}:${mi}:00`;
      if (new Date(t) > new Date(ahora - 3600e3)) pts.push([t, x.altura, 'bajamar SHN']);
    }
    const margen = h => DETERMINANTE + h - cal;
    const malos = pts.filter(p => margen(p[1]) < 0.2), justos = pts.filter(p => margen(p[1]) >= 0.2 && margen(p[1]) < 0.4);
    pts.sort((x, y) => x[0] < y[0] ? -1 : 1);
    // ventanas del día en que SÍ pasás (≥ 0,20 m bajo la quilla); aviso corto solo si hay horas en que no da
    const ventanas = []; let cur = null;
    for (const p of pts) {
      if (margen(p[1]) >= 0.2) { if (!cur) cur = [p[0], p[0]]; else cur[1] = p[0]; }
      else if (cur) { ventanas.push(cur); cur = null; }
    }
    if (cur) ventanas.push(cur);
    const hayMalas = pts.some(p => margen(p[1]) < 0.2), justas = pts.some(p => margen(p[1]) >= 0.2 && margen(p[1]) < 0.4);
    const txtV = v => v[0] === v[1] ? `alrededor de las ${hora(v[0])}` : `entre las ${hora(v[0])} y las ${hora(v[1])}`;
    if (hayMalas) {
      A.push({ n: 'rojo', t: ventanas.length
        ? `Con ${num(cal)} m de calado: pasás el Canal Costanero ${ventanas.map(txtV).join(' y ')}. El resto del día no da.`
        : `Con ${num(cal)} m de calado: hoy no pasás el Canal Costanero (hasta las ${hora(pts[pts.length - 1][0])}, último dato).` });
    } else if (justas) {
      const j = pts.filter(p => margen(p[1]) < 0.4).map(p => p[0]);
      A.push({ n: 'ambar', t: `Con ${num(cal)} m de calado: pasás justo el Canal Costanero ${j.length > 1 ? `entre las ${hora(j[0])} y las ${hora(j[j.length - 1])}` : `alrededor de las ${hora(j[0])}`} (menos de 0,40 m bajo la quilla).` });
    }
  }
  return A;
}
function pintarAlertas() {
  const caja = $('#alertas'); if (!caja) return;
  const A = alertasDelDia(), clave = hoyISO() + '|' + A.map(a => a.t).join('|');
  // pestaña Alertas: siempre con las del día, aunque se cierre el cartel
  const lista = $('#listaAlertas'), cuenta = $('#cuentaAlertas');
  if (lista) lista.innerHTML = A.length ? A.map(a => `<div class="alerta-item ${a.n === 'ambar' ? 'ambar' : ''}">${esc(a.t)}</div>`).join('') : '<p>Sin alertas para lo que queda de hoy.</p>';
  if (cuenta) { cuenta.hidden = !A.length; cuenta.textContent = A.length; cuenta.className = 'cuenta' + (A.some(a => a.n === 'rojo') ? '' : ' ambar'); }
  if (!A.length || leer('alertaCerrada', '') === clave) { caja.hidden = true; return; }
  const nuevo = caja.dataset.clave !== clave; caja.dataset.clave = clave;
  caja.className = 'alertas ' + (A.some(a => a.n === 'rojo') ? 'rojo' : 'ambar');
  caja.innerHTML = `<button class="cerrar" id="cerrarAlerta" aria-label="Cerrar aviso">×</button><strong>Atención hoy</strong><ul>${A.map(a => `<li>${esc(a.t)}</li>`).join('')}</ul><button class="ver" id="verAlertas">Siguen en la pestaña Alertas</button>`;
  caja.hidden = false;
  $('#cerrarAlerta').onclick = () => { guardar('alertaCerrada', clave); caja.hidden = true; };
  $('#verAlertas').onclick = () => { abrirPanel(true); document.querySelector('.tab[data-t="alertas"]').click(); };
  if (nuevo && navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) {}
}
setInterval(pintarAlertas, 5 * 60 * 1000);

/* ---------- Rosa de viento: dirección e intensidad AHORA (Open-Meteo, mismos modelos que Windy) ---------- */
let vientoRosa = null, rosaPos = null, rosaT = 0;
async function actualizarRosa(forzar) {
  const p = posGps || mapa.getCenter();
  if (!forzar && rosaPos && distM(rosaPos, p) < 3000 && Date.now() - rosaT < 10 * 60e3) return pintarRosa();
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lng.toFixed(3)}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=America%2FArgentina%2FBuenos_Aires`;
    const d = await fetch(u).then(r => r.json());
    if (d.current) { vientoRosa = { vel: d.current.wind_speed_10m, dir: d.current.wind_direction_10m, raf: d.current.wind_gusts_10m, t: d.current.time }; rosaPos = L.latLng(p.lat, p.lng); rosaT = Date.now(); guardar('rosa', vientoRosa); }
  } catch (e) { vientoRosa = vientoRosa || leer('rosa', null); }
  pintarRosa();
}
function pintarRosa() {
  const v = vientoRosa; if (!v) return;
  const giro = (v.dir + 180 + (mapa.getBearing ? mapa.getBearing() : 0)) % 360; // la flecha apunta hacia donde sopla
  $('#rosaFlecha').style.transform = `rotate(${giro}deg)`;
  $('#rosaVel').textContent = Math.round(v.vel);
  $('#rosaRaf').textContent = Math.round(v.raf); // ráfaga en amarillo, al lado
  $('#rosaSub').textContent = cardinal(v.dir);
  $('#rosaAro').style.stroke = colorViento(Math.max(v.vel, 5));
  $('#rosaViento').title = `Viento ${Math.round(v.vel)} kn del ${cardinal(v.dir)} (${Math.round(v.dir)}°), ráfagas ${Math.round(v.raf)} kn · Open-Meteo ${v.t}`;
  const n = document.querySelector('.rosa-n'); if (n) n.setAttribute('transform', `rotate(${mapa.getBearing ? mapa.getBearing() : 0} 50 50)`);
}
// Tocar la rosa abre el pronóstico de 3 días (estilo Windguru) del punto más cercano
function abrirViento() {
  const ref = posGps || mapa.getCenter();
  let mejor = null; for (const [k, p] of Object.entries(PUNTOS)) { const d = distM(ref, L.latLng(p.lat, p.lon)); if (!mejor || d < mejor[1]) mejor = [k, d]; }
  if (mejor) { sel.value = mejor[0]; guardar('puntoViento', mejor[0]); }
  abrirPanel(true);
  document.querySelectorAll('.tab').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', false); });
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('on', v.id === 'v-viento'));
  cargarViento(true);
}
$('#rosaViento').onclick = abrirViento;
$('#rosaViento').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirViento(); } };
mapa.on('moveend', () => { clearTimeout(actualizarRosa._t); actualizarRosa._t = setTimeout(() => actualizarRosa(false), 1500); });
mapa.on('rotate', pintarRosa);
setInterval(() => actualizarRosa(true), 10 * 60e3);
actualizarRosa(true);

/* ---------- Grabar recorrido (como el "track" de Navionics) ---------- */
const capaTrack = L.layerGroup().addTo(mapa);
let grabando = leer('grabando', false), trackActual = leer('trackActual', []), lineaTrack = null, recorridoVisto = null;
const btnRec = $('#btnRec');
function distTrack(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += distM(L.latLng(pts[i - 1][0], pts[i - 1][1]), L.latLng(pts[i][0], pts[i][1])); return d; }
function pintarRec() {
  btnRec.setAttribute('aria-pressed', grabando);
  $('#recTxt').textContent = grabando ? `${(distTrack(trackActual) / 1852).toFixed(1).replace('.', ',')} MN` : 'grabar';
  const pts = trackActual.map(p => [p[0], p[1]]);
  if (grabando && pts.length) { if (!lineaTrack) lineaTrack = L.polyline(pts, { pane: 'ruta', color: '#00d5ff', weight: 4, opacity: 0.95 }).addTo(capaTrack); else lineaTrack.setLatLngs(pts); }
  else if (lineaTrack) { lineaTrack.remove(); lineaTrack = null; }
}
function puntoTrack(p) { // llamado en cada posición GPS
  if (!grabando || p.coords.accuracy > 40) return;
  const ult = trackActual[trackActual.length - 1], aqui = L.latLng(p.coords.latitude, p.coords.longitude);
  if (ult && distM(L.latLng(ult[0], ult[1]), aqui) < 10 && p.timestamp - ult[2] < 30000) return; // cada 10 m o 30 s
  trackActual.push([+aqui.lat.toFixed(6), +aqui.lng.toFixed(6), p.timestamp, p.coords.speed != null ? +(p.coords.speed * 1.94384).toFixed(1) : null]);
  if (trackActual.length % 5 === 1) guardar('trackActual', trackActual);
  pintarRec();
}
function terminarGrabacion() {
  grabando = false; guardar('grabando', false);
  if (trackActual.length > 1) {
    const L0 = trackActual[0][2], L1 = trackActual[trackActual.length - 1][2];
    const rec = { id: L0, inicio: L0, fin: L1, puntos: trackActual, dist: distTrack(trackActual), vmax: Math.max(...trackActual.map(p => p[3] || 0)) };
    const lista = leer('recorridos', []); lista.unshift(rec); guardar('recorridos', lista);
  }
  trackActual = []; guardar('trackActual', []); pintarRec(); listarRecorridos();
}
btnRec.onclick = async () => {
  if (grabando) { terminarGrabacion(); return; }
  grabando = true; trackActual = []; guardar('grabando', true); guardar('trackActual', []);
  iniciarGps(true);
  if (!wake) { quiereWake = true; guardar('pantalla', true); pedirWake(); }
  pintarRec();
};
const fmtFecha = t => new Date(t).toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
function gpx(r) {
  const pts = r.puntos.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"><time>${new Date(p[2]).toISOString()}</time></trkpt>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Costanero" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Recorrido ${fmtFecha(r.inicio)}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
function listarRecorridos() {
  const caja = $('#listaRecorridos'); if (!caja) return;
  const lista = leer('recorridos', []);
  caja.innerHTML = (grabando ? `<div class="reco"><h3>Grabando ahora</h3><p>${trackActual.length} puntos · ${num(distTrack(trackActual) / 1852, 2)} MN</p></div>` : '')
    + (lista.length ? lista.map((r, i) => `<div class="reco"><h3>${esc(fmtFecha(r.inicio))}</h3><p>${num(r.dist / 1852, 2)} MN · ${fmtDur(r.fin - r.inicio)} · vel. media ${num(r.dist / 1852 / Math.max((r.fin - r.inicio) / 3600000, 0.01), 1)} kn${r.vmax ? ` · máx ${num(r.vmax, 1)} kn` : ''}</p>
      <div class="btns"><button data-ver="${i}">Ver en el mapa</button><button data-gpx="${i}">Descargar GPX</button><button class="peligro" data-borrar="${i}">Borrar</button></div></div>`).join('') : '<p>Todavía no hay recorridos guardados.</p>');
  caja.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => {
    const r = lista[+b.dataset.ver]; if (recorridoVisto) recorridoVisto.remove();
    recorridoVisto = L.polyline(r.puntos.map(p => [p[0], p[1]]), { pane: 'ruta', color: '#00d5ff', weight: 4, dashArray: '2 6', opacity: 0.95 }).bindPopup(`<h3>Recorrido ${esc(fmtFecha(r.inicio))}</h3><p>${num(r.dist / 1852, 2)} MN · ${fmtDur(r.fin - r.inicio)}</p>`).addTo(capaTrack);
    seguir = false; btnSeguir.setAttribute('aria-pressed', false); mapa.fitBounds(recorridoVisto.getBounds(), { padding: [40, 40] }); if (innerWidth < 700) abrirPanel(false);
  });
  caja.querySelectorAll('[data-gpx]').forEach(b => b.onclick = () => {
    const r = lista[+b.dataset.gpx], a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx(r)], { type: 'application/gpx+xml' }));
    a.download = `recorrido-${new Date(r.inicio).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.gpx`; document.body.appendChild(a); a.click(); a.remove();
  });
  caja.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => {
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = 'Tocá de nuevo para borrar'; return; }
    const l = leer('recorridos', []); l.splice(+b.dataset.borrar, 1); guardar('recorridos', l); if (recorridoVisto) { recorridoVisto.remove(); recorridoVisto = null; } listarRecorridos();
  });
}
setInterval(() => { if (grabando) { guardar('trackActual', trackActual); listarRecorridos(); } }, 15000);
if (grabando) iniciarGps(false);
pintarRec(); listarRecorridos();

// Restaurar la última pestaña (al final: todo lo que usa ya está definido)
{ const t = document.querySelector(`.tab[data-t="${leer('tab', 'sit')}"]`) || document.querySelector('.tab[data-t="sit"]'); if (t) t.click(); }

/* ---------- Botón "Instalar app": solo si el navegador ofrece instalarla y no está instalada ---------- */
let pedidoInstalar = null;
const btnInstalar = $('#btnInstalar');
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; if (!instalada()) btnInstalar.hidden = false; });
addEventListener('appinstalled', () => { btnInstalar.hidden = true; pedidoInstalar = null; });
btnInstalar.onclick = async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  try { await pedidoInstalar.userChoice; } catch (e) {}
  pedidoInstalar = null; btnInstalar.hidden = true;
};

/* ---------- Offline ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
