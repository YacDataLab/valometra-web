// Carte des ventes (Leaflet, chargé à la demande) : marqueurs, échelle de couleurs et légende.
import { $ } from './store.js';

const { esc, money, num, median, measure, scaleDomain, rampColor, frDate } = window.ValometraFormat;

const CENTER = [45.18, 5.73];
// Plan IGN de la Géoplateforme (Licence ouverte, sans clé), affiché en couleur.
const TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
// Du plus bas au plus haut prix : cuivre clair vers cuivre foncé, lisible sur le Plan IGN.
const RAMP = ['200', '400', '600', '700'];

let map, layer, leafletPromise;

export function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletPromise ??= new Promise(resolve => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'vendor/leaflet/leaflet.css';
    const script = document.createElement('script');
    script.src = 'vendor/leaflet/leaflet.js';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        stylesheet.remove();
        leafletPromise = undefined;
        resolve();
      },
      { once: true },
    );
    document.head.append(stylesheet, script);
  });
  return leafletPromise;
}

// Crée la carte une seule fois ; `onMove` est rappelé quand la zone visible change.
export function initMap(onMove) {
  if (map) return;
  if (!window.L) {
    $('market-map').innerHTML =
      '<p class="notice">La carte est indisponible. Les statistiques et le tableau restent accessibles.</p>';
    return;
  }
  map = L.map('market-map', { scrollWheelZoom: false }).setView(CENTER, 11);
  L.tileLayer(TILES, {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.ign.fr/" target="_blank" rel="noopener">IGN</a> · Plan IGN',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('moveend', onMove);
  map.invalidateSize();
}

export const hasMap = () => Boolean(map);
export const inView = row => map.getBounds().contains([row.lat, row.lon]);
export const resetView = () => map?.setView(CENTER, 11);

const readRamp = () => {
  const style = getComputedStyle(document.documentElement);
  return RAMP.map(step => style.getPropertyValue('--vm-color-cuivre-' + step).trim());
};

const formatValue = (key, value) =>
  key === 'surface' ? num(value) + ' m²' : money(value) + (key === 'm2' ? ' / m²' : '');

// Ventes situées aux mêmes coordonnées : un seul point, dont la couleur est la médiane du groupe.
const groupByPoint = rows => {
  const groups = new Map();
  for (const row of rows) {
    const key = row.lat.toFixed(5) + ',' + row.lon.toFixed(5);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
};

const popup = rows =>
  `<b>${rows.length} vente${rows.length > 1 ? 's' : ''} · ${esc(rows[0].town)}</b>` +
  rows
    .map(
      r =>
        `<div class="popup-sale">${esc(frDate(r.date))} · ${num(r.surface)} m² · ${num(r.rooms)} pièces<br><b>${money(r.price)}</b> · ${money(r.price / r.surface)}/m² · DPE ${esc(r.dpe || 'absent')}</div>`,
    )
    .join('');

// Dessine les ventes avec une échelle continue et met à jour la légende.
export function drawSales(rows, key) {
  if (!layer) return;
  layer.clearLayers();
  const stops = readRamp(),
    domain = scaleDomain(rows.map(r => measure(r, key)));
  for (const group of groupByPoint(rows)) {
    const value = median(group.map(r => measure(r, key)));
    L.circleMarker([group[0].lat, group[0].lon], {
      radius: Math.min(15, 5 + Math.log2(group.length) * 2),
      fillColor: rampColor(value, domain, stops),
      color: '#fff',
      weight: 1,
      fillOpacity: 0.85,
    })
      .bindPopup(popup(group), { maxWidth: 320 })
      .addTo(layer);
  }
  $('map-legend').innerHTML = domain
    ? `<span>${num(rows.length)} ventes sur la carte</span>` +
      `<div class="scale" role="img" aria-label="Échelle de couleurs : du plus bas, ${formatValue(key, domain.lo)}, au plus haut, ${formatValue(key, domain.hi)}">` +
      `<span>≤ ${formatValue(key, domain.lo)}</span><i class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></i><span>≥ ${formatValue(key, domain.hi)}</span></div>` +
      `<span class="legend-note">Taille du point : nombre de ventes à cette adresse</span>`
    : '<span>Aucune vente à afficher.</span>';
}
