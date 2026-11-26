// Carte des ventes et légende des zones (Leaflet, chargé à la demande).
import { $ } from './dom.js';
import { groupMarketZones, MIN_ZONE_SALES } from './market-zones.js';
import { money, num } from './format.js';

const CENTER = [45.18, 5.73];
// Plan IGN de la Géoplateforme (Licence ouverte, sans clé), affiché en couleur.
const TILES =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
const RAMP = ['#48b6f1', '#77e0bf', '#f9e76e', '#ffab67', '#ee76a4'];
const NEUTRAL = '#dbe1e8';
const MEASURES = {
  m2: 'Prix médian au m²',
  price: 'Prix total médian',
  surface: 'Surface médiane',
};

let map, layer, leafletPromise;

export function loadLeaflet() {
  if (window.L) return Promise.resolve();
  leafletPromise ??= new Promise(resolve => {
    // Leaflet mesure son conteneur à la création : la feuille de style doit être appliquée avant.
    let pending = 2;
    const loaded = () => {
      if (--pending === 0) resolve();
    };
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'vendor/leaflet/leaflet.css';
    stylesheet.addEventListener('load', loaded, { once: true });
    stylesheet.addEventListener('error', loaded, { once: true });
    const script = document.createElement('script');
    script.src = 'vendor/leaflet/leaflet.js';
    script.addEventListener('load', loaded, { once: true });
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
  map = L.map('market-map', { scrollWheelZoom: true }).setView(CENTER, 11);
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

const formatValue = (key, value) =>
  key === 'surface' ? num(value) + ' m²' : money(value) + (key === 'm2' ? ' / m²' : '');

export function drawMarketZones(rows, key) {
  if (!layer) return;
  const { zones, bands } = groupMarketZones(rows, key);
  layer.clearLayers();
  for (const zone of zones) {
    const polygons = zone.rectangles.map(([west, south, east, north]) => [
      [
        [south, west],
        [south, east],
        [north, east],
        [north, west],
      ],
    ]);
    const shape = L.polygon(polygons, {
      stroke: false,
      fillColor: zone.band === null ? NEUTRAL : RAMP[zone.band],
      fillOpacity: 0.78,
    });
    addZone(zone, shape, key);
  }
  renderZoneTable(zones, key);
  const ranges = bands.map((edge, i) =>
    i === 0
      ? `< ${formatValue(key, edge)}`
      : `${formatValue(key, bands[i - 1])} à < ${formatValue(key, edge)}`,
  );
  if (bands.length) ranges.push(`≥ ${formatValue(key, bands.at(-1))}`);
  else if (zones.some(zone => zone.band !== null)) ranges.push('Même tranche sur la carte');
  $('map-legend').innerHTML =
    `<span>${MEASURES[key]} · ventes filtrées</span>` +
    (ranges.length
      ? ranges
          .map(
            (range, i) =>
              `<span class="market-zone-key"><i style="background:${RAMP[i]}"></i>${range}</span>`,
          )
          .join('')
      : '<span>Aucune zone avec assez de ventes pour ces filtres.</span>') +
    `<span class="legend-note">Gris · moins de ${MIN_ZONE_SALES} ventes</span>`;
}

function zoneValue(zone, key) {
  return zone.median === null ? 'Données insuffisantes' : formatValue(key, zone.median);
}

function addZone(zone, shape, key) {
  const info = document.createElement('span');
  info.textContent = `${zone.name} · ${num(zone.count)} ventes · ${zoneValue(zone, key)}`;
  shape.bindPopup(info).addTo(layer);
}

function renderZoneTable(zones, key) {
  $('market-zone-measure').textContent = MEASURES[key];
  const rows = zones.map(zone => {
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = zone.name;
    row.append(label);
    row.insertCell().textContent = num(zone.count);
    row.insertCell().textContent = zoneValue(zone, key);
    return row;
  });
  $('market-zone-rows').replaceChildren(...rows);
  $('market-zone-details').hidden = !rows.length;
}
