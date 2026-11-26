// Carte des ventes (Leaflet, chargé à la demande) : marqueurs, échelle de couleurs et légende.
import { $ } from './dom.js';
import { createIrisSummary, MIN_IRIS_SALES } from './market-iris.js';
import { readJson } from './store.js';
import { esc, money, num, median, measure, scaleDomain, rampColor, frDate } from './format.js';

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
let irisData,
  renderVersion = 0;

export function drawSales(rows, key) {
  if (!layer) return;
  const version = ++renderVersion;
  layer.clearLayers();
  if (key === 'iris') {
    drawIris(rows, version);
    return;
  }
  $('market-iris-details').hidden = true;
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

async function drawIris(rows, version) {
  const legend = $('map-legend');
  $('market-iris-rows').replaceChildren();
  legend.textContent = 'Chargement des quartiers IRIS de Grenoble…';
  try {
    irisData ??= readJson('data/iris-grenoble-carte.geojson')
      .then(contours => ({ contours, summarize: createIrisSummary(contours) }))
      .catch(error => {
        irisData = undefined;
        throw error;
      });
    const { contours, summarize } = await irisData;
    if (version !== renderVersion) return;
    const stats = summarize(rows);
    const stops = readRamp();
    const domain = scaleDomain(
      [...stats.values()].flatMap(s => (s.median === null ? [] : [s.median])),
    );
    const neutral = '#777';
    L.geoJSON(contours, {
      style: feature => {
        const value = stats.get(feature.properties.CODE_IRIS)?.median;
        return {
          color: neutral,
          weight: 1,
          fillColor: domain && value != null ? rampColor(value, domain, stops) : neutral,
          fillOpacity: value == null ? 0.12 : 0.66,
        };
      },
      onEachFeature: (feature, shape) => {
        const code = feature.properties.CODE_IRIS;
        const stat = stats.get(code);
        const info = document.createElement('span');
        info.textContent =
          stat?.median == null
            ? `IRIS ${code} · ${stat?.count ?? 0} ventes · données insuffisantes`
            : `IRIS ${code} · ${formatValue('m2', stat.median)} · ${stat.count} ventes`;
        shape.bindPopup(info);
      },
    }).addTo(layer);
    renderIrisTable(contours, stats);
    legend.innerHTML =
      '<span>Grenoble · prix médian au m² des ventes filtrées par IRIS (IGN 2022)</span>' +
      (domain
        ? `<div class="scale" role="img" aria-label="Prix médian au m² du plus bas au plus haut"><span>≤ ${formatValue('m2', domain.lo)}</span><i class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></i><span>≥ ${formatValue('m2', domain.hi)}</span></div>`
        : '<span>Aucun quartier avec assez de ventes pour ces filtres.</span>') +
      `<span class="legend-note">Zone grise · moins de ${MIN_IRIS_SALES} ventes</span>`;
  } catch {
    if (version !== renderVersion) return;
    $('market-iris-details').hidden = true;
    legend.textContent = 'Les quartiers sont indisponibles. La vue par points reste accessible.';
  }
}

function renderIrisTable(contours, stats) {
  const codes = contours.features.map(feature => feature.properties.CODE_IRIS).sort();
  const rows = codes.map(code => {
    const stat = stats.get(code);
    const row = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = code;
    row.append(label);
    row.insertCell().textContent = num(stat?.count ?? 0);
    row.insertCell().textContent =
      stat?.median == null ? 'Données insuffisantes' : formatValue('m2', stat.median);
    return row;
  });
  $('market-iris-rows').replaceChildren(...rows);
  $('market-iris-details').hidden = false;
}
