/* Costanero · carta simple del Río de la Plata interior y Delta
   Todo en WGS84 (lat/lon). Leaflet dibuja en Web Mercator: una sola proyección para todas las capas. */
{
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };

/* ---------- Formatos náuticos ---------- */
const gm = v => { const a = Math.abs(v); let g = Math.floor(a), m = +((a - g) * 60).toFixed(3); if (m >= 60) { g++; m = 0; } return [g, m]; }; // sin "59,9999…" → "60'"
const fmtLat = lat => { const [g, m] = gm(lat); return `${g}°${m.toFixed(3).replace('.', ',')}' ${lat < 0 ? 'S' : 'N'}`; };
const fmtLon = lon => { const [g, m] = gm(lon); return `${String(g).padStart(3, '0')}°${m.toFixed(3).replace('.', ',')}' ${lon < 0 ? 'W' : 'E'}`; };
const R_T = 6371000;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function distM(a, b) { const dLa = rad(b.lat - a.lat), dLo = rad(b.lng - a.lng); const h = Math.sin(dLa/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLo/2)**2; return 2*R_T*Math.asin(Math.sqrt(h)); }
function rumbo(a, b) { const y = Math.sin(rad(b.lng-a.lng))*Math.cos(rad(b.lat)); const x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lng-a.lng)); return (deg(Math.atan2(y, x)) + 360) % 360; }
const fmtDist = m => m < 1852 * 0.5 ? `${Math.round(m)} m` : `${(m / 1852).toFixed(2).replace('.', ',')} MN`;
const fmtRumbo = r => `${String(Math.round(r) % 360).padStart(3, '0')}°`;
// Pellizco fuera del mapa (rosa del viento, marea, botones, hojas): no agrandar la página. iOS ignora user-scalable=no.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !e.target.closest('.leaflet-container')) e.preventDefault(); }, { passive: false });
const num = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toFixed(d).replace('.', ',');

/* ---------- Mapa ---------- */
const mapa = L.map('mapa', { zoomControl: false, preferCanvas: true, minZoom: 11, maxZoom: 17,
  rotate: true, bearing: 0, touchRotate: false, shiftKeyRotate: false, rotateControl: false,
  maxBounds: [[-34.72, -58.66], [-34.08, -57.66]], maxBoundsViscosity: 0.8, inertia: false, attributionControl: true }).setView([-34.47, -58.47], 13);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__mapa = mapa; // solo para pruebas locales
// Con mapa girable: capas de dibujo dentro del panel que gira; etiquetas en el que no gira (texto siempre derecho)
const panelGira = mapa.getPane('rotatePane'), panelFijo = mapa.getPane('norotatePane');
const nuevoPanel = (nombre, z, fijo) => { const p = mapa.createPane(nombre, (fijo ? panelFijo : panelGira) || undefined); p.style.zIndex = z; return p; };
mapa.attributionControl.setPrefix('').addAttribution('Carta: SHN H‑118 · Boyas: UNEN · Ríos: © OpenStreetMap');
const renderer = L.canvas({ padding: 0.3 });
nuevoPanel('carta', 200);
nuevoPanel('grilla', 300);
nuevoPanel('ruta', 390);
// Cada capa con su propio lienzo: si no, la carta (opaca) tapa la grilla y la ruta
// margen 0,5 (antes 0,8): leaflet-rotate ya agranda el lienzo para cubrir el mapa girado; la grilla (pocas líneas) va en SVG
const lienzoCarta = L.canvas({ pane: 'carta', padding: 0.5 }), lienzoGrilla = L.svg({ pane: 'grilla', padding: 0.5 });
nuevoPanel('etiquetas', 420, true);

// Colores de carta. Dos juegos para elegir en Info → Colores (se puede volver cuando se quiera); día y noche según el teléfono.
//   clásica: carta de papel (tierra amarilla) · plotter: tonos de plotter (tierra naranja, se seca verde agua, somero turquesa)
const PALETAS = {
  clasica: {
    dia:   { agua: '#7cc6ec', profunda: '#eef7fc', seca: '#a8d08d', tierra: '#f2df6b', borde: '#00000040', grilla: '#c2188f', grad: [[86, 172, 226], [246, 251, 255]] },
    noche: { agua: '#1d4f6e', profunda: '#2f6b8d', seca: '#3f5a33', tierra: '#4d4726', borde: '#ffffff30', grilla: '#e05bb7', grad: [[18, 58, 92], [52, 110, 140]] } },
  plotter: {
    dia:   { agua: '#7dd3e2', profunda: '#c9eef5', seca: '#56a891', tierra: '#f3bf6d', borde: '#00000040', grilla: '#c2188f', grad: [[79, 194, 215], [205, 240, 247]] },
    noche: { agua: '#1c5866', profunda: '#2d7584', seca: '#2c5a4d', tierra: '#7a5a2c', borde: '#ffffff30', grilla: '#e05bb7', grad: [[22, 86, 102], [58, 136, 152]] } },
  // mínima: navegación nocturna, todo negro; solo el contorno de la costa y de los bancos que se secan
  minima: {
    dia:   { agua: '#000', profunda: '#000', seca: '#000', tierra: '#000', borde: '#8fa3ae', grilla: '#26353e', grad: [[0, 0, 0], [0, 0, 0]] },
    noche: { agua: '#000', profunda: '#000', seca: '#000', tierra: '#000', borde: '#8fa3ae', grilla: '#26353e', grad: [[0, 0, 0], [0, 0, 0]] } },
};
let paleta = PALETAS[leer('paleta', 'clasica')] ? leer('paleta', 'clasica') : 'clasica';
const PALETA = { get dia() { return PALETAS[paleta].dia; }, get noche() { return PALETAS[paleta].noche; } };
const oscuro = matchMedia('(prefers-color-scheme: dark)');
const modo = () => { const t = document.documentElement.dataset.theme; return t === 'dark' ? 'noche' : t === 'light' ? 'dia' : oscuro.matches ? 'noche' : 'dia'; };
const col = k => PALETA[modo()][k];
let capasCarta = [];
// la tierra sin contorno: donde se juntan cartas (Colonia SOHMA, OSM, recuadros) el contorno dibujaba líneas rectas sobre tierra
const estiloZona = f => paleta === 'minima'
  ? { stroke: f.properties.z === 'tierra' || f.properties.z === 'seca', color: col('borde'), weight: 2.2, fillColor: '#000', fillOpacity: 1 }
  : { stroke: f.properties.z === 'seca', color: col('borde'), weight: 0.6, fillColor: col(f.properties.z) || col('agua'), fillOpacity: 1 };
// Mínima: la tierra se vuelve a rellenar encima (sin contorno): así solo queda la línea de costa, no las uniones entre cartas
const cartasCargadas = []; let capasRelleno = [];
function rehacerRelleno() {
  capasRelleno.forEach(l => l.remove());
  capasRelleno = paleta !== 'minima' ? [] : cartasCargadas.map(gj => L.geoJSON(gj, { pane: 'tierra', renderer: lienzoTierra, interactive: false,
    filter: f => f.properties.z === 'tierra' || f.properties.z === 'seca', style: { stroke: false, fillColor: '#000', fillOpacity: 1 } }).addTo(mapa));
}
nuevoPanel('tierra', 260); // la tierra siempre arriba del degradé y del rayado
const lienzoTierra = L.canvas({ pane: 'tierra', padding: 0.5 });
function agregarCarta(gj) {
  const esTierra = f => f.properties.z === 'tierra' || f.properties.z === 'seca';
  capasCarta.push(L.geoJSON(gj, { pane: 'carta', renderer: lienzoCarta, interactive: false, style: estiloZona, filter: f => !esTierra(f) }).addTo(mapa));
  capasCarta.push(L.geoJSON(gj, { pane: 'tierra', renderer: lienzoTierra, interactive: false, style: estiloZona, filter: esTierra }).addTo(mapa));
  cartasCargadas.push(gj); if (paleta === 'minima') rehacerRelleno();
}
fetch('datos/carta.geojson').then(r => r.json()).then(agregarCarta).catch(() => {});
fetch('datos/carta_h116.geojson').then(r => r.json()).then(agregarCarta).catch(() => {}); // tierra fuera de las cartas de detalle (SHN H-116)
// Ríos y arroyos del Delta (OSM), solo donde las cartas tenían tierra; se cargan al acercarse al Delta
nuevoPanel('delta', 262);
const lienzoDelta = L.canvas({ pane: 'delta', padding: 0.5 });
const estiloDelta = f => paleta === 'minima'
  ? { stroke: true, color: col('borde'), weight: 1, opacity: 0.8, fill: f.properties.z === 'agua', fillColor: '#000', fillOpacity: 1 }
  : f.properties.z === 'agua' ? { stroke: false, fillColor: col('agua'), fillOpacity: 1 } : { color: col('agua'), weight: 2, opacity: 1 };
let capaDelta = null, deltaPedido = false;
function cargarDelta() {
  if (deltaPedido || mapa.getZoom() < 10 || !mapa.getBounds().intersects(L.latLngBounds([-34.47, -58.95], [-33.85, -58.33]))) return;
  deltaPedido = true;
  fetch('datos/delta.geojson').then(r => r.json()).then(gj => { capaDelta = L.geoJSON(gj, { pane: 'delta', renderer: lienzoDelta, interactive: false, style: estiloDelta }).addTo(mapa); })
    .catch(() => { deltaPedido = false; });
}
// repinta todo lo que depende de los colores (cambio día/noche del teléfono o de juego de colores en Info)
function aplicarColores() {
  const r = document.documentElement.style, min = paleta === 'minima';
  if (typeof aplicarTema === 'function' && typeof tema !== 'undefined') aplicarTema(); // Mínima fuerza la interfaz oscura
  document.getElementById('mapa').classList.toggle('minima', min);
  if (typeof capaProf !== 'undefined' && !mapa.hasLayer(capaProf)) capaProf.addTo(mapa); // en Mínima dibuja solo el rayado gris
  if (typeof capaSond !== 'undefined') { if (min) capaSond.remove(); else if (verSond && !mapa.hasLayer(capaSond)) capaSond.addTo(mapa); }
  rehacerRelleno();
  if (paleta === 'clasica') ['--tierra', '--seca', '--agua', '--honda', '--grad'].forEach(v => r.removeProperty(v));
  else { r.setProperty('--tierra', col('tierra')); r.setProperty('--seca', col('seca')); r.setProperty('--agua', col('agua')); r.setProperty('--honda', col('profunda')); }
  const g = col('grad'); r.setProperty('--grad', `linear-gradient(90deg,rgb(${g[0]}),rgb(${g[1]}))`);
  capasCarta.forEach(c => c.setStyle(estiloZona)); if (capaDelta) capaDelta.setStyle(estiloDelta);
  if (typeof dibujarNoPasa === 'function') { dibujarNoPasa(); capaSond.redraw(); }
  document.getElementById('mapa').style.background = col('agua'); dibujarGrilla();
}
oscuro.addEventListener('change', aplicarColores);
document.getElementById('mapa').style.background = col('agua');

/* ---------- Grilla de latitud y longitud ---------- */
const grilla = L.layerGroup().addTo(mapa);
let verCoords = leer('verCoords', false); // Info → «Mostrar coordenadas»; por defecto oculta (el mapa va más liviano)
function dibujarGrilla() {
  grilla.clearLayers();
  if (!verCoords) return;
  const z = mapa.getZoom(), b = mapa.getBounds().pad(0.1);
  const paso = z >= 15 ? 0.5 : z >= 13 ? 1 : z >= 11 ? 5 : 10; // minutos
  const p = paso / 60, cg = col('grilla');
  for (let la = Math.floor(b.getSouth() / p) * p; la <= b.getNorth(); la += p) {
    L.polyline([[la, b.getWest()], [la, b.getEast()]], { pane: 'grilla', color: cg, weight: 0.7, opacity: 0.55, interactive: false, renderer: lienzoGrilla }).addTo(grilla);
    L.marker([la, mapa.getBounds().getWest()], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: 'grat', html: esc(fmtLat(la).replace(/,000'/, "'")), iconAnchor: [-4, 18] }) }).addTo(grilla);
  }
  for (let lo = Math.floor(b.getWest() / p) * p; lo <= b.getEast(); lo += p) {
    L.polyline([[b.getSouth(), lo], [b.getNorth(), lo]], { pane: 'grilla', color: cg, weight: 0.7, opacity: 0.55, interactive: false, renderer: lienzoGrilla }).addTo(grilla);
    L.marker([mapa.getBounds().getSouth(), lo], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: 'grat', html: esc(fmtLon(lo).replace(/,000'/, "'")), iconAnchor: [-4, innerWidth <= 700 ? 22 : 44] }) }).addTo(grilla);
  }
}
mapa.on('moveend zoomend', dibujarGrilla); dibujarGrilla();

/* ---------- Ríos y lugares ---------- */
// Grupo que pone en el mapa solo lo que cae en pantalla (+ margen): con ~460 boyas, señales y nombres, el teléfono
// mueve, gira y hace zoom con muchos menos elementos vivos. Lo que tiene la ficha abierta no se saca.
const GrupoVisible = L.LayerGroup.extend({
  onAdd(map) { map.on('moveend', this._ver, this); this._ver(); },
  onRemove(map) { map.off('moveend', this._ver, this); this.eachLayer(l => map.removeLayer(l)); },
  addLayer(l) { this._layers[this.getLayerId(l)] = l; if (this._map) this._uno(l, this._caja()); return this; },
  removeLayer(l) { const id = l in this._layers ? l : this.getLayerId(l), x = this._layers[id]; if (x && this._map) this._map.removeLayer(x); delete this._layers[id]; return this; },
  _caja() { return this._map.getBounds().pad(0.5); },
  _ver() { if (!this._map) return; const b = this._caja(); this.eachLayer(l => this._uno(l, b)); },
  _uno(l, b) {
    const ver = !l.getLatLng || b.contains(l.getLatLng()) || (l.isPopupOpen && l.isPopupOpen()), esta = this._map.hasLayer(l);
    if (ver && !esta) this._map.addLayer(l); else if (!ver && esta) this._map.removeLayer(l);
  },
});
const grupoVisible = () => new GrupoVisible();
const etRios = grupoVisible();
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
// Nombres del Delta (OSM, con la grafía de la H-118 donde difiere): ríos desde zoom 12, arroyos y canales desde 14
const etArroyos = grupoVisible();
fetch('datos/nombres_delta.json').then(r => r.json()).then(l => {
  for (const [n, la, lo, ang, g] of l) L.marker([la, lo], { pane: 'etiquetas', interactive: false,
    icon: L.divIcon({ className: '', html: `<div class="et-rio${g === 2 ? ' chico' : ''}" style="transform:translate(-50%,-50%) rotate(${ang}deg)">${esc(n)}</div>`, iconSize: [0, 0] }) }).addTo(g === 1 ? etRios : etArroyos);
  rotulosLuego();
}).catch(() => {});
// Rótulos de ríos y canales sin pisarse (pedido de Marto: "al alejarse es una maraña"): canales del puerto, ríos y después arroyos;
// el que choca con uno ya puesto se oculta. Choque de rectángulos girados (ejes separadores), con el giro del mapa incluido.
const choca = (a, b) => [[a.c, a.s], [-a.s, a.c], [b.c, b.s], [-b.s, b.c]].every(([ux, uy]) => {
  const d = Math.abs((b.x - a.x) * ux + (b.y - a.y) * uy);
  return d <= a.w * Math.abs(a.c * ux + a.s * uy) + a.h * Math.abs(a.c * uy - a.s * ux) + b.w * Math.abs(b.c * ux + b.s * uy) + b.h * Math.abs(b.c * uy - b.s * ux);
});
function ordenarRotulos() {
  const els = [...document.querySelectorAll('.leaflet-etiquetas-pane :is(.et-lugar, .et-boya, .et-zona, .et-rio, .et-canal)')], giro = mapa.getBearing ? mapa.getBearing() : 0;
  const prio = e => { const k = e.classList; return k.contains('et-lugar') ? 0 : k.contains('et-destacada') || k.contains('et-canal') ? 1 : k.contains('et-zona') ? 2 : k.contains('chico') ? 4 : 3; };
  els.forEach(e => { e.style.visibility = ''; });
  const med = els.map(e => {
    const r = e.getBoundingClientRect(), ang = (parseFloat((e.style.transform.match(/rotate\(([-\d.]+)deg/) || [0, 0])[1]) + giro) * Math.PI / 180;
    const sw = Math.max(e.scrollWidth, e.offsetWidth), c = Math.cos(ang), s = Math.sin(ang), corr = e.offsetWidth < sw - 1 ? sw / 2 : 0; // texto que desborda una caja angosta
    return { e, p: prio(e), x: r.left + r.width / 2 + corr * c, y: r.top + r.height / 2 + corr * s, w: sw / 2 + 8, h: e.offsetHeight / 2 + 3, c, s, ok: r.height > 0 };
  }).filter(m => m.ok).sort((x, y) => x.p - y.p || y.e.textContent.length - x.e.textContent.length);
  const puestas = [];
  for (const m of med) { if (puestas.some(p => choca(p, m))) m.e.style.visibility = 'hidden'; else puestas.push(m); }
}
let _tRot; const rotulosLuego = () => { clearTimeout(_tRot); _tRot = setTimeout(ordenarRotulos, 80); };
const LUGARES = [ // posiciones de referencia para nombres (no son puntos de navegación)
  ['San Isidro', -34.4715, -58.5135], ['Olivos', -34.5085, -58.4865], ['Núñez', -34.5440, -58.4610], ['Tigre', -34.4230, -58.5800],
  ['San Fernando', -34.4420, -58.5560], ['Buenos Aires', -34.6040, -58.3900], ['Isla Martín García', -34.1760, -58.2560], ['Colonia del Sacramento', -34.4640, -57.8300], ['Conchillas', -34.1643, -58.0333], ['Riachuelo', -34.4380, -57.7240],
];
const etLugares = L.layerGroup(LUGARES.map(([n, la, lo]) => L.marker([la, lo], { pane: 'etiquetas', interactive: false,
  icon: L.divIcon({ className: '', html: `<div class="et-lugar" style="transform:translate(-50%,-50%)">${esc(n)}</div>`, iconSize: [0, 0] }) })));
const etRdlp = L.marker([-34.42, -58.30], { pane: 'etiquetas', interactive: false,
  icon: L.divIcon({ className: '', html: '<div class="et-grande" style="transform:translate(-50%,-50%)">Río de la Plata</div>', iconSize: [0, 0] }) });
function etiquetasSegunZoom() {
  const z = mapa.getZoom();
  document.getElementById('mapa').classList.toggle('lejos', z < 13); // de lejos: solo lugares y "Río de la Plata"
  z >= 12 ? etRios.addTo(mapa) : etRios.remove();
  z >= 14 ? etArroyos.addTo(mapa) : etArroyos.remove();
  z >= 11 ? etLugares.addTo(mapa) : etLugares.remove();
  z <= 12 ? etRdlp.addTo(mapa) : etRdlp.remove();
  z >= 15 ? etBoyas.addTo(mapa) : etBoyas.remove();
}

/* ---------- Boyas (posición UNEN manda) ---------- */
const capaBoyas = grupoVisible().addTo(mapa), etBoyas = grupoVisible(), etDestacadas = grupoVisible().addTo(mapa);
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
  return L.divIcon({ className: 'toque', iconSize: [24, 30], iconAnchor: [12, 26], popupAnchor: [0, -24],
    html: `<svg width="24" height="30" viewBox="0 0 24 30" aria-hidden="true"><circle cx="12" cy="26" r="1.6" fill="#000"/>${cuerpo}</svg>` });
}
const NOMBRE_TIPO = { roja: 'Lateral roja', verde: 'Lateral verde', bif: 'Bifurcación', peligro: 'Peligro aislado', segura: 'Aguas seguras', card: 'Cardinal', especial: 'Especial' };
let boyas = [], posGps = null;
function popupBoya(b, tp) {
  const p = L.latLng(b.lat, b.lon);
  const desde = posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(distM(posGps, p))}</p>` : '';
  return `<h3>${esc(b.name)}</h3><p>${esc(NOMBRE_TIPO[tp.k] + (tp.d ? ' ' + tp.d : ''))}${b.funcType ? ' · ' + esc(b.funcType) : ''}</p>`
    + (b.characteristics ? `<p>Luz: ${esc(b.characteristics)}</p>` : '')
    + `<p style="font-variant-numeric:tabular-nums">${esc(fmtLat(b.lat))}<br>${esc(fmtLon(b.lon))}</p>`
    + (b.status && b.status !== 'OK' ? `<p><strong>${esc(b.status)}</strong></p>` : '') + desde;
}
/* Nombres de boyas: un par (roja y verde del mismo Km, o las dos marcas de un mismo naufragio) lleva el nombre UNA vez, en el medio */
const limpiarNombre = t => String(t).replace(/\s*\((roj[ao]|verde)\)/ig, '').replace(/\s+(roj[ao]|verde)\b/ig, '').replace(/\s+EX\s+C\d+\b/i, '').trim();
const etiquetasPar = new Map(); // clave → [{ m, ll, n }]
function etiquetaBoya(ll, texto, { grupo = etBoyas, clase = 'et-boya', dx = 12, dy = -22, interactive = false, alTocar = null } = {}) {
  ll = L.latLng(ll); const t = limpiarNombre(texto), clave = t.toUpperCase();
  const previos = etiquetasPar.get(clave) || [], par = previos.find(e => e.n === 1 && e.ll.distanceTo(ll) < 600);
  if (par) { // segunda boya del par: se mueve la etiqueta al medio y se centra
    par.n = 2; const medio = L.latLng((par.ll.lat + ll.lat) / 2, (par.ll.lng + ll.lng) / 2);
    par.m.setLatLng(medio).setIcon(L.divIcon({ className: '', html: `<div class="${clase}" style="transform:translate(-50%,-50%)">${esc(t)}</div>`, iconSize: [0, 0] }));
    return par.m;
  }
  const m = L.marker(ll, { pane: 'etiquetas', interactive, bubblingMouseEvents: false,
    icon: L.divIcon({ className: '', html: `<div class="${clase}" style="transform:translate(${dx}px,${dy}px)">${esc(t)}</div>`, iconSize: [0, 0] }) });
  if (alTocar) m.on('click', alTocar);
  m.addTo(grupo); previos.push({ m, ll, n: 1 }); etiquetasPar.set(clave, previos);
  return m;
}
let boyasFecha = '';
fetch('datos/boyas.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  boyasFecha = d.archivo_modificado ? new Date(d.archivo_modificado).toLocaleDateString('es-AR') : (d.descargado || '');
  boyas = d.boyas.filter(b => typeof b.lat === 'number' && typeof b.lon === 'number');
  for (const b of boyas) {
    const tp = tipoBoya(b);
    L.marker([b.lat, b.lon], { icon: iconoBoya(tp), title: b.name, keyboard: true }).addTo(capaBoyas);
    ficha(capaBoyas.getLayers()[capaBoyas.getLayers().length - 1], b.lat, b.lon, nombreLindo(b.name.replace(/\s*\((Roja|Verde)\)/i, '')), [NOMBRE_TIPO[tp.k] + (tp.d ? ' ' + tp.d : ''), b.characteristics ? b.characteristics.replace(/\s*\(.*\)\s*$/, '') : '', b.status && b.status !== 'OK' ? b.status : ''].filter(Boolean).join(' · '));
    const destacada = DESTACADAS.includes(b.name.toUpperCase()), mk = capaBoyas.getLayers()[capaBoyas.getLayers().length - 1];
    etiquetaBoya([b.lat, b.lon], destacada ? nombreLindo(b.name) : b.name, { grupo: destacada ? etDestacadas : etBoyas, clase: destacada ? 'et-boya et-destacada' : 'et-boya', interactive: destacada, alTocar: () => mk.openPopup() });
  }
  etiquetasSegunZoom();
  dibujarRuta();
  armarCorredor(); armarCanales(); dibujarNoPasa(); dibujarPasoMitre(); capaSond.redraw(); // sin sondajes viejos dentro del Costanero
});
mapa.on('zoomend', etiquetasSegunZoom);

/* ---------- Capa dinámica "no pasás": profundidad de carta + altura actual del río < calado + margen ---------- */
const MARGEN = 0.30; // m bajo la quilla
const GRAD = { get dia() { return PALETA.dia.grad; }, get noche() { return PALETA.noche.grad; } }; // somero → hondo (según el juego de colores)
const profs = []; // grillas de profundidad (una por zona/carta), cada una con su referencia de altura
const LAT_SF = -34.44, LAT_BA = -34.58;
// Colonia (SOHMA): profundidades al plano de reducción de Colonia. Sin altura en vivo todavía → 0 (conservador: como si el río estuviera en ese plano)
function alturaColonia() { const a = alturaAhora(sit && sit.mareografos && sit.mareografos.COLO); return a ? a.h : 0; }
/* Colonia y Montevideo: predicción SOHMA (tabla horaria) + efecto del viento medido en Martín García (Colonia) */
let mareasUY = null;
fetch('datos/mareas_uy.json').then(r => r.json()).then(d => { mareasUY = d; if (sit) { armarUY(); pintarSituacion(); dibujarNoPasa(); } }).catch(() => {});
function armarUY() {
  if (!sit || !mareasUY) return;
  sit.mareografos = sit.mareografos || {};
  const loc = t => new Date(t - 3 * 3600e3), iso = t => { const d = loc(t); return d.toISOString().slice(0, 13) + ':00:00'; };
  const ahora = Date.now(), h0 = Math.floor((ahora - 3 * 3600e3) / 3600e3) * 3600e3 + 3 * 3600e3;
  const maga = sit.mareografos.MAGA, e = maga && estimacion(maga), dif = e ? e.dif : 0;
  for (const [cod, p, nombre, conViento] of [['COLO', 'colonia', 'Colonia', true], ['MVD', 'montevideo', 'Montevideo', false]]) {
    const serie = mareasUY[p] && mareasUY[p].serie; if (!serie) continue;
    const ast = [];
    for (let t = h0 - 12 * 3600e3; t <= h0 + 36 * 3600e3; t += 3600e3) {
      const d = loc(t), v = serie[d.toISOString().slice(0, 10)];
      if (v) ast.push([iso(t), v[d.getUTCHours()] / 100]);
    }
    const d0 = conViento ? dif : 0;
    sit.mareografos[cod] = { nombre, astronomica: ast, observada: ast.filter(x => x[0] <= iso(ahora)).map(x => [x[0], +(x[1] + d0).toFixed(2)]),
      notaUY: conViento ? 'estimada (SOHMA + viento)' : 'predicción SOHMA' };
  }
}
const alturaDe = (p, lat) => p.ref === 'colonia' ? alturaColonia() : alturaRio(lat);
function alturaRio(lat) { // interpola San Fernando ↔ Buenos Aires por latitud; sin dato: 0 (cero de la carta, conservador)
  const m = sit && sit.mareografos, sf = m && alturaAhora(m.SFER), ba = m && alturaAhora(m.BSAS);
  const hs = sf ? sf.h : (ba ? ba.h : 0), hb = ba ? ba.h : hs;
  const t = Math.min(Math.max((lat - LAT_SF) / (LAT_BA - LAT_SF), 0), 1);
  return hs + (hb - hs) * t - (sf || ba ? DIF_PRS : 0);
}
function profCarta(lat, lon) { for (const p of profs) { const z = profEn(p, lat, lon); if (z !== null) return z; } return null; }
function profEn(prof, lat, lon) { // bilineal, null si no hay dato
  if (lon < prof.w || lon > prof.e || lat < prof.s || lat > prof.n) return null;
  const fx = (lon - prof.w) / (prof.e - prof.w) * prof.cols - 0.5, fy = (prof.n - lat) / (prof.n - prof.s) * prof.rows - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy); if (x0 < 0 || y0 < 0 || x0 + 1 >= prof.cols || y0 + 1 >= prof.rows) return null;
  const g = (x, y) => prof.q[y * prof.cols + x];
  const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  // bilineal con pesos renormalizados: en los bordes sin dato no queda "en escalones"
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], v = [a, b, c, d];
  let suma = 0, peso = 0;
  for (let i = 0; i < 4; i++) if (v[i] !== -128) { suma += v[i] * w[i]; peso += w[i]; }
  return peso < 0.5 ? null : suma / peso / 10;
}
// Corredor del Canal Costanero entre las boyas UNEN (rojas de un lado, verdes del otro): ahí manda la determinante
let corredor = null;
function armarCorredor() {
  const B = Object.fromEntries(boyas.map(b => [b.name, b]));
  const rojas = ['KM 24 (Roja)', 'KM 23', 'KM 22 ROJA', 'KM 21 ROJO', 'KM 20.2 ROJA', 'KM 19.3 EX C1'].map(n => B[n]).filter(Boolean);
  const verdes = ['KM 24 (Verde)', 'KM 23 VERDE', 'KM 22 VERDE', 'KM 21 VERDE', 'KM 20.2 VERDE EX C2', 'KM 19.3 EX C1'].map(n => B[n]).filter(Boolean);
  corredor = rojas.length > 2 && verdes.length > 2 ? [...rojas, ...verdes.reverse()].map(b => [b.lon, b.lat]) : null;
}
/* Canales balizados por UNEN donde la carta SHN 2016 quedó vieja: adentro manda la profundidad publicada (como en el Costanero)
   · boca del Río Luján (Km 23 → Km 24 → Puerto San Isidro → Las Heras): sigue al ex Canal Costanero → determinante 1,20 m
   · aguaje Rivademar (Km 23 → Rivademar 1, 2, 3 → viga San Antonio): 1 m al cero (relevamiento oct-2020, Barcos/Kalfayan) */
let canales = [];
function pasillo(pts, m) { // eje [[lat, lon]...] → franja de ±m metros, anillo [[lon, lat]...]
  const izq = [], der = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)], kx = 111320 * Math.cos(rad(pts[i][0])), ky = 110540;
    let dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    izq.push([pts[i][1] - dy * m / kx, pts[i][0] + dx * m / ky]); der.push([pts[i][1] + dy * m / kx, pts[i][0] - dx * m / ky]);
  }
  return [...izq, ...der.reverse()];
}
function dentroAnillo(lon, lat, r) {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > lat) !== (r[j][1] > lat) && lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) dentro = !dentro;
  return dentro;
}
function armarCanales() {
  const B = Object.fromEntries(boyas.map(b => [b.name, [b.lat, b.lon]])), medio = (a, b) => a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : null;
  const defs = [
    { n: 'Boca del Río Luján', min: DETERMINANTE, m: 90, eje: [B['KM 23'], medio(B['KM 24 (Roja)'], B['KM 24 (Verde)']), medio(B['Puerto San Isidro (Roja)'], B['Puerto San Isidro (Verde)']), B['Las Heras']] },
    { n: 'Aguaje Rivademar', min: 1.0, m: 60, eje: [B['KM 23'], B['RIVADEMAR 1'], B['RIVADEMAR 2'], B['RIVADEMAR 3'], B['RIVADEMAR VIGA SAN ANTONIO']] },
  ];
  canales = defs.filter(c => c.eje.every(Boolean)).map(c => {
    const r = pasillo(c.eje, c.m);
    return { ...c, r, w: Math.min(...r.map(x => x[0])), e: Math.max(...r.map(x => x[0])), s: Math.min(...r.map(x => x[1])), n: Math.max(...r.map(x => x[1])) };
  });
}
const enCanal = (lon, lat) => canales.find(c => lon >= c.w && lon <= c.e && lat >= c.s && lat <= c.n && dentroAnillo(lon, lat, c.r));
function enCorredor(lon, lat) {
  if (!corredor) return false;
  let dentro = false;
  for (let i = 0, j = corredor.length - 1; i < corredor.length; j = i++) {
    const [xi, yi] = corredor[i], [xj, yj] = corredor[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
/* Profundidad + rayado "no pasás" en mosaicos de 256 px, como un plotter: solo se calcula lo que está en pantalla,
   a la resolución de la pantalla, de a poco (sin trabar el teléfono). Si cambia la altura o el calado se repintan
   los mosaicos que ya están, sin parpadeo. (Antes: una imagen de 8,5 millones de píxeles por grilla, ~1,3 s por dibujo.) */
const TILE = 256, PER = 13, LIN = 3.5, FUNDIDO = 0.012; // FUNDIDO: grados (~1,2 km) de transición entre cartas // rayado a 45°: período ~9 px y línea ~2,5 px medidos en perpendicular
let bufTile = null;
/* Dársenas, diques y marinas (OSM): adentro no se pinta nada (la carta las marca como "se seca"; están dragadas) */
let darsenas = []; // { p: [[lat, lon]...], w, s, e, n }
fetch('datos/darsenas.json').then(r => r.json()).then(d => {
  darsenas = d.poligonos.map(p => ({ p, w: Math.min(...p.map(x => x[1])), e: Math.max(...p.map(x => x[1])), s: Math.min(...p.map(x => x[0])), n: Math.max(...p.map(x => x[0])) }));
  claveProf = ''; dibujarNoPasa(); capaSond.redraw();
}).catch(() => {});
const mercY = la => (1 - Math.log(Math.tan(Math.PI / 4 + rad(la) / 2)) / Math.PI) / 2;
function enDarsena(la, lo) {
  for (const d of darsenas) {
    if (lo < d.w || lo > d.e || la < d.s || la > d.n) continue;
    let dentro = false; const p = d.p;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++)
      if ((p[i][0] > la) !== (p[j][0] > la) && lo < (p[j][1] - p[i][1]) * (la - p[i][0]) / (p[j][0] - p[i][0]) + p[i][1]) dentro = !dentro;
    if (dentro) return true;
  }
  return false;
}
let lienzoMasc = null;
function mascaraDarsenas(w, s, e, n, N, x0, y0) { // máscara del mosaico (null si no toca ninguna dársena)
  const ds = darsenas.filter(d => d.e > w && d.w < e && d.n > s && d.s < n); if (!ds.length) return null;
  if (!lienzoMasc) { lienzoMasc = document.createElement('canvas'); lienzoMasc.width = lienzoMasc.height = TILE; }
  const g = lienzoMasc.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, TILE, TILE); g.fillStyle = '#000';
  for (const d of ds) { g.beginPath(); d.p.forEach(([la, lo], i) => { const x = (lo + 180) / 360 * N - x0, y = mercY(la) * N - y0; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); }
  return g.getImageData(0, 0, TILE, TILE).data;
}
function pintarTile(cv, c) {
  const g = cv.getContext('2d'), N = TILE * 2 ** c.z, x0 = c.x * TILE, y0 = c.y * TILE;
  const lonDe = px => px / N * 360 - 180, latDe = py => deg(Math.atan(Math.sinh(Math.PI * (1 - 2 * py / N))));
  const w = lonDe(x0), e = lonDe(x0 + TILE), n = latDe(y0), s = latDe(y0 + TILE);
  const gr = profs.filter(p => p.e > w && p.w < e && p.n > s && p.s < n); // ya ordenadas por prioridad
  g.clearRect(0, 0, TILE, TILE);
  if (!gr.length) return;
  if (!bufTile) bufTile = g.createImageData(TILE, TILE);
  const d = bufTile.data; d.fill(0);
  const umbral = (parseFloat(calado.value) || 0) + MARGEN, A = GRAD[modo()], min = paleta === 'minima'; // Mínima: sin degradé, rayado gris tenue
  const pre = gr.map(p => { // por grilla: columna → x en la grilla, fila → y en la grilla y altura del río
    const fx = new Float32Array(TILE), fy = new Float32Array(TILE), h = new Float32Array(TILE), bx = new Float32Array(TILE), by = new Float32Array(TILE);
    for (let i = 0; i < TILE; i++) { const lon = lonDe(x0 + i + 0.5); fx[i] = (lon - p.w) / (p.e - p.w) * p.cols - 0.5; bx[i] = Math.min(lon - p.w, p.e - lon); }
    for (let j = 0; j < TILE; j++) { const lat = latDe(y0 + j + 0.5); fy[j] = (p.n - lat) / (p.n - p.s) * p.rows - 0.5; h[j] = alturaDe(p, lat); by[j] = Math.min(lat - p.s, p.n - lat); }
    return { p, fx, fy, h, bx, by };
  });
  const tocaCorredor = corredor && n > -34.475 && s < -34.445 && e > -58.505 && w < -58.465;
  const masc = mascaraDarsenas(w, s, e, n, N, x0, y0);
  const canT = canales.filter(c => c.e > w && c.w < e && c.n > s && c.s < n);
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      let z = null, hh = 0, wTop = 1, solo = true;
      for (const { p, fx, fy, h, bx, by } of pre) { // bilineal con pesos renormalizados (igual que profEn); la de más prioridad manda
        const X = fx[i], Y = fy[j], xi = Math.floor(X), yi = Math.floor(Y);
        if (xi < 0 || yi < 0 || xi + 1 >= p.cols || yi + 1 >= p.rows) continue;
        const q = p.q, k = yi * p.cols + xi, tx = X - xi, ty = Y - yi, a = q[k], b = q[k + 1], c2 = q[k + p.cols], d2 = q[k + p.cols + 1];
        let suma = 0, peso = 0, wt;
        if (a !== -128) { wt = (1 - tx) * (1 - ty); suma += a * wt; peso += wt; }
        if (b !== -128) { wt = tx * (1 - ty); suma += b * wt; peso += wt; }
        if (c2 !== -128) { wt = (1 - tx) * ty; suma += c2 * wt; peso += wt; }
        if (d2 !== -128) { wt = tx * ty; suma += d2 * wt; peso += wt; }
        if (peso < 0.5) continue;
        const zi = suma / peso / 10;
        if (z === null) { // la de más prioridad; cerca de su borde se funde con la siguiente (FUNDIDO grados): sin cajas a la vista
          z = zi; hh = h[j]; wTop = Math.min(Math.max(Math.min(bx[i], by[j]) / FUNDIDO, 0), 1);
          if (wTop >= 1 || !p.fundir) break;
        } else { z = wTop * z + (1 - wTop) * zi; hh = wTop * hh + (1 - wTop) * h[j]; solo = false; break; }
      }
      if (z === null || (masc && masc[(j * TILE + i) * 4 + 3] > 127)) continue;
      if (canT.length) { const lon = lonDe(x0 + i + 0.5), lat = latDe(y0 + j + 0.5);
        for (const c of canT) if (z < c.min + DIF_PRS && lon >= c.w && lon <= c.e && lat >= c.s && lat <= c.n && dentroAnillo(lon, lat, c.r)) z = c.min + DIF_PRS; }
      if (tocaCorredor && z < DETERMINANTE + DIF_PRS) { // UNEN ya está al cero nuevo; la grilla (H-118) al viejo
        const lat = latDe(y0 + j + 0.5), lon = lonDe(x0 + i + 0.5);
        if (lat > -34.475 && lat < -34.445 && lon > -58.505 && lon < -58.465 && enCorredor(lon, lat)) z = DETERMINANTE + DIF_PRS;
      }
      const o = (j * TILE + i) * 4, dA = z + hh;
      let r = 0, gg = 0, bb = 0, al = 0;
      if (z > -0.05 && !min) { // degradé tipo plotter: azul donde hay poca agua → blanco donde sobra
        const t = Math.min(Math.max((dA - umbral) / 3, 0), 1);
        r = A[0][0] + (A[1][0] - A[0][0]) * t; gg = A[0][1] + (A[1][1] - A[0][1]) * t; bb = A[0][2] + (A[1][2] - A[0][2]) * t;
        al = solo && wTop < 1 ? 255 * wTop : 255; // borde de lo que cubren las cartas: el degradé se desvanece (sin línea recta)
      }
      if (dA < umbral && min) { // Mínima: solo las líneas del rayado, en gris tenue sobre el negro
        const m = (((x0 + i) - (y0 + j)) % PER + PER) % PER;
        if (m < LIN + 0.5) { r = 128; gg = 142; bb = 152; al = m < LIN - 0.5 ? 120 : 60; }
      } else if (dA < umbral) { // rayado negro, continuo entre mosaicos (se mide en píxeles globales)
        const m = (((x0 + i) - (y0 + j)) % PER + PER) % PER, k = m < LIN - 0.5 ? 0.85 : m < LIN + 0.5 ? 0.55 : 0.28;
        if (al === 255) { r *= 1 - k; gg *= 1 - k; bb *= 1 - k; } else if (al) { const a1 = al / 255, a = a1 + k * (1 - a1); r = r * a1 * (1 - k) / a; gg = gg * a1 * (1 - k) / a; bb = bb * a1 * (1 - k) / a; al = 255 * a; } else al = 255 * k;
      }
      d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = al;
    }
  }
  g.putImageData(bufTile, 0, 0);
}
/* Sondajes de la carta (m al cero de cada carta), como en papel: entero en itálica y el decimal chico abajo a la derecha.
   Capa propia de mosaicos a la resolución real de la pantalla (texto nítido en el celular), desde zoom 13. En el Costanero no: ahí manda UNEN. */
let sondajes = [];
const CapaSond = L.GridLayer.extend({
  createTile(c) {
    const r = Math.min(devicePixelRatio || 1, 3), cv = document.createElement('canvas'); cv.width = cv.height = TILE * r;
    const g = cv.getContext('2d'); g.scale(r, r);
    pintarSondajes(g, c, TILE * 2 ** c.z, c.x * TILE, c.y * TILE); return cv;
  },
});
nuevoPanel('sondajes', 250);
const capaSond = new CapaSond({ pane: 'sondajes', tileSize: TILE, minZoom: 13, updateWhenZooming: false, keepBuffer: 1 });
let verSond = leer('verSond', false); if (verSond) capaSond.addTo(mapa); // Info → «Mostrar profundidades»; por defecto ocultas
fetch('datos/sondajes.json').then(r => r.json()).then(d => { sondajes = [...d.shn, ...d.sohma]; capaSond.redraw(); }).catch(() => {});
function pintarSondajes(g, c, N, x0, y0) {
  if (!sondajes.length) return;
  const dia = modo() === 'dia', T1 = c.z >= 15 ? 14 : 12.5, T2 = Math.round(T1 * 0.72), M = 26;
  g.save(); g.lineJoin = 'round'; g.lineWidth = 3;
  g.strokeStyle = dia ? 'rgba(255,255,255,.8)' : 'rgba(8,32,48,.85)'; g.fillStyle = dia ? '#123247' : '#dcedf8';
  for (const [la, lo, z] of sondajes) {
    const px = (lo + 180) / 360 * N - x0; if (px < -M || px > TILE + M) continue;
    const py = (1 - Math.log(Math.tan(Math.PI / 4 + rad(la) / 2)) / Math.PI) / 2 * N - y0; if (py < -M || py > TILE + M) continue;
    if (corredor && la > -34.475 && la < -34.445 && lo > -58.505 && lo < -58.465 && enCorredor(lo, la)) continue;
    if (darsenas.length && enDarsena(la, lo)) continue;
    if (canales.length && enCanal(lo, la)) continue; // sondaje viejo dentro de un canal balizado
    const ent = String(Math.floor(z + 1e-6)), dec = String(Math.round((z - Math.floor(z + 1e-6)) * 10) % 10);
    g.font = `italic 600 ${T1}px Barlow, sans-serif`;
    g.textAlign = 'right'; g.strokeText(ent, px + 1, py + T1 * 0.35); g.fillText(ent, px + 1, py + T1 * 0.35);
    g.font = `italic 600 ${T2}px Barlow, sans-serif`; g.textAlign = 'left';
    g.strokeText(dec, px + 1.5, py + T1 * 0.35 + T2 * 0.45); g.fillText(dec, px + 1.5, py + T1 * 0.35 + T2 * 0.45);
  }
  g.restore();
}
// Cola: se pintan mosaicos hasta ~10 ms por cuadro y se sigue en el próximo (la pantalla nunca se congela)
const colaTiles = new Map(); let colaActiva = false;
function encolarTile(cv, c, done) { const x = colaTiles.get(cv); colaTiles.set(cv, [c, done || (x && x[1])]); if (!colaActiva) { colaActiva = true; requestAnimationFrame(procesarTiles); } }
function procesarTiles() {
  const t0 = performance.now();
  for (const [cv, [c, done]] of colaTiles) { colaTiles.delete(cv); pintarTile(cv, c); if (done) done(null, cv); if (performance.now() - t0 > 10) break; }
  if (colaTiles.size) requestAnimationFrame(procesarTiles); else colaActiva = false;
}
const CapaProf = L.GridLayer.extend({
  createTile(c, done) { const cv = document.createElement('canvas'); cv.width = cv.height = TILE; encolarTile(cv, c, done); return cv; },
  repintar() { for (const k in this._tiles) encolarTile(this._tiles[k].el, this._tiles[k].coords); },
});
nuevoPanel('gradiente', 240);
const capaProf = new CapaProf({ pane: 'gradiente', tileSize: TILE, updateWhenZooming: false, keepBuffer: 1 }).addTo(mapa);
let claveProf = '';
function dibujarNoPasa() { // repinta solo si cambió algo que se ve (altura, calado, día/noche, grillas, corredor)
  const k = [calado.value, modo(), paleta, profs.length, corredor ? 1 : 0, canales.length, alturaRio(LAT_SF).toFixed(2), alturaRio(LAT_BA).toFixed(2), profs.some(p => p.ref === 'colonia') ? alturaColonia().toFixed(2) : ''].join('|');
  if (k !== claveProf) { claveProf = k; capaProf.repintar(); }
}
function cargarGrilla(url, prio = 2, fundir = false) {
  return fetch(url).then(r => r.json()).then(d => {
    const bin = atob(d.b64), q = new Int8Array(bin.length); for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
    const p = { ref: 'shn', prio, fundir, ...d, q }; profs.push(p); profs.sort((a, b) => b.prio - a.prio); dibujarNoPasa();
  }).catch(() => {});
}
cargarGrilla('datos/profundidad.json', 2, true);
/* Zonas extra: se bajan recién cuando el mapa se acerca a ellas (la app no se pone pesada) */
const ZONAS = [{ id: 'colonia', caja: [[-34.539, -57.962], [-34.411, -57.720]], carta: 'datos/carta_colonia.geojson', grilla: 'datos/profundidad_colonia.json', prio: 3, fundir: true },
  { id: 'costa_uy', caja: [[-34.60, -58.20], [-34.05, -57.66]], carta: 'datos/costa_uy.geojson' },
  // H-118 este: Banco Ortiz, Paso del Farallón, Playa Honda y costa uruguaya hasta Martín García (antes era un hueco sin profundidad)
  { id: 'este', caja: [[-34.70, -58.115], [-34.10, -57.747]], carta: 'datos/carta_este.geojson', grilla: 'datos/profundidad_este.json', prio: 1 }];
function cargarZonas() {
  const v = mapa.getBounds().pad(0.5);
  for (const z of ZONAS) {
    if (z.cargada || !v.intersects(L.latLngBounds(z.caja))) continue;
    z.cargada = true;
    if (z.carta) fetch(z.carta).then(r => r.json()).then(agregarCarta).catch(() => { z.cargada = false; });
    if (z.grilla) cargarGrilla(z.grilla, z.prio, z.fundir);
  }
}
mapa.on("moveend", cargarZonas); cargarZonas();
mapa.on('moveend', cargarDelta); cargarDelta();
mapa.on('moveend zoomend rotate', rotulosLuego);


/* ---------- Veriles oficiales de los canales troncales (Emilio Mitre, Paraná de las Palmas…) ---------- */
// Un solo estilo para todos los canales de buques (Mitre, Palmas, Acceso, Norte y Sur del puerto): veril rojo y verde punteados
const capaVeriles = L.layerGroup().addTo(mapa);
function trazarVeriles(v, latLon) { // v = { rojo: [...], verde: [...] }; puntos [lon, lat] (Vías Navegables) o [lat, lon] (puerto)
  const info = '<h3>Canal de buques</h3><p>Cruzar en perpendicular.</p>', ll = t => latLon ? t : t.map(p => [p[1], p[0]]);
  for (const [k, color] of [['rojo', '#d7262e'], ['verde', '#14953d']])
    for (const t of v[k] || []) L.polyline(ll(t), { pane: 'ruta', color, weight: 2.5, dashArray: '8 5', opacity: 0.9 }).bindPopup(info).addTo(capaVeriles);
}
fetch('datos/veriles.json', { cache: 'no-cache' }).then(r => r.json()).then(v => trazarVeriles(v, false)).catch(() => {});

/* ---------- Clubes y amarras (OpenStreetMap) ---------- */
const capaClubes = grupoVisible(), etClubes = grupoVisible();
const iconoClub = L.divIcon({ className: 'toque', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10],
  html: '<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#0b2a3c" stroke="#fff" stroke-width="1.5"/><path d="M11 5v11M7.5 8h7M6 12.5c1 2.6 3 3.6 5 3.6s4-1 5-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><circle cx="11" cy="5" r="1.4" fill="#fff"/></svg>' });
fetch('datos/clubes.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  for (const c of d.clubes) {
    const p = L.latLng(c.lat, c.lon);
    ficha(L.marker(p, { icon: iconoClub, title: c.n }), c.lat, c.lon, c.n, '').addTo(capaClubes);
    L.marker(p, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-club" style="transform:translate(14px,-50%)">${esc(c.n)}</div>`, iconSize: [0, 0] }) }).addTo(etClubes);
  }
  clubesSegunZoom();
}).catch(() => {});
function clubesSegunZoom() { const z = mapa.getZoom(); z >= 12 ? capaClubes.addTo(mapa) : capaClubes.remove(); z >= 14 ? etClubes.addTo(mapa) : etClubes.remove(); }
mapa.on('zoomend', clubesSegunZoom);

/* ---------- Referencias propias (no están en UNEN): El Marciano ---------- */
fetch('datos/referencias.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  for (const r of d.referencias) {
    const p = L.latLng(r.lat, r.lon);
    const mk = ficha(L.marker(p, { icon: iconoBoya({ k: r.tipo || 'peligro' }), title: r.n }), r.lat, r.lon, r.n, r.nota).addTo(capaBoyas);
    if (r.radio) L.circle(p, { radius: r.radio, pane: 'ruta', color: '#d7262e', weight: 2, dashArray: '6 5', fillColor: '#d7262e', fillOpacity: 0.12, interactive: false }).addTo(mapa);
    L.marker(p, { pane: 'etiquetas', interactive: true, bubblingMouseEvents: false, icon: L.divIcon({ className: '', html: `<div class="et-boya et-destacada" style="transform:translate(12px,-22px)">${esc(r.n)}</div>`, iconSize: [0, 0] }) }).on('click', () => mk.openPopup()).addTo(etDestacadas);
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
  const info = `<h3>Ruta Canal Costanero</h3><p>Mínimo 1,20 m + altura del río.</p>`;
  L.polyline(pts.map(p => [p.lat, p.lon]), { pane: 'ruta', color: '#ff7a00', weight: 3, opacity: 0.95, dashArray: '8 6' }).bindPopup(info).addTo(capaRuta);
  for (const p of pts) L.circleMarker([p.lat, p.lon], { pane: 'ruta', radius: 4, color: '#ff7a00', fillColor: '#fff', fillOpacity: 1, weight: 2 })
    .bindPopup(() => `<h3>${esc(p.n)}</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(p.lat))}<br>${esc(fmtLon(p.lon))}</p>${posGps ? `<p><strong>Desde tu posición:</strong> ${fmtRumbo(rumbo(posGps, L.latLng(p.lat, p.lon)))} · ${fmtDist(distM(posGps, L.latLng(p.lat, p.lon)))}</p>` : ''}`).addTo(capaRuta);
}

/* ---------- Pasos seguros del Canal Emilio Mitre ----------
   Principal: cruzar a la altura del Km 25,2 y seguir a UNEN B → UNEN A (entre las zonas de refulado).
   Alternativa: cruce por el Km 13,6–14, frente al Puerto de Buenos Aires.
   UNEN A y B se toman de las posiciones UNEN (si se mueven, el paso se corrige solo). */
function etiquetaPaso(latlng, texto, opac = 1) {
  L.marker(latlng, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-boya et-destacada" style="transform:translate(10px,-50%);border-left-color:#ff7a00;opacity:${opac}">${esc(texto)}</div>`, iconSize: [0, 0] }) }).addTo(capaRuta);
}
function dibujarPasoMitre() {
  fetch('datos/pasos_mitre.json', { cache: 'no-cache' }).then(r => r.json()).then(P => {
    const B = Object.fromEntries(boyas.map(b => [b.name, b])), a = B['UNEN A'], b = B['UNEN B'];
    const nota = '<p>Cruzar rápido y en perpendicular.</p>';
    if (a && b) {
      const pts = [P.principal.km252, [b.lat, b.lon], [a.lat, a.lon]];
      L.polyline(pts, { pane: 'ruta', color: '#ff7a00', weight: 3, opacity: 0.95, dashArray: '8 6' })
        .bindPopup(`<h3>Paso seguro Mitre</h3><p>Km 25,2 → UNEN B → UNEN A</p>${nota}`).addTo(capaRuta);
      L.circleMarker(P.principal.km252, { pane: 'ruta', radius: 5, color: '#ff7a00', fillColor: '#fff', fillOpacity: 1, weight: 2 })
        .bindPopup(`<h3>Cruce Km 25,2</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(P.principal.km252[0]))}<br>${esc(fmtLon(P.principal.km252[1]))}</p>`).addTo(capaRuta);
      etiquetaPaso([(b.lat + a.lat) / 2, (b.lon + a.lon) / 2], 'Paso seguro Mitre (Km 25,2)');
    }
    // Derrota clásica a Colonia: sigue desde UNEN A, por el sur de Farallón y San Gabriel (CVPB / práctico de Colonia)
    const co = P.colonia;
    if (a && co) {
      const pts = [[a.lat, a.lon], ...co.puntos.map(x => x.p)];
      const mn = pts.slice(1).reduce((s, q, i) => s + mapa.distance(pts[i], q), 0) / 1852;
      L.polyline(pts, { pane: 'ruta', color: '#ff7a00', weight: 2, opacity: 0.5, dashArray: '8 6' })
        .bindPopup(`<h3>Hacia Colonia</h3><p>UNEN A → Km 60,1 → Banco de los Pescadores → Puerto de Yates · ${num(mn, 1)} mn</p><p>${esc(co.nota)}</p>`).addTo(capaRuta);
      for (const x of co.puntos) L.circleMarker(x.p, { pane: 'ruta', radius: 3.5, color: '#ff7a00', opacity: 0.6, fillColor: '#fff', fillOpacity: 0.8, weight: 1.5 })
        .bindPopup(`<h3>${esc(x.n)}</h3><p style="font-variant-numeric:tabular-nums">${esc(fmtLat(x.p[0]))}<br>${esc(fmtLon(x.p[1]))}</p>`).addTo(capaRuta);
      const k = co.puntos[0].p, f = 0.12; // rótulo cerca de UNEN A, donde termina el paso seguro
      etiquetaPaso([a.lat + (k[0] - a.lat) * f, a.lon + (k[1] - a.lon) * f], 'Hacia Colonia', 0.75);
    }
    const al = P.alternativa;
    L.polyline(al.cruce, { pane: 'ruta', color: '#ff7a00', weight: 3, opacity: 0.95, dashArray: '8 6' })
      .bindPopup(`<h3>Cruce alternativo Km 14</h3>${nota}`).addTo(capaRuta);
    etiquetaPaso(al.cruce[1], 'Cruce alternativo Km 14');
  }).catch(() => {});
}

/* ---------- Boyas oficiales de los canales troncales (Vías Navegables / AGP): Emilio Mitre, Paraná de las Palmas, Acceso ---------- */
const SECTOR = { 'MITRE': 'Emilio Mitre', 'P.PALMAS': 'Paraná de las Palmas', 'BROWN': 'Canal Brown', 'R.D.LA PLATA': 'Río de la Plata', 'ESPECIALES': '' };
let senalesVNT = [];
fetch('datos/senales_vnt.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  senalesVNT = d.senales;
  for (const x of d.senales) {
    const col = (x.c || [])[0] || '';
    const k = x.f === 'LATERAL' ? (col.toUpperCase() === '#960018' ? 'roja' : 'verde') : x.f === 'PELIGRO' ? 'peligro' : x.f === 'C. PREFER.' ? 'bif' : 'especial';
    const esKm = /^\d+(\.\d+)?$/.test(String(x.km)), nom = esKm ? `Km ${String(x.km).replace('.', ',')}` : (k === 'peligro' ? String(x.km).toLowerCase().replace(/(^|[\s\-/.])\S/g, c => c.toUpperCase()) : String(x.km)), sec = SECTOR[x.sec] ?? x.sec;
    ficha(L.marker([x.lat, x.lon], { icon: iconoBoya({ k }), title: `${sec} ${nom}` }), x.lat, x.lon, `${nom}${sec ? ' · ' + sec : ''}`, NOMBRE_TIPO[k]).addTo(capaBoyas);
    etiquetaBoya([x.lat, x.lon], nom);
  }
  dibujarPasillo();
}).catch(() => {});

/* Pasillo del paso seguro del Mitre: franja entre las zonas de refulado, desde el canal (Km 25,2 – Km 23) paralela a la enfilación UNEN B → UNEN A */
let capaPasillo = null;
function dibujarPasillo() {
  const B = Object.fromEntries(boyas.map(b => [b.name, b])), a = B['UNEN A'], b = B['UNEN B'];
  const bm = (km, s) => senalesVNT.find(x => x.sec === 'MITRE' && +x.km === km && x.s === s);
  const r252 = bm(25.2, 'BRL'), v252 = bm(25.2, 'BVL'), r23 = bm(23, 'BRL'), v23 = bm(23, 'BVL');
  if (!a || !b || !r252 || !r23 || !v252 || !v23) return;
  const k = Math.cos(rad(-34.5)), M = 111320;
  const dx = (a.lon - b.lon) * k * M, dy = (a.lat - b.lat) * M, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n;
  const largo = ((a.lon - r252.lon) * k * M) * ux + ((a.lat - r252.lat) * M) * uy + 600; // hasta pasar UNEN A
  const mover = (p, m) => [p.lat + uy * m / M, p.lon + ux * m / (k * M)];
  // de boya a boya atravesando el canal (verde → roja) y de ahí hacia UNEN B / UNEN A
  const p0 = [v252.lat, v252.lon], p1 = [r252.lat, r252.lon], p2 = mover(r252, largo), p4 = [r23.lat, r23.lon], p3 = mover(r23, largo), p5 = [v23.lat, v23.lon];
  if (capaPasillo) capaPasillo.remove();
  capaPasillo = L.layerGroup([
    L.polygon([p0, p1, p2, p3, p4, p5], { pane: 'ruta', stroke: false, fillColor: '#ff7a00', fillOpacity: 0.14, interactive: false }),
    L.polyline([p0, p1, p2], { pane: 'ruta', color: '#d7262e', weight: 2, dashArray: '6 5', interactive: false }),
    L.polyline([p5, p4, p3], { pane: 'ruta', color: '#d7262e', weight: 2, dashArray: '6 5', interactive: false }),
  ]).addTo(mapa);
}

/* ---------- Puerto de Buenos Aires: Canal Norte, Canal Sur, Canal de Acceso, zonas restringidas y de vertido (OpenStreetMap) ---------- */
fetch('datos/puerto.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  if (d.veriles) trazarVeriles(d.veriles, true); // bordes armados con las boyas de cada lado (_scripts/veriles_puerto.py)
  for (const c of d.canales) {
    // rótulo a lo largo del canal (en uno o dos lugares si es largo)
    const pos = c.f ? [c.f] : c.c.length > 20 ? [0.3, 0.7] : [0.5];
    for (const f of pos) {
      const i = Math.min(Math.max(Math.floor(c.c.length * f), 1), c.c.length - 2), a = c.c[i - 1], b = c.c[i + 1];
      let ang = deg(Math.atan2(-(merc(b[0]) - merc(a[0])), rad(b[1] - a[1]))); if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      L.marker(c.c[i], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-canal" style="transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg) translateY(-14px)">${esc(c.n)}</div>`, iconSize: [0, 0] }) }).addTo(etRios);
    }
  }
  for (const a of d.areas) {
    L.polygon(a.c, { pane: 'ruta', color: '#d7262e', weight: 2, dashArray: '6 5', fillColor: '#d7262e', fillOpacity: 0.12, interactive: false }).addTo(mapa);
    const cx = a.c.reduce((s, p) => [s[0] + p[0] / a.c.length, s[1] + p[1] / a.c.length], [0, 0]);
    L.marker(cx, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="et-zona" style="transform:translate(-50%,-50%)">${esc(a.n.replace(/\s*\(.*\)/, ""))}</div>`, iconSize: [0, 0] }) }).addTo(mapa);
  }
  for (const b of d.boyas) ficha(L.marker([b.lat, b.lon], { icon: iconoBoya({ k: b.k }), title: b.n }), b.lat, b.lon, b.n, NOMBRE_TIPO[b.k]).addTo(capaBoyas);
  // escolleras (OSM): trazo de piedra sobre la tierra y el agua
  for (const e of d.escolleras || []) {
    L.polyline(e, { pane: 'ruta', color: '#0b2a3c', weight: 6, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(mapa);
    L.polyline(e, { pane: 'ruta', color: '#9aa3a8', weight: 3, opacity: 1, lineCap: 'round', interactive: false }).addTo(mapa);
  }
  for (const r of d.rotulosPuerto || []) {
    const grande = r.z <= 12;
    L.marker([r.lat, r.lon], { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html: `<div class="${grande ? 'et-lugar et-puerto' : 'et-canal'}" style="transform:translate(-50%,-50%)">${esc(r.n)}</div>`, iconSize: [0, 0] }) }).addTo(grande ? etLugares : etRios);
  }
}).catch(() => {});

/* ---------- Peligros de la carta SHN H-155: naufragios sin boya, obstrucciones, ex-pilotes, marcas CIC, balizas de aguajes ---------- */
const SVG_PEL = {
  naufragio: '<svg width="26" height="16" viewBox="0 0 26 16"><ellipse cx="13" cy="8" rx="12" ry="7" fill="#fff8" stroke="#111" stroke-width="1.3" stroke-dasharray="2 2"/><path d="M3 8h20M8 4v8M13 4v8M18 4v8" stroke="#111" stroke-width="1.6"/></svg>',
  obstruccion: '<svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="7.5" fill="#fff8" stroke="#111" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="9" cy="9" r="1.6" fill="#111"/></svg>',
  pilote: '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="#111" stroke="#fff" stroke-width="2"/></svg>' };
const DET_PEL = { naufragio: 'Naufragio (casco hundido)', obstruccion: 'Obstrucción sumergida', pilote: 'Pilote', especial: 'Marca especial', tuberia: 'Tuberías sumergidas: no fondear', roja: 'Baliza lateral roja', verde: 'Baliza lateral verde', segura: 'Aguas seguras' };
fetch('datos/peligros.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
  for (const p of d.peligros) {
    const k = p.t === 'tuberia' ? 'especial' : p.t;
    const icon = SVG_PEL[k] ? L.divIcon({ className: 'toque', html: SVG_PEL[k], iconSize: k === 'naufragio' ? [26, 16] : k === 'pilote' ? [14, 14] : [18, 18] }) : iconoBoya({ k });
    ficha(L.marker([p.lat, p.lon], { icon, title: p.n }), p.lat, p.lon, p.n, DET_PEL[p.t] + ' · SHN H-155').addTo(capaBoyas);
    if (p.t === 'naufragio' || p.t === 'pilote' || p.t === 'especial' || p.n.startsWith('Ex-Pilote'))
      etiquetaBoya([p.lat, p.lon], p.n.split(' · ')[0], { dy: -6 });
  }
}).catch(() => {});

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
  if (!marcaBarco) { marcaBarco = L.marker(posGps, { icon: iconoBarco(navegando ? cog : 0), zIndexOffset: 1000, keyboard: false }).bindPopup($('#hudDet'), { closeButton: false, autoPan: false, offset: [0, -12], className: 'pop-barco' }).addTo(mapa); precision = L.circle(posGps, { radius: accuracy, color: '#c2188f', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(mapa); }
  else { marcaBarco.setLatLng(posGps).setIcon(iconoBarco(navegando ? cog : 0)); precision.setLatLng(posGps).setRadius(accuracy); }
  if (navegando) {
    const largo = Math.max(sog * 60 * minutosRumbo(), 150), fin = destino(posGps, cog, largo);
    if (!lineaRumbo) { lineaRumbo = L.polyline([posGps, fin], { color: '#c2188f', weight: 3, interactive: false }).addTo(mapa); finRumbo = L.circleMarker(fin, { radius: 4, color: '#c2188f', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(mapa); }
    else { lineaRumbo.setLatLngs([posGps, fin]).addTo(mapa); finRumbo.setLatLng(fin).addTo(mapa); }
  } else if (lineaRumbo) { lineaRumbo.remove(); finRumbo.remove(); }
  $('#posTxt').innerHTML = `${esc(fmtLat(la))}<br>${esc(fmtLon(lo))}`;
  ultimoKn = kn; if (kn != null) knSuave = knSuave == null ? kn : knSuave * 0.7 + kn * 0.3; dibujarDestino();
  $('#sog').textContent = kn != null ? num(kn, 1) : '—';
  $('#cog').textContent = navegando ? fmtRumbo(cog) : '—';
  $('#posSub').textContent = `± ${Math.round(accuracy)} m`;
  if (orient === 'rumbo' && navegando && mapa.setBearing) { mapa.setBearing(360 - cog); marcaBarco.setIcon(iconoBarco(cog)); }
  if (seguir && Date.now() > pausaSeguir) mapa.panTo(posGps, { animate: true, duration: 0.4 });
  pintarSeguir();
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
/* Orientación: Norte arriba (mapa fijo) / Rumbo arriba (el mapa gira para que tu rumbo apunte hacia arriba) */
let orient = leer('orient', 'norte');
const btnOrient = $('#btnOrient');
function aplicarOrient() {
  const r = orient === 'rumbo';
  btnOrient.setAttribute('aria-pressed', r);
  $('#orientIco').textContent = r ? '▲' : 'N';
  $('#orientTxt').textContent = r ? 'rumbo' : 'norte';
  if (!r && mapa.setBearing) mapa.setBearing(0);
  if (r) { activarSeguir(true); }
  if (marcaBarco) marcaBarco.setIcon(iconoBarco(cogCalc ?? 0));
}
btnOrient.onclick = () => { orient = orient === 'rumbo' ? 'norte' : 'rumbo'; guardar('orient', orient); aplicarOrient(); };

const selRumbo = $('#minRumbo'); selRumbo.value = String(minutosRumbo()); selRumbo.onchange = () => guardar('minRumbo', parseInt(selRumbo.value, 10));
/* Seguir el barco (botón ◎): al tocar o mover el mapa se pausa 15 s y después vuelve a centrar solo */
const btnGps = $('#btnGps'), PAUSA_SEGUIR = 15000;
let pausaSeguir = 0;
function pintarSeguir() { btnGps.setAttribute('aria-pressed', seguir); btnGps.classList.toggle('en-pausa', seguir && Date.now() < pausaSeguir); }
function activarSeguir(v) { seguir = v; pausaSeguir = 0; guardar('seguir', v); pintarSeguir(); if (v) iniciarGps(true); }
btnGps.onclick = () => { guardar('gpsUsado', true); if (seguir && Date.now() > pausaSeguir && orient !== 'rumbo') activarSeguir(false); else activarSeguir(true); };
const pausar = () => { if (seguir) { pausaSeguir = Date.now() + PAUSA_SEGUIR; pintarSeguir(); clearTimeout(pausar._t); pausar._t = setTimeout(() => { pintarSeguir(); if (seguir && posGps) mapa.panTo(posGps, { animate: true, duration: 0.6 }); }, PAUSA_SEGUIR + 50); } };
['touchstart', 'mousedown', 'wheel'].forEach(ev => mapa.getContainer().addEventListener(ev, pausar, { passive: true }));
pintarSeguir();
if (leer('gpsUsado', false)) iniciarGps(false);

/* ---------- Ir a: tocar una referencia dibuja la línea desde el barco con rumbo, distancia y tiempo ---------- */
let objetivo = null, lineaDest = null, marcaDest = null, ultimoKn = null, knSuave = null;
function irA(lat, lon, nombre) {
  objetivo = { p: L.latLng(lat, lon), n: nombre }; $('#quitarDest').hidden = false;
  if (lineaDest) { lineaDest.remove(); lineaDest = null; } // línea nueva: no reciclar la del destino anterior
  dibujarDestino(); if (lineaDest) lineaDest.bringToFront();
}
// Ficha de una referencia: datos resumidos + botón "Ir hasta aquí" (recién ahí se dibuja la línea)
function ficha(marker, lat, lon, nombre, detalle) {
  marker.bindPopup(() => {
    const div = document.createElement('div');
    div.innerHTML = `<h3>${esc(nombre)}</h3>${detalle ? `<p>${esc(detalle)}</p>` : ''}<button class="btn-ir">Ir hasta aquí</button>`;
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('.btn-ir').onclick = e => { L.DomEvent.stop(e); irA(lat, lon, nombre); setTimeout(() => marker.closePopup(), 0); };
    return div;
  }, { closeButton: false });
  return marker;
}
function borrarDestino() { objetivo = null; lineaDest && lineaDest.remove(); marcaDest && marcaDest.remove(); lineaDest = marcaDest = null; $('#bTiempo').hidden = true; $('#quitarDest').hidden = true; }
$('#quitarDest').onclick = () => { borrarDestino(); marcaBarco && marcaBarco.closePopup(); };
function dibujarDestino() {
  if (!objetivo) return;
  const p = objetivo.p;
  let txt = objetivo.n;
  if (posGps) {
    const d = distM(posGps, p);
    txt += ` · ${fmtRumbo(rumbo(posGps, p))} · ${fmtDist(d)}`;
    if (knSuave && knSuave >= 0.5) {
      const min = Math.round(d / 1852 / knSuave * 60), eta = new Date(Date.now() + min * 60000);
      txt += ` · ${min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min'} · ETA ${eta.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    }
    // tiempo hasta el destino en la barra (velocidad suavizada: no salta con cada lectura del GPS)
    $('#bTiempo').hidden = false;
    if (knSuave && knSuave >= 0.5) { const m = Math.round(d / 1852 / knSuave * 60); $('#tiempo').textContent = m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); }
    else $('#tiempo').textContent = '—';
    if (!lineaDest) lineaDest = L.polyline([posGps, p], { pane: 'ruta', color: '#ffd400', weight: 3, dashArray: '8 6', interactive: false }).addTo(mapa);
    else lineaDest.setLatLngs([posGps, p]).addTo(mapa);
  } else { txt += ' · activá ◎ GPS'; lineaDest && lineaDest.remove(); lineaDest = null; }
  const html = `<div class="et-boya et-destacada et-destino" style="transform:translate(14px,8px)">${esc(txt)}</div>`;
  if (!marcaDest) marcaDest = L.marker(p, { pane: 'etiquetas', interactive: false, icon: L.divIcon({ className: '', html, iconSize: [0, 0] }) }).addTo(mapa);
  else marcaDest.setLatLng(p).setIcon(L.divIcon({ className: '', html, iconSize: [0, 0] }));
}

/* ---------- Panel ---------- */
const panel = $('#panel');
const abrirPanel = v => { if (v) { $('#hojaViento').hidden = true; $('#hojaMarea').hidden = true; $('#hojaAjustes').hidden = true; $('#btnAjustes').setAttribute('aria-pressed', false); } panel.classList.toggle('abierto', v); document.body.classList.toggle('con-panel', v); guardar('panel', v); };
$('#btnPanel').onclick = () => abrirPanel(!panel.classList.contains('abierto'));
$('#cerrarPanel').onclick = () => abrirPanel(false);
if (leer('panel', innerWidth > 900)) abrirPanel(true);
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); });
  document.querySelectorAll('.vista').forEach(v => v.classList.toggle('on', v.id === 'v-' + t.dataset.t));
  guardar('tab', t.dataset.t);
  
});


/* ---------- Situación del río ---------- */
const calado = $('#calado');
calado.value = leer('calado', 1.5);
calado.oninput = () => { guardar('calado', parseFloat(calado.value)); pintarSemaforo(); clearTimeout(calado._t); calado._t = setTimeout(() => { dibujarNoPasa(); pintarAlertas(); pintarBarraMarea(); }, 250); };
const DETERMINANTE = 1.20; // m, Canal Costanero zona menos profunda Km 19,3–20,2 (CVPB oct‑2026)
/* PRS unificado (Disposición SHN 1/2026): desde el 1/1/2026 las alturas del SHN van referidas a 0,91 m bajo el nivel medio.
   Las cartas que usamos (H-118 2016, LAT) tienen el nivel medio a 0,79 m en San Fernando, Buenos Aires y La Plata (0,64 en Martín García):
   el cero nuevo está 0,12 m más abajo → con estas cartas hay que restar 0,12 m a la altura del SHN (0,27 en Martín García). */
const DIF_PRS = 0.12;
// Excepción: los valores UNEN (Costanero 1,20, canales del Luján y Rivademar) ya están al cero nuevo (A. Kalfayan, 27/11/2026) → sin corrección.
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
// Altura "ahora": la última lectura; si tiene más de 90 min (sin señal, SHN caído) se estima con la astronómica + la diferencia
// de esa lectura, para que el rayado y la barra no se queden con una altura vieja mientras el río sube o baja
function alturaAhora(est) {
  const u = est && ultimo(est.observada); if (!u) return null;
  const ahora = Date.now();
  if (ahora - new Date(u[0]) < 90 * 60e3) return { t: u[0], h: u[1], estimada: false };
  const e = estimacion(est), pts = [u, ...(e ? e.futuro : [])];
  for (let i = 0; i + 1 < pts.length; i++) {
    const t0 = +new Date(pts[i][0]), t1 = +new Date(pts[i + 1][0]);
    if (ahora >= t0 && ahora <= t1) return { t: new Date(ahora).toISOString(), h: +(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (ahora - t0) / Math.max(t1 - t0, 1)).toFixed(2), estimada: true };
  }
  return { t: u[0], h: u[1], estimada: false, vieja: true };
}
const txtAltura = (a, nom) => `${nom} ${a.estimada ? '≈' : ''}${num(a.h)} m (${a.estimada ? 'estimada' : hora(a.t)})`;

function pintarSemaforo() {
  const luz = $('#semLuz'), det = $('#semDet');
  const sf = sit && sit.mareografos && sit.mareografos.SFER;
  const a = alturaAhora(sf);
  if (!a) { luz.className = 'sem-luz'; luz.textContent = 'Sin dato de altura'; det.textContent = ''; return; }
  const c = parseFloat(calado.value) || 0, agua = DETERMINANTE + a.h, margen = agua - c;
  luz.className = 'sem-luz ' + (margen >= 0.5 ? 'verde' : margen >= 0.2 ? 'ambar' : 'rojo');
  luz.textContent = 'Costanero · ' + (margen >= 0.5 ? 'Pasa' : margen >= 0.2 ? 'Justo' : 'No pasa');
  const est = estimacion(sf);
  let prox = '';
  if (est && est.futuro.length) {
    const ok = est.futuro.find(x => DETERMINANTE + x[1] - c >= 0.5), malo = est.futuro.find(x => DETERMINANTE + x[1] - c < 0.2);
    if (margen < 0.5 && ok) prox = ` · da desde las ${hora(ok[0])}`;
    else if (margen >= 0.2 && malo) prox = ` · deja de dar ${hora(malo[0])}`;
  }
  det.textContent = `Bajo la quilla ${num(margen)} m · ${txtAltura(a, 'San Fernando')}${prox}`;
  const ol = (sit.radioavisos?.olas_costanero_km17 || [])[0];
  if (ol) det.textContent += ` · olas ${num(Math.max(ol.manana.alt, ol.tarde.alt), 1)} m`;
  pintarCurva();
}

/* Gráfico de altura: horas abajo y se desliza a la derecha (como el viento), 12 h atrás y 3 días adelante.
   Colores: real (medida SHN) azul · predicción (tabla SHN/SOHMA) ámbar · con el viento de ahora (predicción + diferencia actual) magenta */
const PXH = 22, ANTES_H = 12, DESPUES_H = 72, EST_H = 12;
/* Pedidos al SHN: de a uno y espaciados (su servidor corta con "429: demasiados pedidos" si llegan juntos); tras un 429, 5 min de pausa */
let pausaSHN = 0, colaSHN = Promise.resolve();
const espera = ms => new Promise(r => setTimeout(r, ms));
function pedirSHN(cod, fecha) {
  const pedido = colaSHN.then(async () => {
    if (Date.now() < pausaSHN) throw new Error('pausa');
    const r = await fetch(`https://www.hidro.gob.ar/api/v1/AlturasHorarias/${cod}/${fecha}`, { cache: 'no-store' });
    if (r.status === 429) { pausaSHN = Date.now() + 5 * 60e3; throw new Error('429'); }
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
  colaSHN = pedido.catch(() => {}).then(() => espera(350));
  return pedido;
}
const fechaSHN = (desplH = 0) => new Date(Date.now() + (desplH - 3) * 3600e3).toISOString().replace(/\D/g, '').slice(0, 12); // AAAAMMDDhhmm, hora argentina
const COL_REAL = '#1f8fe0', COL_PRED = '#e39b0b', COL_VIENTO = '#c2188f';
const astroLargo = {}; // cod → { t, serie } predicción SHN hasta +3 días (la API la da por ventanas de ~20 h)
// Predicción de 3–4 días: la baja el Action una vez para todos (prediccion.json); el celular solo le pide al SHN si ese archivo no alcanza
let prediccionArch = {};
fetch('datos/prediccion.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { prediccionArch = d.estaciones || {}; if (sit) pintarCurva(); }).catch(() => {});
function pedirAstroLargo(cod) {
  if (!EST_SHN[cod]) return;
  const pa = prediccionArch[cod]; if (pa && pa.length && +new Date(pa[pa.length - 1][0]) > Date.now() + (DESPUES_H - 2) * 3600e3) return; // el archivo ya cubre
  const c = astroLargo[cod]; if (c && (c.cargando || Date.now() - c.t < 3 * 3600e3)) return;
  astroLargo[cod] = { serie: c ? c.serie : [], t: c ? c.t : 0, cargando: true };
  Promise.allSettled([20, 40, 60, 80].map(hh => pedirSHN(cod, fechaSHN(hh))))
    .then(rs => {
      const m = new Map();
      for (const r of rs) if (r.status === 'fulfilled') for (const x of r.value.astronomica || []) if (x.altura != null) m.set(x.fecha, +x.altura.toFixed(2));
      astroLargo[cod] = m.size ? { t: Date.now(), serie: [...m].sort((a, b) => a[0] < b[0] ? -1 : 1) } : { ...astroLargo[cod], cargando: false, t: Date.now() - 3 * 3600e3 + 5 * 60e3 }; // sin red o SHN saturado: reintenta en ~5 min
      if (zonaSel.value === cod) pintarCurva();
    });
}
const isoLocal = t => { const d = new Date(t - 3 * 3600e3); return d.toISOString().slice(0, 13) + ':00:00'; };
function prediccionDe(z, est, t0, t1) {
  if (z === 'COLO' || z === 'MVD') { // tablas SOHMA (horarias, todo el año)
    const serie = mareasUY && mareasUY[z === 'COLO' ? 'colonia' : 'montevideo'] && mareasUY[z === 'COLO' ? 'colonia' : 'montevideo'].serie, out = [];
    if (serie) for (let t = Math.floor(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) { const d = new Date(t - 3 * 3600e3), v = serie[d.toISOString().slice(0, 10)]; if (v && v[d.getUTCHours()] != null) out.push([isoLocal(t), v[d.getUTCHours()] / 100]); }
    return out;
  }
  const m = new Map((est.astronomica || []).map(x => [x[0], x[1]]));
  for (const x of [...(prediccionArch[z] || []), ...((astroLargo[z] && astroLargo[z].serie) || [])]) if (!m.has(x[0])) m.set(x[0], x[1]);
  return [...m].filter(x => { const t = +new Date(x[0]); return t >= t0 && t <= t1; }).sort((a, b) => a[0] < b[0] ? -1 : 1);
}
function curva(z, est, conLim) {
  const caja = $('#curvaSF');
  const dibujar = () => {
    const ahora = Date.now(), t0 = ahora - ANTES_H * 3600e3, t1 = ahora + DESPUES_H * 3600e3;
    const pred = prediccionDe(z, est, t0, t1), uy = !!est.notaUY, mvd = z === 'MVD';
    const real = uy ? [] : (est.observada || []).filter(x => +new Date(x[0]) >= t0);
    // "con el viento de ahora": predicción + la diferencia de la última lectura, solo las próximas horas
    const u = ultimo(est.observada), aU = u && pred.find(x => x[0] === u[0]), dif = u && aU ? u[1] - aU[1] : (estimacion(est) || {}).dif || 0;
    const tU = u ? +new Date(u[0]) : ahora;
    const viento = mvd || !u ? [] : [...(uy ? (est.observada || []).filter(x => +new Date(x[0]) >= t0) : [u]),
      ...pred.filter(x => { const t = +new Date(x[0]); return t > tU && t <= tU + EST_H * 3600e3; }).map(x => [x[0], +(x[1] + dif).toFixed(2)])];
    const c = parseFloat(calado.value) || 0, lim = c - DETERMINANTE + 0.2; // altura mínima para 0,2 m bajo la quilla en el Costanero
    const todos = [...pred, ...real, ...viento]; if (!todos.length) { caja.innerHTML = '<p class="nota">Sin datos.</p>'; return; }
    const vals = [...todos.map(x => x[1]), ...(conLim ? [lim] : [])], lo = Math.floor((Math.min(...vals) - 0.1) * 2) / 2, hi = Math.ceil((Math.max(...vals) + 0.1) * 2) / 2;
    const H = 200, TOP = 16, BOT = H - 34, W = Math.round((t1 - t0) / 3600e3 * PXH) + 16;
    const X = t => 8 + (+new Date(t) - t0) / 3600e3 * PXH, Y = v => TOP + (BOT - TOP) * (hi - v) / (hi - lo);
    const linea = (a, col, ancho, extra = '') => a.length > 1 ? `<polyline fill="none" stroke="${col}" stroke-width="${ancho}" stroke-linejoin="round" ${extra} points="${a.map(x => `${X(x[0]).toFixed(1)},${Y(x[1]).toFixed(1)}`).join(' ')}"/>` : '';
    let g = '', eje = '';
    for (let v = lo; v <= hi + 1e-9; v += 0.5) { g += `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" opacity=".12"/>`; eje += `<text x="26" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="currentColor">${num(v, 1)}</text>`; }
    if (conLim) g += `<rect x="0" y="${Y(lim)}" width="${W}" height="${Math.max(BOT - Y(lim), 0)}" fill="#d7262e" opacity=".10"/><line x1="0" x2="${W}" y1="${Y(lim)}" y2="${Y(lim)}" stroke="#d7262e" stroke-dasharray="4 3"/>`;
    // horas abajo (cada 3 h) y días (a las 00)
    for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
      const d = new Date(t), h = d.getHours(), x = X(t);
      if (h === 0) {
        g += `<line x1="${x}" x2="${x}" y1="${TOP - 6}" y2="${BOT}" stroke="currentColor" opacity=".45"/><text x="${x + 3}" y="${H - 4}" font-size="12" font-weight="700" fill="currentColor">${esc(d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }))}</text>`;
      } else if (h % 3 === 0) g += `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${BOT}" stroke="currentColor" opacity=".08"/>`;
      if (h % 3 === 0) g += `<text x="${x}" y="${BOT + 14}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".85">${String(h).padStart(2, '0')}</text>`;
    }
    const xa = X(ahora);
    g += `<line x1="${xa}" x2="${xa}" y1="${TOP - 8}" y2="${BOT}" stroke="#ffd400" stroke-width="2"/><text x="${xa + 4}" y="${TOP - 4}" font-size="11" font-weight="700" fill="currentColor">ahora</text>`;
    g += linea(pred, COL_PRED, 2) + linea(viento, COL_VIENTO, 2.4, 'stroke-dasharray="6 4"') + linea(real, COL_REAL, 3.2);
    // pleamares y bajamares de la predicción: la altura escrita
    for (let i = 1; i + 1 < pred.length; i++) {
      const [a, b, cc] = [pred[i - 1][1], pred[i][1], pred[i + 1][1]], max = b > a && b >= cc, min = b < a && b <= cc;
      if (max || min) g += `<text x="${X(pred[i][0])}" y="${Y(b) + (max ? -6 : 15)}" text-anchor="middle" font-size="11" font-weight="600" fill="${COL_PRED}">${num(b, 1)}</text>`;
    }
    const ur = ultimo(real); if (ur) g += `<circle cx="${X(ur[0])}" cy="${Y(ur[1])}" r="4.5" fill="${COL_REAL}" stroke="#fff" stroke-width="1.5"/>`;
    const fuente = EST_SHN[z] ? 'SHN' : 'SOHMA', ley = [
      real.length ? [COL_REAL, '', `Real (${fuente})`] : null,
      [COL_PRED, '', `Predicción ${fuente}`],
      viento.length ? [COL_VIENTO, 'stroke-dasharray="6 4"', uy ? 'Estimada con el viento' : 'Con el viento de ahora'] : null,
      conLim ? ['#d7262e', 'stroke-dasharray="4 3"', 'No pasás el Costanero'] : null].filter(Boolean);
    const sc = caja.querySelector('.c-scroll'), izq = sc ? sc.scrollLeft : null;
    caja.innerHTML = `<div class="c-graf"><svg class="c-eje" width="30" height="${H}" aria-hidden="true">${eje}</svg>
      <div class="c-scroll scroll"><svg width="${W}" height="${H}" role="img" aria-label="Altura del río: real y predicción">${g}</svg></div></div>
      <div class="c-ley">${ley.map(([col, da, t]) => `<span><svg width="22" height="8"><line x1="0" x2="22" y1="4" y2="4" stroke="${col}" stroke-width="3" ${da}/></svg>${esc(t)}</span>`).join('')}</div>`;
    const nsc = caja.querySelector('.c-scroll');
    caja._alAhora = () => { nsc.scrollLeft = Math.max(0, xa - nsc.clientWidth * 0.3); };
    if (izq != null && izq > 0) nsc.scrollLeft = izq; else caja._alAhora();
  };
  caja._dibujar = dibujar; dibujar();
}

const SITUACIONES = [ // lo que importa: Pilote Norden, San Isidro, Puerto de Buenos Aires
  { id: 'SI', titulo: 'San Isidro', viento: 'si' },
  { id: 'BSAS', titulo: 'Puerto de Buenos Aires', viento: 'bsas' },
  { id: 'PNOR', titulo: 'Pilote Norden', viento: 'pnor' },
  { id: 'MAGA', titulo: 'Martín García' },
  { id: 'LPLA', titulo: 'La Plata' },
  { id: 'COLO', titulo: 'Colonia' },
  { id: 'MVD', titulo: 'Montevideo' },
];
// Tendencia con hora: "▲ crece hasta las 21:45" (estimación SHN: astronómica + efecto del viento; si no alcanza, pleamar/bajamar SHN)
function tendencia(est, puertoPB) {
  const u = est && ultimo(est.observada), prev = est && est.observada[est.observada.length - 2];
  if (!u || !prev) return '';
  const sube = u[1] > prev[1], e = estimacion(est);
  let hasta = null;
  if (e) { let ant = u[1]; for (const x of e.futuro) { if (sube ? x[1] < ant : x[1] > ant) { hasta = x[0]; break; } ant = x[1]; } }
  // el máximo/mínimo está una hora antes de que cambie la serie horaria
  if (hasta) hasta = new Date(new Date(hasta) - 3600e3).toISOString();
  if (!hasta && puertoPB) {
    const sig = (sit.radioavisos?.pleamar_bajamar?.[puertoPB] || []).find(x => x.estado === (sube ? 'pleamar' : 'bajamar'));
    if (sig) return `<span class="tend ${sube ? 'sube' : 'baja'}">${sube ? '▲ crece' : '▼ baja'} hasta las ${esc(sig.hora)}</span>`;
  }
  return `<span class="tend ${sube ? 'sube' : 'baja'}">${sube ? '▲ crece' : '▼ baja'}${hasta ? ' hasta las ' + hora(hasta) : ''}</span>`;
}
const efectoViento = e => !e ? '' : e.dif >= 0.3 ? ` · sudestada +${num(e.dif)} m` : e.dif <= -0.3 ? ` · bajante por viento ${num(e.dif)} m` : '';
// Agua total = fondo de referencia de la zona (al plano de reducción, el cero de la carta) + altura del río ahora
const FONDO_REF = {
  SI: { m: 1.20, lugar: 'Costanero', dif: 0 },           // determinante UNEN del Canal Costanero: UNEN ya lo refirió al cero nuevo (Kalfayan, 27/11/2026: corregido en enero 2026)
  PNOR: { m: 6.3, lugar: 'Pilote Norden', dif: DIF_PRS }, // sondaje SHN junto al pilote
  MAGA: { m: 1.0, lugar: 'Muelle', dif: 0.27 },           // H-118, cuarterón "Isla Martín García · Muelle" 1:1500: mareógrafo en la punta, 1 m
  BSAS: { m: 1.5, lugar: 'Club de Pescadores', dif: DIF_PRS }, // mareógrafo SHN en la punta del muelle; Marto lee 1,5–2 → el menor (H-118 alrededor: 0,7 / 0,8 / 1,8)
};
function aguaTotal(s, u) {
  const f = FONDO_REF[s.id]; if (!f || !u) return '';
  return `<div class="total"><div class="t-lbl">Agua total</div><div class="alt">${num(f.m + u[1] - f.dif)} m</div><div class="t-cta">${f.lugar} ${num(f.m)} + ${num(u[1])}${f.dif ? ' − ' + num(f.dif) : ''}</div></div>`;
}
function tarjeta(s) {
  const m = sit.mareografos || {}, pref = sit.prefectura || {};
  const cod = s.id === 'SI' ? 'SFER' : s.id, est = m[cod], u = est && ultimo(est.observada);
  const pb = s.id === 'SI' ? 'San Fernando' : s.id === 'BSAS' ? 'Buenos Aires' : null;
  const p = s.id === 'SI' ? pref['San Isidro'] : s.id === 'BSAS' ? pref['Buenos Aires'] : null;
  const chips = p ? (p.altura >= p.evacuacion ? '<span class="chip evac">Evacuación</span>' : p.altura >= p.alerta ? '<span class="chip alerta">Alerta</span>' : '') : '';
  const det = (u ? (s.id === 'SI' ? 'San Fernando ' : '') + hora(u[0]) : 'sin lectura') + (est && est.notaUY ? ' · ' + est.notaUY : '') + efectoViento(est && estimacion(est));
  return `<div class="est"><h3>${esc(s.titulo)} ${chips}</h3><div><div class="alt">${u ? num(u[1]) + ' m' : '—'}</div>${tendencia(est, pb)}</div>${aguaTotal(s, u)}<div class="det">${det}</div></div>`;
}
// En la hoja de mareas solo la zona elegida (por defecto San Isidro, con el mareógrafo de San Fernando)
function pintarEstacion() {
  if (!sit) return;
  const z = zonaSel.value === 'SFER' ? 'SI' : zonaSel.value, s = SITUACIONES.find(x => x.id === z) || SITUACIONES[0];
  $('#estaciones').innerHTML = tarjeta(s);
}
function pintarSituacion() {
  if (!sit) return;
  pintarEstacion();
  const tDatos = Math.max(+new Date(sit.generado) || 0, shnVivo), edadMin = (Date.now() - tDatos) / 60000, act = $('#actualizado');
  act.textContent = 'datos ' + new Date(tDatos).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    + (edadMin > 90 ? ` · ATENCIÓN: datos de hace ${edadMin > 120 ? Math.round(edadMin / 60) + ' h' : Math.round(edadMin) + ' min'}` : '');
  act.style.color = edadMin > 90 ? '#ffb347' : ''; act.style.fontWeight = edadMin > 90 ? '700' : '';
  pintarSemaforo();
  pintarBarraMarea();
  pintarAvisos();
}
function pintarAvisos() {
  const r = (sit && sit.radioavisos) || {};
  const av = r.avisos_costanero || [];
  let grupo = '', h = '<h2>Balizamiento Costanero</h2>';
  for (const l of av) { if (/:$/.test(l)) { grupo = l.replace(':', ''); continue; } h += `<div class="aviso ${/FALTA|AVERIADA/.test(grupo) ? 'falta' : ''}"><strong>${esc(grupo.toLowerCase())}:</strong> ${esc(l)}</div>`; }
  if (!av.length) h += '<p>Sin novedades.</p>';

  $('#avisos').innerHTML = h;
}
/* Alturas del SHN en vivo: su API responde directo al navegador, así la altura no depende de que corra el Action.
   situacion.json sigue trayendo avisos, Prefectura y SMN, y es el respaldo si el SHN no responde. */
const EST_SHN = { PNOR: 'Pilote Norden', SFER: 'San Fernando', BSAS: 'Buenos Aires', MAGA: 'Martín García', LPLA: 'La Plata' };
const vivo = {}; let shnVivo = 0;
// Solo lo necesario: San Fernando y Buenos Aires (rayado y Costanero), Martín García (marea de Colonia) y la zona elegida
const zonasVivo = () => [...new Set(['SFER', 'BSAS', 'MAGA', leer('zonaMarea', 'SFER')])].filter(c => EST_SHN[c]); // (zonaSel todavía no existe al arrancar)
function alturasEnVivo(codigos = zonasVivo()) {
  const f = fechaSHN(0);
  return Promise.allSettled(codigos.map(cod =>
    pedirSHN(cod, f).then(d => {
      const obs = (d.lecturas || []).filter(x => x.altura != null).map(x => [x.fecha, +x.altura.toFixed(2)]);
      if (!obs.length) return;
      vivo[cod] = { observada: obs, astronomica: (d.astronomica || []).filter(x => x.altura != null).map(x => [x.fecha, +x.altura.toFixed(2)]), nota: d.observaciones || '' };
      shnVivo = Date.now();
    })));
}
function aplicarVivo() { // pone en sit lo bajado en vivo si es más nuevo; devuelve si cambió algo
  if (!sit) return false;
  const m = sit.mareografos = sit.mareografos || {}; let cambio = false;
  for (const [cod, v] of Object.entries(vivo)) {
    const est = m[cod] = m[cod] || { nombre: EST_SHN[cod], observada: [], astronomica: [] }, u = ultimo(est.observada), lv = ultimo(v.observada);
    if (u && lv[0] < u[0]) continue;
    if (!u || lv[0] !== u[0] || lv[1] !== u[1]) cambio = true;
    est.observada = v.observada; if (v.astronomica.length) est.astronomica = v.astronomica; est.nota = v.nota;
  }
  return cambio;
}
function repintar() { armarUY(); pintarSituacion(); dibujarNoPasa(); pintarAlertas(); }
function cargarSituacion() {
  const pv = alturasEnVivo();
  fetch('datos/situacion.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { sit = d; aplicarVivo(); repintar(); })
    .catch(() => { if (sit) repintar(); else $('#actualizado').textContent = 'sin conexión'; }) // sin señal: la estimación sigue avanzando
    .then(() => pv).then(() => { if (aplicarVivo()) repintar(); });
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
    if (max >= UMBRAL_RAFAGA) A.push({ n: 'rojo', t: `Ráfagas ${Math.round(max)} kn · ${PUNTOS[k].n} ~${hora(hMax)}` });
    if (torm) A.push({ n: 'rojo', t: `Tormentas desde ${hora(torm)} · ${PUNTOS[k].n}` });
  }
  // 3) avisos a muy corto plazo del SMN que nombran la zona
  for (const a of (sit?.smn || [])) if (a.zona) A.push({ n: 'rojo', t: `SMN: ${a.titulo}. ${a.texto}` });
  // 4) olas Canal Costanero Km 17 (pronóstico SHN de hoy)
  const ol = (sit?.radioavisos?.olas_costanero_km17 || []).find(o => o.fecha === `${dd}-${mm}-${yy.slice(2)}`);
  if (ol) { const m = Math.max(ol.manana.alt, ol.tarde.alt); if (m >= UMBRAL_OLA) A.push({ n: 'ambar', t: `Olas ${num(m, 1)} m · Costanero` }); }
  // 5-6) crecidas y bajantes extremas (medido ahora y pleamar/bajamar de hoy)
  const pref = sit?.prefectura || {}, pb = sit?.radioavisos?.pleamar_bajamar || {}, m = sit?.mareografos || {};
  for (const [cod, nom, lvl] of [['SFER', 'San Fernando', pref['San Fernando']?.alerta ?? 3.0], ['BSAS', 'Buenos Aires', pref['Buenos Aires']?.alerta ?? 3.3]]) {
    const u = m[cod] && ultimo(m[cod].observada), e = m[cod] && estimacion(m[cod]);
    if (u && u[1] >= lvl) A.push({ n: 'rojo', t: `Crecida ${nom} ${num(u[1])} m (alerta ${num(lvl)})` });
    if (u && u[1] <= UMBRAL_BAJANTE) A.push({ n: 'rojo', t: `Bajante extrema ${nom} ${num(u[1])} m` });
    if (e && e.dif <= UMBRAL_SOBREELEV) A.push({ n: 'ambar', t: `Bajante por viento ${nom} −${num(-e.dif)} m` });
    for (const x of (pb[nom] || [])) {
      if (x.fecha !== `${dd}/${mm}/${yy}`) continue;
      if (x.estado === 'pleamar' && x.altura >= lvl) A.push({ n: 'rojo', t: `Crecida ${nom}: pleamar ${num(x.altura)} m ${x.hora}` });
      if (x.estado === 'bajamar' && x.altura <= UMBRAL_BAJANTE) A.push({ n: 'rojo', t: `Bajante ${nom}: bajamar ${num(x.altura)} m ${x.hora}` });
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
    const txtV = v => v[0] === v[1] ? `~${hora(v[0])}` : `${hora(v[0])}–${hora(v[1])}`;
    if (hayMalas) {
      A.push({ n: 'rojo', t: ventanas.length
        ? `Costanero ${num(cal)} m: pasás ${ventanas.map(txtV).join(' y ')}`
        : `Costanero ${num(cal)} m: hoy no pasás` });
    } else if (justas) {
      const j = pts.filter(p => margen(p[1]) < 0.4).map(p => p[0]);
      A.push({ n: 'ambar', t: `Costanero ${num(cal)} m: justo ${j.length > 1 ? `${hora(j[0])}–${hora(j[j.length - 1])}` : `~${hora(j[0])}`}` });
    }
  }
  return A;
}
// Aviso al abrir la app: primero esto, después las alertas del día
$('#avisoOk').onclick = () => { $('#avisoInicio').hidden = true; pintarAlertas(); };
function pintarAlertas() {
  const caja = $('#alertas'); if (!caja) return;
  const A = alertasDelDia(), clave = hoyISO() + '|' + A.map(a => a.t).join('|');
  // pestaña Alertas: siempre con las del día, aunque se cierre el cartel
  const lista = $('#listaAlertas'), cuenta = $('#cuentaAlertas');
  if (lista) lista.innerHTML = A.length ? A.map(a => `<div class="alerta-item ${a.n === 'ambar' ? 'ambar' : ''}">${esc(a.t)}</div>`).join('') : '<p>Sin alertas hoy.</p>';
  if (cuenta) { cuenta.hidden = !A.length; cuenta.textContent = A.length; cuenta.className = 'cuenta' + (A.some(a => a.n === 'rojo') ? '' : ' ambar'); }
  if (!A.length || leer('alertaCerrada', '') === clave || !$('#avisoInicio').hidden) { caja.hidden = true; return; } // el aviso de inicio va primero
  const nuevo = caja.dataset.clave !== clave; caja.dataset.clave = clave;
  caja.className = 'alertas ' + (A.some(a => a.n === 'rojo') ? 'rojo' : 'ambar');
  caja.innerHTML = `<button class="cerrar" id="cerrarAlerta" aria-label="Cerrar aviso">×</button><strong>Hoy</strong><ul>${A.map(a => `<li>${esc(a.t)}</li>`).join('')}</ul><button class="ver" id="verAlertas">Ver en Alertas</button>`;
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
  abrirPanel(false); $('#hojaMarea').hidden = true; abrirAjustes(false);
  $('#hojaViento').hidden = false;
  cargarViento(true);
}
$('#cerrarViento').onclick = () => { $('#hojaViento').hidden = true; };
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
  const pts = trackActual; trackActual = []; guardar('trackActual', []); pintarRec();
  if (pts.length < 2) { listarRecorridos(); return; }
  const L0 = pts[0][2], L1 = pts[pts.length - 1][2];
  const rec = { id: L0, inicio: L0, fin: L1, puntos: pts, dist: distTrack(pts), vmax: Math.max(...pts.map(p => p[3] || 0)) };
  guardar('recPendiente', rec); preguntarRec(rec);
}
function preguntarRec(rec) {
  const dlg = $('#dlgRec'), nom = $('#dlgRecNombre'), borrar = $('#dlgRecBorrar');
  $('#dlgRecDet').textContent = `${num(rec.dist / 1852, 2)} MN · ${fmtDur(rec.fin - rec.inicio)} · ${fmtFecha(rec.inicio)}`;
  nom.value = ''; nom.placeholder = 'Nombre (opcional)';
  borrar.textContent = 'Eliminar'; borrar.dataset.seguro = '';
  dlg.hidden = false;
  const cerrar = () => { dlg.hidden = true; guardar('recPendiente', null); listarRecorridos(); };
  $('#dlgRecGuardar').onclick = () => { if (nom.value.trim()) rec.n = nom.value.trim(); const l = leer('recorridos', []); l.unshift(rec); guardar('recorridos', l); cerrar(); };
  borrar.onclick = () => { if (borrar.dataset.seguro !== '1') { borrar.dataset.seguro = '1'; borrar.textContent = 'Tocá de nuevo para eliminar'; return; } cerrar(); };
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
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Costanero" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(r.n || 'Recorrido ' + fmtFecha(r.inicio))}</name><trkseg>${pts}</trkseg></trk></gpx>`;
}
const vistos = new Map(); // id → línea en el mapa
function verRecorrido(r, ver) {
  if (!ver) { vistos.get(r.id)?.remove(); vistos.delete(r.id); return; }
  const ln = L.polyline(r.puntos.map(p => [p[0], p[1]]), { pane: 'ruta', color: '#00d5ff', weight: 4, dashArray: '2 6', opacity: 0.95 })
    .bindPopup(`<h3>${esc(r.n || 'Recorrido')}</h3><p>${esc(fmtFecha(r.inicio))} · ${num(r.dist / 1852, 2)} MN · ${fmtDur(r.fin - r.inicio)}</p>`).addTo(capaTrack);
  vistos.set(r.id, ln);
  activarSeguir(false); mapa.fitBounds(ln.getBounds(), { padding: [40, 40] }); if (innerWidth < 700) abrirPanel(false);
}
// Renombrar en el lugar: el título pasa a ser un campo de texto
function renombrar(h3, actual, alGuardar) {
  const inp = document.createElement('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = actual; inp.className = 'renombrar';
  h3.replaceWith(inp); inp.focus(); inp.select();
  const fin = () => { const v = inp.value.trim(); alGuardar(v || actual); };
  inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = actual; inp.blur(); } };
  inp.onblur = fin;
}
function listarRecorridos() {
  const caja = $('#listaRecorridos'); if (!caja) return;
  const lista = leer('recorridos', []);
  caja.innerHTML = (grabando ? `<div class="reco"><h3>Grabando ahora</h3><p>${trackActual.length} puntos · ${num(distTrack(trackActual) / 1852, 2)} MN</p></div>` : '')
    + (lista.length ? lista.map((r, i) => `<div class="reco"><h3>${esc(r.n || fmtFecha(r.inicio))}</h3><p>${r.n ? esc(fmtFecha(r.inicio)) + ' · ' : ''}${num(r.dist / 1852, 2)} MN · ${fmtDur(r.fin - r.inicio)} · media ${num(r.dist / 1852 / Math.max((r.fin - r.inicio) / 3600000, 0.01), 1)} kn${r.vmax ? ` · máx ${num(r.vmax, 1)} kn` : ''}</p>
      <div class="btns"><button data-ver="${i}" class="${vistos.has(r.id) ? 'on' : ''}">${vistos.has(r.id) ? 'Dejar de ver' : 'Ver en el mapa'}</button><button data-ren="${i}">Renombrar</button><button data-gpx="${i}">GPX</button><button class="peligro" data-borrar="${i}">Borrar</button></div></div>`).join('') : '<p class="nota">Sin recorridos. Grabá con ● en el mapa.</p>');
  caja.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => { const r = lista[+b.dataset.ver]; verRecorrido(r, !vistos.has(r.id)); listarRecorridos(); });
  caja.querySelectorAll('[data-ren]').forEach(b => b.onclick = () => {
    const i = +b.dataset.ren, r = lista[i];
    renombrar(b.closest('.reco').querySelector('h3'), r.n || fmtFecha(r.inicio), v => { const l = leer('recorridos', []); if (l[i]) { l[i].n = v; guardar('recorridos', l); } listarRecorridos(); });
  });
  caja.querySelectorAll('[data-gpx]').forEach(b => b.onclick = () => {
    const r = lista[+b.dataset.gpx], a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([gpx(r)], { type: 'application/gpx+xml' }));
    a.download = `${(r.n || 'recorrido').replace(/[^\w\-]+/g, '_')}-${new Date(r.inicio).toISOString().slice(0, 10)}.gpx`; document.body.appendChild(a); a.click(); a.remove();
  });
  caja.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => {
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = 'Tocá de nuevo para borrar'; return; }
    const l = leer('recorridos', []), r = l[+b.dataset.borrar]; if (r) verRecorrido(r, false); l.splice(+b.dataset.borrar, 1); guardar('recorridos', l); listarRecorridos();
  });
}
setInterval(() => { if (grabando) { guardar('trackActual', trackActual); listarRecorridos(); } }, 15000);
if (grabando) iniciarGps(false);
pintarRec(); listarRecorridos();
{ const p = leer('recPendiente', null); if (p) preguntarRec(p); } // si la app se cerró antes de responder

/* ---------- Waypoints: marcar un punto (posición del barco o mantener apretado en el mapa) ---------- */
const capaWp = L.layerGroup().addTo(mapa), marcasWp = new Map();
const iconoWp = n => L.divIcon({ className: 'toque', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10],
  html: `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 1l8 9-8 9-8-9z" fill="#ffd400" stroke="#0b2a3c" stroke-width="2"/></svg><div class="et-boya et-wp">${esc(n)}</div>` });
function pintarWp() {
  for (const m of marcasWp.values()) m.remove(); marcasWp.clear();
  for (const w of leer('waypoints', [])) if (w.ver !== false) {
    const m = ficha(L.marker([w.lat, w.lon], { icon: iconoWp(w.n), title: w.n, zIndexOffset: 500 }), w.lat, w.lon, w.n, `${fmtLat(w.lat)} · ${fmtLon(w.lon)}`).addTo(capaWp);
    marcasWp.set(w.id, m);
  }
  listarWp();
}
function nuevoWp(p) {
  const l = leer('waypoints', []), n = l.reduce((a, w) => Math.max(a, +(w.n.match(/^WP (\d+)$/) || [0, 0])[1]), 0) + 1;
  l.push({ id: Date.now(), n: `WP ${n}`, lat: +p.lat.toFixed(6), lon: +p.lng.toFixed(6), t: Date.now(), ver: true });
  guardar('waypoints', l); pintarWp();
}
function listarWp() {
  const caja = $('#listaWp'); if (!caja) return;
  const l = leer('waypoints', []);
  caja.innerHTML = l.length ? l.map((w, i) => `<div class="reco"><h3>◆ ${esc(w.n)}</h3><p>${esc(fmtLat(w.lat))} · ${esc(fmtLon(w.lon))}</p>
    <div class="btns"><button data-wver="${i}" class="${w.ver !== false ? 'on' : ''}">${w.ver !== false ? 'Ocultar' : 'Mostrar'}</button><button data-wir="${i}">Ir hasta aquí</button><button data-wren="${i}">Renombrar</button><button class="peligro" data-wbor="${i}">Borrar</button></div></div>`).join('')
    : '<p class="nota">Sin waypoints. Tocá tu barco → «◆ Waypoint aquí», o mantené apretado un punto del mapa.</p>';
  const cambiar = (i, f) => { const l2 = leer('waypoints', []); if (l2[i]) { f(l2[i]); guardar('waypoints', l2); } pintarWp(); };
  caja.querySelectorAll('[data-wver]').forEach(b => b.onclick = () => cambiar(+b.dataset.wver, w => { w.ver = w.ver === false; }));
  caja.querySelectorAll('[data-wir]').forEach(b => b.onclick = () => { const w = l[+b.dataset.wir]; irA(w.lat, w.lon, w.n); if (innerWidth < 700) abrirPanel(false); mapa.panTo([w.lat, w.lon]); });
  caja.querySelectorAll('[data-wren]').forEach(b => b.onclick = () => { const i = +b.dataset.wren; renombrar(b.closest('.reco').querySelector('h3'), l[i].n, v => cambiar(i, w => { w.n = v; })); });
  caja.querySelectorAll('[data-wbor]').forEach(b => b.onclick = () => {
    if (b.dataset.seguro !== '1') { b.dataset.seguro = '1'; b.textContent = 'Tocá de nuevo para borrar'; return; }
    const l2 = leer('waypoints', []); l2.splice(+b.dataset.wbor, 1); guardar('waypoints', l2); pintarWp();
  });
}
$('#marcarWp').onclick = () => { if (posGps) { nuevoWp(posGps); marcaBarco && marcaBarco.closePopup(); } };
// mantener apretado (o clic derecho) en el mapa: ofrecer guardar waypoint ahí
mapa.on('contextmenu', e => {
  const div = document.createElement('div');
  div.innerHTML = `<p class="nota">${esc(fmtLat(e.latlng.lat))}<br>${esc(fmtLon(e.latlng.lng))}</p><button class="btn-ir">◆ Guardar waypoint</button>`;
  L.DomEvent.disableClickPropagation(div);
  const pop = L.popup({ closeButton: false }).setLatLng(e.latlng).setContent(div).openOn(mapa);
  div.querySelector('.btn-ir').onclick = ev => { L.DomEvent.stop(ev); nuevoWp(e.latlng); setTimeout(() => mapa.closePopup(pop), 0); };
});
pintarWp();

// Restaurar la última pestaña (al final: todo lo que usa ya está definido)
{ const t = document.querySelector(`.tab[data-t="${leer('tab', 'avisos')}"]`) || document.querySelector('.tab[data-t="avisos"]'); if (t) t.click(); }

/* ---------- Instalar app: solo en celular, dentro del panel ☰ ---------- */
let pedidoInstalar = null;
const esMovil = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function pintarInstalar() {
  const zona = $('#zonaInstalar'); if (!zona) return;
  const mostrar = esMovil && !instalada();
  zona.hidden = !mostrar;
  $('#btnInstalar').hidden = !pedidoInstalar;
  $('#txtInstalar').hidden = !!pedidoInstalar;
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; pintarInstalar(); });
addEventListener('appinstalled', () => { pedidoInstalar = null; pintarInstalar(); });
$('#btnInstalar').onclick = async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  try { await pedidoInstalar.userChoice; } catch (e) {}
  pedidoInstalar = null; pintarInstalar();
};
pintarInstalar();

/* ---------- Offline ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  // cuando se activa una versión nueva de la app, recargar una vez para mostrarla
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado) { recargado = true; location.reload(); } });
}
/* ---------- Barra de marea (abajo a la derecha): altura en San Fernando ahora; tocar abre la hoja de mareas ---------- */
const MAREA_MIN = -0.5, MAREA_MAX = 3.0, MAREA_ALTA = 1.5;
const zonaSel = $('#zonaMarea'); zonaSel.value = leer('zonaMarea', 'SFER'); if (!zonaSel.value) zonaSel.value = 'SFER';
const PB_ZONA = { SFER: 'San Fernando', BSAS: 'Buenos Aires' };
zonaSel.onchange = () => { guardar('zonaMarea', zonaSel.value); pintarEstacion(); pintarBarraMarea(); pintarCurva();
  if (EST_SHN[zonaSel.value] && !vivo[zonaSel.value]) alturasEnVivo([zonaSel.value]).then(() => { if (aplicarVivo()) repintar(); }); };
function pintarCurva() {
  const z = zonaSel.value, est = sit && sit.mareografos && sit.mareografos[z]; if (!est) return;
  $('#tituloCurva').textContent = 'Altura · ' + zonaSel.selectedOptions[0].textContent;
  if (!$('#hojaMarea').hidden) pedirAstroLargo(z); // 3 días de predicción: solo si se está mirando
  curva(z, est, z === 'SFER');
}
function pintarBarraMarea() {
  const z = zonaSel.value, b = $('#barraMarea'), sf = sit && sit.mareografos && sit.mareografos[z], a = alturaAhora(sf), u = a && [a.t, a.h];
  if (!u) { $('#mNum').textContent = '—'; $('#mFl').textContent = $('#mHora').textContent = ''; return; }
  const c = parseFloat(calado.value) || 0, margen = DETERMINANTE + u[1] - c;
  const nivel = u[1] <= UMBRAL_BAJANTE || (z === 'SFER' && margen < 0.2) ? 'bajo' : u[1] >= MAREA_ALTA ? 'alto' : 'medio';
  b.dataset.nivel = nivel;
  const pct = v => Math.max(0, Math.min(100, (v - MAREA_MIN) / (MAREA_MAX - MAREA_MIN) * 100));
  $('#mNivel').style.height = pct(u[1]) + '%';
  $('#mLim').style.bottom = pct(c - DETERMINANTE + 0.2) + '%'; $('#mLim').hidden = z !== 'SFER';
  $('#mNum').textContent = num(u[1], 1);
  const t = tendencia(sf, PB_ZONA[z]), m = t.match(/(▲|▼)[^<]*?(\d\d:\d\d)?</);
  $('#mFl').textContent = m ? m[1] : ''; $('#mFl').className = 'm-fl ' + (m && m[1] === '▲' ? 'sube' : 'baja');
  $('#mHora').textContent = m && m[2] ? m[2] : '';
  b.title = `${txtAltura(a, zonaSel.selectedOptions[0].textContent)} · tocá para ver las mareas`;
}
function abrirMarea() { abrirPanel(false); $('#hojaViento').hidden = true; abrirAjustes(false); $('#hojaMarea').hidden = false; const c = $('#curvaSF'); c._dibujar && c._dibujar(); c._alAhora && c._alAhora(); pedirAstroLargo(zonaSel.value); cargarCorriente(); }
/* Corriente: modelo oceánico global (Open-Meteo Marine, celda ~8 km): orientativa */
let corrT = 0;
async function cargarCorriente() {
  if (Date.now() - corrT < 30 * 60e3) return;
  const p = posGps || mapa.getCenter();
  try {
    const d = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat.toFixed(3)}&longitude=${p.lng.toFixed(3)}&hourly=ocean_current_velocity,ocean_current_direction&forecast_days=2&cell_selection=sea&timezone=America%2FArgentina%2FBuenos_Aires`).then(r => r.json());
    const h = d.hourly; if (!h) return;
    const ahora = Date.now(), i0 = Math.max(0, h.time.findIndex(t => new Date(t) > ahora - 3600e3));
    const fila = i => h.ocean_current_velocity[i] == null ? '' : `<td><b>${num(h.ocean_current_velocity[i] / 1.852, 1)}</b> kn<br><span class="flecha" style="transform:rotate(${h.ocean_current_direction[i]}deg)">↑</span> ${cardinal(h.ocean_current_direction[i])}<br><small>${hora(h.time[i])}</small></td>`;
    const celdas = [0, 2, 4, 6].map(k => fila(i0 + k)).join('');
    if (!celdas) return;
    corrT = Date.now();
    const c = $('#corriente'); c.hidden = false;
    c.innerHTML = `<h2>Corriente <small class="nota">hacia · aprox.</small></h2><table class="vt corr"><tr>${celdas}</tr></table>`;
  } catch (e) {}
}
$('#barraMarea').onclick = abrirMarea;
$('#barraMarea').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirMarea(); } };
$('#cerrarMarea').onclick = () => { $('#hojaMarea').hidden = true; };
function abrirAjustes(abrir) {
  const h = $('#hojaAjustes'); abrir = abrir ?? h.hidden;
  if (abrir) { abrirPanel(false); $('#hojaMarea').hidden = true; $('#hojaViento').hidden = true; }
  h.hidden = !abrir; $('#btnAjustes').setAttribute('aria-pressed', abrir);
}
$('#btnAjustes').onclick = () => abrirAjustes();
$('#cerrarAjustes').onclick = () => abrirAjustes(false);
pintarBarraMarea();
/* Hojas de viento y marea: se cierran arrastrando hacia abajo con un dedo */
function arrastrable(hoja, cerrar, habilitado) {
  let y0 = null, x0 = 0, dy = 0, activo = false;
  hoja.addEventListener('touchstart', e => {
    const sc = e.target.closest && e.target.closest('.vista, .hoja-viento, .hoja-marea');
    if ((habilitado && !habilitado()) || (sc && sc.scrollTop > 0) || e.touches.length > 1 || (e.target.closest && e.target.closest('input, select, .scroll'))) { y0 = null; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; activo = false; }, { passive: true });
  hoja.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const d = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (!activo) { if (d > 10 && d > dx) activo = true; else if (dx > 10 || d < -5) { y0 = null; return; } else return; }
    dy = Math.max(0, d); hoja.style.transition = 'none'; hoja.style.transform = `translateY(${dy}px)`; e.preventDefault();
  }, { passive: false });
  hoja.addEventListener('touchend', () => {
    if (!activo) { y0 = null; return; }
    hoja.style.transition = 'transform .18s'; 
    if (dy > 70) { hoja.style.transform = 'translateY(105%)'; setTimeout(() => { if (cerrar) cerrar(); else hoja.hidden = true; hoja.style.transform = ''; hoja.style.transition = ''; }, 180); }
    else { hoja.style.transform = ''; setTimeout(() => { hoja.style.transition = ''; }, 200); }
    y0 = null; activo = false;
  });
}
arrastrable($('#hojaMarea')); arrastrable($('#hojaViento')); arrastrable($('#hojaAjustes'), () => abrirAjustes(false));
/* Info: mostrar/ocultar coordenadas (grilla de lat/lon) y profundidades de la carta (sondajes) */
function pintarBotonesCapas() {
  const bc = $('#btnCoords'), bs = $('#btnSond');
  bc.textContent = verCoords ? 'Ocultar coordenadas' : 'Mostrar coordenadas'; bc.setAttribute('aria-pressed', verCoords);
  bs.textContent = verSond ? 'Ocultar profundidades' : 'Mostrar profundidades'; bs.setAttribute('aria-pressed', verSond);
}
$('#btnCoords').onclick = () => { verCoords = !verCoords; guardar('verCoords', verCoords); dibujarGrilla(); pintarBotonesCapas(); };
$('#btnSond').onclick = () => { verSond = !verSond; guardar('verSond', verSond); verSond ? capaSond.addTo(mapa) : capaSond.remove(); pintarBotonesCapas(); };
pintarBotonesCapas();
document.querySelectorAll('[data-paleta]').forEach(b => b.onclick = () => { paleta = b.dataset.paleta; guardar('paleta', paleta); aplicarColores(); pintarBotonesPaleta(); });
function pintarBotonesPaleta() { document.querySelectorAll('[data-paleta]').forEach(b => b.setAttribute('aria-pressed', b.dataset.paleta === paleta)); }
// Pantalla: Auto (como el teléfono) · Día · Noche — así se pueden usar los colores de día aunque el teléfono esté en modo oscuro
let tema = ['auto', 'dia', 'noche'].includes(leer('tema', 'auto')) ? leer('tema', 'auto') : 'auto';
function aplicarTema() { const d = document.documentElement.dataset; if (paleta === 'minima') d.theme = 'dark'; else if (tema === 'auto') delete d.theme; else d.theme = tema === 'dia' ? 'light' : 'dark';
  document.querySelectorAll('[data-tema]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tema === tema)); }
document.querySelectorAll('[data-tema]').forEach(b => b.onclick = () => { tema = b.dataset.tema; guardar('tema', tema); if (paleta === 'minima') { paleta = 'clasica'; guardar('paleta', paleta); pintarBotonesPaleta(); } aplicarTema(); aplicarColores(); });
aplicarTema(); pintarBotonesPaleta(); aplicarColores();
arrastrable($('#panel'), () => abrirPanel(false), () => innerWidth <= 700);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__dbg = { dibujarNoPasa, profs, get sit() { return sit; } }; // solo pruebas locales

}
