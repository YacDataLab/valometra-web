'use strict';
const $ = id => document.getElementById(id),
  money = n =>
    // Charte : espace fine insécable (U+202F) avant € et entre les milliers.
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })
      .format(n)
      .replace(/\u00a0/g, '\u202f'),
  num = n =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
      .format(n)
      .replace(/\u00a0/g, '\u202f'),
  esc = s =>
    String(s).replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    ),
  median = a => {
    if (!a.length) return null;
    const s = [...a].sort((a, b) => a - b),
      m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
let metadata,
  market = [],
  map,
  layer,
  filtered = [],
  page = 0,
  worker,
  enginePromise,
  marketPromise,
  leafletPromise,
  marketView = 0,
  lastInputs = null,
  requestId = 0,
  hasResult = false,
  lastPrediction = null;
function readJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error('Données indisponibles.');
    return response.json();
  });
}

function loadMarket() {
  marketPromise ??= readJson('market.json')
    .then(rows => {
      market = rows;
    })
    .catch(error => {
      marketPromise = undefined;
      throw error;
    });
  return marketPromise;
}

function loadLeaflet() {
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

async function route() {
  const view = ++marketView;
  const hash = location.hash.slice(1);
  const id = ['estimate', 'market', 'method'].includes(hash) ? hash : 'estimate';
  document.querySelectorAll('.page').forEach(element => {
    element.hidden = element.id !== id;
  });
  document.querySelectorAll('nav a').forEach(link => {
    const active = link.hash === '#' + id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (id !== 'market') return;
  const status = $('market-stats');
  status.textContent = 'Chargement des ventes…';
  try {
    await Promise.all([loadMarket(), loadLeaflet()]);
    if (view !== marketView) return;
    initMap();
    map?.invalidateSize();
    renderMarket();
  } catch {
    if (view === marketView)
      status.textContent = 'Ventes indisponibles. Rouvrez l’explorateur pour réessayer.';
  }
}

window.addEventListener('hashchange', route);
route();

function resetEngine() {
  worker?.terminate();
  worker = undefined;
  enginePromise = undefined;
}

function startEngine() {
  enginePromise ??= new Promise((resolve, reject) => {
    worker = new Worker('inference-worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') resolve();
      if (data.type === 'prediction' && data.id === requestId) {
        $('estimate-button').disabled = false;
        $('estimate-button').textContent = 'Actualiser mon estimation';
        lastPrediction = data;
        performance.mark('valometra-estimate-ready');
        performance.measure(
          'valometra-estimation',
          'valometra-estimate-start',
          'valometra-estimate-ready',
        );
        showResult(data.value, lastInputs, data.intervals);
      }
      if (data.type === 'error') {
        if (data.id === undefined) reject(new Error(data.message));
        else if (data.id === requestId) engineFailure(data.message);
      }
    };
    worker.onerror = () => {
      reject(new Error('Le moteur n’a pas pu démarrer.'));
      engineFailure('Le moteur n’a pas pu démarrer.');
    };
    worker.postMessage({ type: 'init' });
  });
  return enginePromise;
}

function engineFailure(message) {
  resetEngine();
  $('estimate-button').disabled = false;
  $('estimate-button').textContent = 'Réessayer l’estimation';
  $('model-status').textContent =
    'Estimation interrompue. Vérifiez votre connexion puis réessayez. ' + message;
}
$('estimate-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!metadata || $('estimate-button').disabled) return;
  const address = window.ValometraAddress.getSelected();
  if (!address) {
    $('model-status').textContent = 'Sélectionnez une adresse complète parmi les suggestions.';
    return;
  }
  if (window.ValometraEnrichment?.isBusy()) {
    $('model-status').textContent =
      'La recherche des données de l’adresse est en cours. Patientez quelques instants.';
    return;
  }
  const town = metadata.towns.find(t => t.code === address.code);
  if (!town) {
    $('model-status').textContent =
      'Cette commune n’est pas couverte. Choisissez une adresse dans l’une des communes proposées.';
    return;
  }
  if ($('dpe').value && (!$('dpe-date').value || $('dpe-date').value > '2026-06-30')) {
    $('model-status').textContent =
      'Indiquez la date du DPE, au plus tard le 30 juin 2026, ou laissez le DPE non renseigné.';
    return;
  }
  const lat = address.lat,
    lon = address.lon;
  const f = {
    ...window.ValometraEnrichment?.getFeatures(),
    code_commune: town.code,
    code_postal: address.postal,
    est_vefa: 'false',
    surface_habitable: $('surface').value,
    surface_carrez: $('carrez').value,
    nb_pieces: $('rooms').value,
    nb_dependances: $('dependencies').value,
    dpe_etiquette_energie: $('dpe').value,
    dpe_type: $('dpe').value ? 'existant' : '',
    bdnb_annee_construction: $('year').value,
    longitude: lon,
    latitude: lat,
    jours_depuis_2025: 545,
    dpe_disponible: $('dpe').value ? 1 : 0,
    carrez_disponible: $('carrez').value ? 1 : 0,
    coordonnees_disponibles: lat ? 1 : 0,
  };
  for (const field of document.querySelectorAll('[data-feature]')) {
    const k = field.dataset.feature;
    if (k.startsWith('dpe_') && !f.dpe_etiquette_energie) continue;
    f[k] = field.value;
  }
  if (!f.dpe_etiquette_energie) {
    for (const k of Object.keys(f)) if (k.startsWith('dpe_') && k !== 'dpe_disponible') delete f[k];
  }
  lastInputs = {
    town,
    address: address.label,
    surface: +f.surface_habitable,
    surfaceDefinition: $('surface-definition').value,
    features: f,
    enrichment: window.ValometraEnrichment?.getSummary(),
  };
  $('estimate-button').disabled = true;
  $('estimate-button').textContent = 'Calcul en cours…';
  $('model-status').textContent = 'Calcul de votre estimation…';
  performance.mark('valometra-estimate-start');
  try {
    await Promise.all([startEngine(), loadMarket()]);
    worker.postMessage({ type: 'predict', features: f, id: ++requestId });
  } catch (error) {
    engineFailure(error.message);
  }
});
$('interval-coverage').addEventListener('change', () => {
  if (lastPrediction && lastInputs)
    showResult(lastPrediction.value, lastInputs, lastPrediction.intervals);
});
$('dpe').addEventListener('change', () => {
  $('dpe-date').required = Boolean($('dpe').value);
});
$('estimate-form').addEventListener('input', () => {
  if (hasResult)
    $('model-status').textContent =
      'Les caractéristiques ont changé. Actualisez l’estimation pour recalculer le résultat.';
});
function showResult(value, input, intervals) {
  hasResult = true;
  const band = $('interval-coverage').value || '80',
    bounds = intervals?.[band];
  if (!bounds || !bounds.every(Number.isFinite)) {
    $('model-status').textContent =
      'Les bornes n’ont pas pu être calculées. Relancez l’estimation.';
    return;
  }
  const { town, surface, features } = input;
  const comps = market.filter(
    r => r.code === town.code && r.surface >= surface * 0.75 && r.surface <= surface * 1.25,
  );
  const m = median(comps.map(r => r.price / r.surface));
  $('result').innerHTML =
    `<div class="result-top"><div class="section-head"><span class="eyebrow">VOTRE ESTIMATION INDICATIVE</span></div><h2>${esc(town.name)} · ${num(surface)} m²</h2><p class="hint">${esc(input.address)}</p><div class="price">${money(Math.round(value / 1000) * 1000)}</div><span class="price-unit">soit environ ${money(Math.round(value / surface))} / m² · référence juin 2026</span></div><div class="range-box"><h3>Fourchette ${band === '50' ? 'centrale' : 'étendue'} · objectif ${band} %</h3><div class="range-bar"></div><div class="range-values"><span>${money(Math.round(bounds[0] / 1000) * 1000)}</span><span>${money(Math.round(bounds[1] / 1000) * 1000)}</span></div><p class="hint">Bornes personnalisées à partir des caractéristiques du bien. ${band === '50' ? 'Cette fourchette plus étroite couvre environ une vente sur deux dans l’évaluation historique.' : 'La couverture mesurée sur les ventes de juin 2026 est de 84,9 %.'} Retrouvez la méthode dans « Comprendre ces repères ».</p></div><dl><dt>Repère local, sans ajustement de qualité</dt><dd>${comps.length} ventes de la commune, surfaces à ±25 %${m ? ` · médiane ${money(m)} / m²` : ''}</dd><dt>Localisation</dt><dd>${features.latitude ? `Adresse localisée · bâtiment ${input.enrichment?.building ? 'retrouvé' : 'renseigné manuellement ou absent'} · DPE ${input.enrichment?.dpe ? 'confirmé depuis l’ADEME' : 'saisi manuellement ou absent'}.` : 'Coordonnées non renseignées'}</dd></dl><p class="hint">Une expertise sur place reste utile pour l’état, l’étage, la vue et les travaux. Aucun ajustement de marché après juin 2026.</p><a class="secondary" href="#method">Comprendre ces repères</a>`;
  window.dispatchEvent(
    new CustomEvent('valometra:estimated', {
      detail: {
        address: input.address,
        surface: surface,
        rooms: Number(features.nb_pieces),
        surfaceDefinition: input.surfaceDefinition,
        point: value,
        lower: bounds[0],
        upper: bounds[1],
        coverage: band,
      },
    }),
  );
  $('model-status').textContent = 'Estimation actualisée.';
}
function initMap() {
  if (map) return;
  if (!window.L) {
    $('market-map').innerHTML =
      '<p class="notice">La carte est indisponible. Les statistiques et le tableau restent accessibles.</p>';
    return;
  }
  map = L.map('market-map', { scrollWheelZoom: false }).setView([45.18, 5.73], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  map.on('moveend', () => {
    if ($('visible-only').checked) renderMarket();
  });
}
function getBase() {
  const town = $('market-town').value,
    dpe = $('market-dpe').value;
  return market.filter(
    r =>
      (!town || r.code === town) &&
      (!$('min-area').value || r.surface >= +$('min-area').value) &&
      (!$('max-area').value || r.surface <= +$('max-area').value) &&
      (!$('min-price').value || r.price >= +$('min-price').value) &&
      (!$('max-price').value || r.price <= +$('max-price').value) &&
      (!$('from-date').value || r.date >= $('from-date').value) &&
      (!$('to-date').value || r.date <= $('to-date').value) &&
      (!dpe || (dpe === 'missing' ? !r.dpe : r.dpe === dpe)),
  );
}
const measure = (r, k) =>
  k === 'price' ? r.price : k === 'surface' ? r.surface : r.price / r.surface;
function renderMarket() {
  if (!metadata) return;
  const base = getBase();
  filtered =
    $('visible-only').checked && map
      ? base.filter(r => map.getBounds().contains([r.lat, r.lon]))
      : base;
  const prices = filtered.map(r => r.price),
    m2 = filtered.map(r => r.price / r.surface);
  $('market-stats').innerHTML =
    `<div class="stat"><b>${num(filtered.length)}</b><span>ventes sélectionnées</span></div><div class="stat"><b>${filtered.length ? money(median(m2)) : '—'}</b><span>prix médian / m²</span></div><div class="stat"><b>${filtered.length ? money(median(prices)) : '—'}</b><span>prix médian</span></div>`;
  if (layer) {
    layer.clearLayers();
    const key = $('map-color').value,
      vals = base.map(r => measure(r, key)).sort((a, b) => a - b),
      q1 = vals[Math.floor(vals.length / 3)] || 0,
      q2 = vals[Math.floor((vals.length * 2) / 3)] || 0,
      palette = ['300', '500', '800'].map(step =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--vm-color-ardoise-' + step)
          .trim(),
      );
    const buckets = new Map();
    for (const r of base) {
      const k = r.lat.toFixed(5) + ',' + r.lon.toFixed(5);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    }
    for (const rows of buckets.values()) {
      const v = median(rows.map(r => measure(r, key))),
        r = rows[0];
      const mark = L.circleMarker([r.lat, r.lon], {
        radius: Math.min(15, 5 + Math.log2(rows.length) * 2),
        fillColor: palette[v <= q1 ? 0 : v <= q2 ? 1 : 2],
        color: '#fff',
        weight: 1,
        fillOpacity: 0.8,
      }).addTo(layer);
      mark.bindPopup(
        `<b>${rows.length} vente${rows.length > 1 ? 's' : ''} · ${esc(r.town)}</b>` +
          rows
            .map(
              r =>
                `<div class="popup-sale">${esc(r.date)} · ${num(r.surface)} m² · ${num(r.rooms)} pièces<br><b>${money(r.price)}</b> · ${money(r.price / r.surface)}/m² · DPE ${esc(r.dpe || 'absent')}</div>`,
            )
            .join(''),
        { maxWidth: 320 },
      );
    }
    const unit = key === 'surface' ? 'm²' : key === 'price' ? '€' : '€/m²';
    $('map-legend').innerHTML =
      `<span>${base.length} ventes sur la carte</span><span><i style="background:${palette[0]}"></i>≤ ${num(q1)} ${unit}</span><span><i style="background:${palette[1]}"></i>${num(q1)}–${num(q2)} ${unit}</span><span><i style="background:${palette[2]}"></i>> ${num(q2)} ${unit}</span>`;
  }
  drawHistogram();
  page = 0;
  renderTable();
}
function drawHistogram() {
  const key = $('hist-measure').value,
    values = filtered.map(r => measure(r, key));
  if (!values.length) {
    $('market-hist').textContent = 'Aucune vente pour ces filtres.';
    return;
  }
  const max = Math.max(...values),
    step = Math.ceil(max / 10) || 1,
    counts = Array(10).fill(0);
  values.forEach(v => counts[Math.min(9, Math.floor(v / step))]++);
  const largest = Math.max(...counts);
  $('market-hist').setAttribute(
    'aria-label',
    `Histogramme de ${values.length} ventes, ${key === 'm2' ? 'prix au mètre carré' : key === 'price' ? 'prix total' : 'surface'}.`,
  );
  $('market-hist').innerHTML = counts
    .map(
      (n, i) =>
        `<div class="hist-bin" title="${num(i * step)} à ${num((i + 1) * step)} : ${n} ventes"><span>${n || ''}</span><div class="bar" style="height:${(n / largest) * 140}px"></div><span>${i * step >= 1000 ? num((i * step) / 1000) + 'k' : num(i * step)}</span></div>`,
    )
    .join('');
}
function renderTable() {
  const rows = [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
    pages = Math.max(1, Math.ceil(rows.length / 15));
  page = Math.min(page, pages - 1);
  $('sales-table').innerHTML =
    rows
      .slice(page * 15, page * 15 + 15)
      .map(
        r =>
          `<tr><td>${esc(r.date)}</td><td>${esc(r.town)}</td><td>${num(r.surface)} m²</td><td>${money(r.price)}</td><td>${money(r.price / r.surface)}</td><td>${esc(r.dpe || '—')}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6">Aucune vente ne correspond aux filtres.</td></tr>';
  $('page-sales').textContent = `Page ${page + 1} / ${pages}`;
  $('table-count').textContent = `${filtered.length} ventes`;
  $('prev-sales').disabled = page === 0;
  $('next-sales').disabled = page === pages - 1;
}
for (const id of [
  'market-town',
  'min-area',
  'max-area',
  'min-price',
  'max-price',
  'from-date',
  'to-date',
  'market-dpe',
  'map-color',
  'visible-only',
])
  $(id).addEventListener('change', renderMarket);
$('hist-measure').addEventListener('change', drawHistogram);
$('prev-sales').onclick = () => {
  page--;
  renderTable();
};
$('next-sales').onclick = () => {
  page++;
  renderTable();
};
$('reset-market').onclick = () => {
  for (const id of ['market-town', 'min-area', 'max-area', 'min-price', 'max-price', 'market-dpe'])
    $(id).value = '';
  $('from-date').value = '2025-07-01';
  $('to-date').value = '2026-06-30';
  $('visible-only').checked = false;
  map?.setView([45.18, 5.73], 11);
  renderMarket();
};
$('export-market').onclick = () => {
  const rows = [
    ['date', 'commune', 'surface_m2', 'prix_eur', 'prix_m2', 'dpe'],
    ...filtered.map(r => [
      r.date,
      r.town,
      r.surface,
      r.price,
      Math.round(r.price / r.surface),
      r.dpe,
    ]),
  ];
  const csv =
    '\ufeff' +
    rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
    a = document.createElement('a');
  a.href = url;
  a.download = 'valometra-ventes-selection.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
readJson('metadata.json')
  .then(data => {
    metadata = data;
    fetch('/api/session')
      .then(response => response.json())
      .then(session => {
        if (session.admin) $('admin-link').hidden = false;
      })
      .catch(() => {});
    window.ValometraAddress.init(data.towns);
    const options = data.towns
      .map(town => `<option value="${town.code}">${esc(town.name)}</option>`)
      .join('');
    $('market-town').insertAdjacentHTML('beforeend', options);
    $('estimate-button').disabled = false;
    $('model-status').textContent = 'Le moteur se charge lors de la première estimation.';
    performance.mark('valometra-form-ready');
    performance.measure('valometra-formulaire', { start: 0, end: 'valometra-form-ready' });
  })
  .catch(() => {
    $('model-status').textContent = 'Les communes n’ont pas pu être chargées. Rechargez la page.';
  });
