'use strict';
// Pictogramme du sprite SVG de index.html (jeu Tabler, licence MIT).
const icon = name =>
    `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`,
  $ = id => document.getElementById(id),
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
  simId = null,
  simCount = 0,
  feedbackSentFor = null,
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

const PAGE_TITLES = {
  estimate: 'Valometra — L’immobilier, en perspective',
  market: 'Le marché local — Valometra',
  method: 'Méthode et limites — Valometra',
};

async function route() {
  const view = ++marketView;
  const hash = location.hash.slice(1);
  const id = ['estimate', 'market', 'method'].includes(hash) ? hash : 'estimate';
  document.querySelectorAll('.page').forEach(element => {
    element.hidden = element.id !== id;
  });
  document.title = PAGE_TITLES[id];
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
        $('result').querySelector('h2')?.focus({ preventScroll: true });
        recordHistory(data);
      }
      if (data.type === 'prediction' && data.id === simId) showScenario(data);
      if (data.type === 'error') {
        if (data.id === undefined) reject(new Error(data.message));
        else if (data.id === requestId) engineFailure(data.message);
        else if (data.id === simId) {
          $('simulate').disabled = false;
          $('simulation').textContent = 'La simulation a échoué. Réessayez.';
        }
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
  if (
    $('dpe').value &&
    (!$('dpe-date').value || $('dpe-date').value > ValometraConfig.referenceDate)
  ) {
    $('model-status').textContent =
      `Indiquez la date du DPE, au plus tard le ${ValometraConfig.referenceLabel}, ou laissez le DPE non renseigné.`;
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
    jours_depuis_2025: ValometraConfig.daysSince2025,
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
  const m = median(comps.map(r => r.price / r.surface)),
    nearest = window.ValometraFormat.nearestComparables(market, {
      code: town.code,
      surface,
      lat: Number(features.latitude),
      lon: Number(features.longitude),
    }),
    g = window.ValometraFormat.gauge(value, intervals['50'], intervals['80']);
  const round = n => money(Math.round(n / 1000) * 1000),
    fiability = window.ValometraFormat.precision(value, intervals['80']),
    bars = fiability
      ? `<span class="level"><span class="bars" data-level="${fiability.bars}" role="img" aria-label="Précision de la fourchette : ${fiability.label}, ${fiability.bars} sur 3">${[1, 2, 3].map(i => `<i${i <= fiability.bars ? ' class="on"' : ''}></i>`).join('')}</span>${fiability.label}</span>`
      : '—';
  $('result').innerHTML =
    `<div class="result-top"><div class="section-head"><div><span class="eyebrow">VOTRE ESTIMATION</span><h2 tabindex="-1">${esc(town.name)} · ${num(surface)} m²</h2></div></div><p class="hint">${esc(input.address)}</p><div class="price">${round(value)}</div><span class="price-unit">Estimation indicative · référence au ${ValometraConfig.referenceLabel}</span></div>` +
    `<div class="range-box"><h3>Fourchette ${band === '50' ? 'centrale' : 'étendue'} · objectif ${band} %</h3>${
      g
        ? `<div class="gauge" role="img" aria-label="Estimation ${round(value)}, fourchette centrale de ${round(intervals['50'][0])} à ${round(intervals['50'][1])}, fourchette étendue de ${round(intervals['80'][0])} à ${round(intervals['80'][1])}"><span class="gauge-central" style="left:${g.low}%;width:${g.high - g.low}%"></span><span class="gauge-point" style="left:${g.point}%"></span></div><ul class="gauge-legend" aria-hidden="true"><li><i class="point"></i>Estimation</li><li><i class="central"></i>Centrale 50 %</li><li><i class="extended"></i>Étendue 80 %</li></ul>`
        : '<div class="range-bar"></div>'
    }<div class="range-values"><span>${round(bounds[0])}</span><span>${round(bounds[1])}</span></div><p class="hint">Bornes personnalisées à partir des caractéristiques du bien. ${band === '50' ? 'Cette fourchette plus étroite couvre environ une vente sur deux dans l’évaluation historique.' : `La couverture mesurée sur les ventes de juin 2026 est de ${ValometraConfig.coverage[80]} %.`}</p></div>` +
    `<dl class="key-figures"><div><dt>${icon('ruler-2')}Prix au m²</dt><dd>${money(Math.round(value / surface))}<small>${m ? `médiane locale ${money(m)}\u202f/\u202fm²<br>${gapText(value / surface, m)}` : 'sans repère local'}</small></dd></div><div><dt>${icon('building-community')}Comparables</dt><dd>${comps.length}<small>ventes de la commune, surfaces à ±25 %</small></dd></div><div><dt>${icon('chart-arrows-vertical')}Précision</dt><dd>${bars}<small>largeur de la fourchette</small></dd></div></dl>` +
    `<dl class="context"><dt>Localisation</dt><dd>${features.latitude ? `Adresse localisée · bâtiment ${input.enrichment?.building ? 'retrouvé' : 'renseigné manuellement ou absent'} · DPE ${input.enrichment?.dpe ? 'confirmé depuis l’ADEME' : 'saisi manuellement ou absent'}.` : 'Coordonnées non renseignées'}</dd></dl><p class="hint">Une expertise sur place reste utile pour l’état, l’étage, la vue et les travaux. Aucun ajustement de marché après ${ValometraConfig.referenceLabel.slice(3)}.</p>${simulatorHtml(input)}${comparablesTable(nearest)}<div class="result-actions"><a class="secondary" href="#method">Comprendre ces repères</a><button type="button" class="secondary" id="share-link">${icon('link')}<span>Copier le lien de cette estimation</span></button><button type="button" class="secondary" id="print-result">${icon('printer')}Imprimer</button></div>${feedbackHtml()}<p class="print-only">Document généré le ${window.ValometraFormat.frDate(new Date().toISOString())} par Valometra (open source, licence AGPL-3.0). Estimation indicative, référence au ${ValometraConfig.referenceLabel} : elle ne remplace pas une expertise.</p>`;
  $('print-result').addEventListener('click', () => window.print());
  $('feedback')?.addEventListener('click', sendFeedback);
  $('share-link').addEventListener('click', copyShareLink);
  $('simulate').addEventListener('click', runScenario);
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
const EXAMPLE = {
  adresse: '10 rue Lesdiguières 38000 Grenoble',
  surface: 65,
  pieces: 3,
  definition: 'habitable',
};
$('fill-example').addEventListener('click', () => {
  if (!metadata) return;
  fillForm(EXAMPLE, true);
  $('model-status').textContent =
    'Exemple chargé : un appartement de 65 m² à Grenoble. Modifiez-le ou lancez l’estimation.';
});

function simulatorHtml(input) {
  const f = input.features,
    dpe = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  return (
    `<details class="simulator"><summary>Et si… ? Simuler une variante</summary>` +
    `<p class="hint">Modifiez une caractéristique pour voir comment le modèle réagit. L’écart est statistique : ce n’est ni le coût ni la valeur réelle de travaux.</p>` +
    `<div class="two"><label>Surface (m²)<input id="sim-surface" type="number" min="9" max="500" step="0.1" value="${esc(input.surface)}"></label>` +
    `<label>Pièces<input id="sim-rooms" type="number" min="1" max="15" value="${esc(f.nb_pieces)}"></label>` +
    `<label>Dépendances (cave, garage…)<input id="sim-dependencies" type="number" min="0" max="20" value="${esc(f.nb_dependances || 0)}"></label>` +
    `<label>Étiquette DPE<select id="sim-dpe"><option value="">${f.dpe_etiquette_energie ? 'Inchangée' : 'Sans DPE'}</option>${dpe.map(l => `<option>${l}</option>`).join('')}</select></label></div>` +
    `<button type="button" class="secondary" id="simulate">Comparer avec la variante</button><div id="simulation" role="status" aria-live="polite"></div></details>`
  );
}

function runScenario() {
  if (!lastInputs || !lastPrediction || !worker) return;
  const features = window.ValometraFormat.scenarioFeatures(lastInputs.features, {
    surface: $('sim-surface').value,
    rooms: $('sim-rooms').value,
    dependencies: $('sim-dependencies').value,
    dpe: $('sim-dpe').value,
  });
  simId = 'sim-' + ++simCount;
  $('simulate').disabled = true;
  $('simulation').textContent = 'Calcul de la variante…';
  worker.postMessage({ type: 'predict', features, id: simId });
}

function showScenario(data) {
  $('simulate').disabled = false;
  const base = lastPrediction.value,
    gap = window.ValometraFormat.variation(base, data.value),
    bounds = data.intervals?.['80'];
  if (!gap) {
    $('simulation').textContent = 'La simulation a échoué. Réessayez.';
    return;
  }
  const sign = gap.euros > 0 ? '+' : gap.euros < 0 ? '−' : '',
    round = n => money(Math.round(n / 1000) * 1000),
    percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
      Math.abs(gap.percent),
    );
  $('simulation').innerHTML =
    `<dl class="simulation-result"><div><dt>Estimation de base</dt><dd>${round(base)}</dd></div>` +
    `<div><dt>Variante</dt><dd>${round(data.value)}${bounds?.every(Number.isFinite) ? `<small>de ${round(bounds[0])} à ${round(bounds[1])} (80 %)</small>` : ''}</dd></div>` +
    `<div><dt>Écart</dt><dd>${sign}${round(Math.abs(gap.euros))}<small>${sign}${percent}\u202f%</small></dd></div></dl>`;
}

function gapText(pricePerM2, median) {
  const gap = window.ValometraFormat.gapToMedian(pricePerM2, median);
  if (gap === null) return '';
  const rounded = Math.round(gap);
  if (rounded === 0) return 'au niveau de la médiane';
  return `${Math.abs(rounded)}\u202f% ${rounded > 0 ? 'au-dessus' : 'en dessous'}`;
}

function comparablesTable(rows) {
  if (!rows.length) return '';
  const { frDate, frDistance } = window.ValometraFormat;
  return (
    `<div class="comparables"><h3>Ventes comparables les plus proches</h3><div class="table-wrap"><table><thead><tr><th>Distance</th><th>Date</th><th>Surface</th><th>Prix</th></tr></thead><tbody>` +
    rows
      .map(
        r =>
          `<tr><td>${frDistance(r.meters)}</td><td>${frDate(r.date)}</td><td>${num(r.surface)}\u202fm²</td><td>${money(r.price)}<small>${money(Math.round(r.price / r.surface))}\u202f/\u202fm²</small></td></tr>`,
      )
      .join('') +
    `</tbody></table></div><p class="hint">Ventes réelles de la commune, surfaces à ±25 %, classées par distance. La position est celle de la parcelle, pas du logement.</p></div>`
  );
}

function feedbackHtml() {
  if (feedbackSentFor === lastPrediction)
    return '<p class="feedback-done" role="status">Merci, votre retour est enregistré.</p>';
  return (
    '<section class="feedback" id="feedback"><h3>Cette estimation vous semble-t-elle juste ?</h3>' +
    '<label>Prix réel, si vous le connaissez (€)<input id="feedback-actual" type="number" min="10000" max="5000000" step="1000" placeholder="Facultatif"></label>' +
    '<div class="feedback-choices"><button type="button" class="secondary" data-verdict="trop_bas">Trop basse</button><button type="button" class="secondary" data-verdict="juste">Juste</button><button type="button" class="secondary" data-verdict="trop_haut">Trop haute</button></div>' +
    '<p class="hint">Retour anonyme : ni adresse ni coordonnées, seulement la commune, la surface, les pièces et le prix estimé.</p><p id="feedback-status" role="status"></p></section>'
  );
}

async function sendFeedback(event) {
  const verdict = event.target.dataset?.verdict;
  if (!verdict || !lastInputs || !lastPrediction) return;
  const actual = $('feedback-actual').value;
  const buttons = [...document.querySelectorAll('#feedback [data-verdict]')];
  buttons.forEach(b => (b.disabled = true));
  $('feedback-status').textContent = 'Envoi…';
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict,
        town_code: lastInputs.town.code,
        surface: lastInputs.surface,
        rooms: Number(lastInputs.features.nb_pieces),
        estimate: lastPrediction.value,
        actual: actual === '' ? null : Number(actual),
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    feedbackSentFor = lastPrediction;
    $('feedback').outerHTML =
      '<p class="feedback-done" role="status">Merci, votre retour est enregistré.</p>';
  } catch (error) {
    buttons.forEach(b => (b.disabled = false));
    $('feedback-status').textContent =
      error.message || 'Le retour est indisponible pour le moment.';
  }
}

function shareValues() {
  return {
    adresse: lastInputs.address,
    surface: $('surface').value,
    pieces: $('rooms').value,
    definition: lastInputs.surfaceDefinition,
    carrez: $('carrez').value,
    dependances: $('dependencies').value,
    annee: $('year').value,
  };
}

function recordHistory(data) {
  const bounds = data.intervals?.['80'];
  if (!bounds?.every(Number.isFinite)) return;
  window.ValometraHistory?.record({
    query: window.ValometraFormat.shareQuery(shareValues()),
    town: lastInputs.town.name,
    surface: lastInputs.surface,
    rooms: Number(lastInputs.features.nb_pieces),
    point: data.value,
    low: bounds[0],
    high: bounds[1],
  });
}

window.addEventListener('valometra:reopen', event => {
  fillForm(event.detail);
  $('model-status').textContent =
    'Estimation rouverte depuis votre historique. Lancez l’estimation pour la recalculer.';
});

function shareUrl() {
  const url = new URL(location.href);
  url.search = window.ValometraFormat.shareQuery(shareValues());
  url.hash = '#estimate';
  return url.href;
}

async function copyShareLink() {
  const button = $('share-link');
  try {
    await navigator.clipboard.writeText(shareUrl());
    button.querySelector('span').textContent = 'Lien copié';
  } catch {
    button.querySelector('span').textContent = 'Copie impossible : copiez l’adresse du navigateur';
    history.replaceState(null, '', shareUrl());
  }
  setTimeout(() => {
    button.querySelector('span').textContent = 'Copier le lien de cette estimation';
  }, 2500);
}

// Préremplit le formulaire depuis un lien partagé ; l'estimation reste à lancer.
function applySharedLink() {
  const shared = window.ValometraFormat.parseShare(location.search);
  if (shared) fillForm(shared);
}

function fillForm(shared, firstSuggestion = false) {
  $('surface').value = shared.surface;
  $('rooms').value = shared.pieces;
  if (shared.definition) $('surface-definition').value = shared.definition;
  if (shared.carrez) $('carrez').value = shared.carrez;
  if (shared.dependances !== undefined) $('dependencies').value = shared.dependances;
  if (shared.annee) $('year').value = shared.annee;
  window.ValometraAddress.restore(shared.adresse, firstSuggestion);
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
function getBase(ignoreTown = false) {
  const town = ignoreTown ? '' : $('market-town').value,
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
const MARKET_FIELDS = {
  commune: 'market-town',
  smin: 'min-area',
  smax: 'max-area',
  pmin: 'min-price',
  pmax: 'max-price',
  du: 'from-date',
  au: 'to-date',
  dpe: 'market-dpe',
  couleur: 'map-color',
};
// Reflète les filtres dans l'URL pour pouvoir partager une vue du marché.
function syncMarketUrl() {
  const url = new URL(location.href),
    values = {};
  for (const [key, id] of Object.entries(MARKET_FIELDS)) {
    values[key] = $(id).value;
    url.searchParams.delete(key);
  }
  for (const [key, value] of window.ValometraFormat.marketQuery(values)) {
    if (!(key === 'couleur' && value === 'm2')) url.searchParams.set(key, value);
  }
  history.replaceState(null, '', url);
}
function applyMarketLink() {
  const shared = window.ValometraFormat.parseMarket(location.search);
  for (const [key, value] of Object.entries(shared)) {
    const field = $(MARKET_FIELDS[key]);
    // Une commune absente de la liste ou une valeur inconnue laisse le filtre vide.
    field.value = value;
    if (field.value !== String(value)) field.value = '';
  }
}

function renderMarket() {
  if (!metadata) return;
  syncMarketUrl();
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
                `<div class="popup-sale">${esc(window.ValometraFormat.frDate(r.date))} · ${num(r.surface)} m² · ${num(r.rooms)} pièces<br><b>${money(r.price)}</b> · ${money(r.price / r.surface)}/m² · DPE ${esc(r.dpe || 'absent')}</div>`,
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
  drawTrend();
  renderRanking();
  page = 0;
  renderTable();
}
function drawTrend() {
  const { monthlyMedian, frMonth } = window.ValometraFormat,
    series = monthlyMedian(filtered),
    points = series.filter(m => m.reliable),
    box = $('market-trend');
  $('trend-note').textContent =
    'Chaque point est la médiane d’un mois, affichée à partir de 10 ventes. Sur un an seulement, ce n’est pas une tendance : les variations restent à lire avec prudence.';
  if (points.length < 2) {
    box.textContent = 'Pas assez de ventes par mois pour tracer une courbe avec ces filtres.';
    return;
  }
  const W = 600,
    H = 220,
    pad = { l: 64, r: 16, t: 16, b: 34 },
    months = series.map(m => m.month),
    values = points.map(m => m.median),
    lo = Math.min(...values) * 0.95,
    hi = Math.max(...values) * 1.05,
    x = m => pad.l + (months.indexOf(m) / Math.max(1, months.length - 1)) * (W - pad.l - pad.r),
    y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b),
    line = points.map(m => `${x(m.month).toFixed(1)},${y(m.median).toFixed(1)}`).join(' '),
    ticks = [lo, (lo + hi) / 2, hi];
  box.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prix médian au m² par mois : de ${money(points[0].median)} en ${frMonth(points[0].month)} à ${money(points.at(-1).median)} en ${frMonth(points.at(-1).month)}.">` +
    ticks
      .map(
        v =>
          `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${num(v)}</text>`,
      )
      .join('') +
    `<polyline class="trend-line" points="${line}"/>` +
    points
      .map(
        m =>
          `<circle class="trend-dot" cx="${x(m.month).toFixed(1)}" cy="${y(m.median).toFixed(1)}" r="4"><title>${frMonth(m.month)} : ${money(m.median)}/m², ${m.count} ventes</title></circle>`,
      )
      .join('') +
    [months[0], months.at(-1)]
      .map(
        (m, i) =>
          `<text class="axis" x="${x(m).toFixed(1)}" y="${H - 10}" text-anchor="${i ? 'end' : 'start'}">${frMonth(m)}</text>`,
      )
      .join('') +
    `</svg>`;
}

function renderRanking() {
  const selected = $('market-town').value;
  $('town-ranking').innerHTML = window.ValometraFormat.communeRanking(getBase(true))
    .map(
      t =>
        `<tr${t.code === selected ? ' class="selected"' : ''}><td><button type="button" class="link" data-code="${esc(t.code)}">${esc(t.town)}</button></td><td>${num(t.count)}${t.reliable ? '' : '<small>échantillon faible</small>'}</td><td>${money(t.median)}</td></tr>`,
    )
    .join('');
}
$('town-ranking').addEventListener('click', event => {
  const button = event.target.closest('button[data-code]');
  if (!button) return;
  $('market-town').value = button.dataset.code;
  renderMarket();
  $('market-stats').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
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
          `<tr><td>${esc(window.ValometraFormat.frDate(r.date))}</td><td>${esc(r.town)}</td><td>${num(r.surface)} m²</td><td>${money(r.price)}</td><td>${money(r.price / r.surface)}</td><td>${esc(r.dpe || '—')}</td></tr>`,
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
  $('from-date').value = ValometraConfig.marketStart;
  $('to-date').value = ValometraConfig.referenceDate;
  $('map-color').value = 'm2';
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
    applySharedLink();
    const options = data.towns
      .map(town => `<option value="${town.code}">${esc(town.name)}</option>`)
      .join('');
    $('market-town').insertAdjacentHTML('beforeend', options);
    applyMarketLink();
    if (!$('market').hidden && market.length) renderMarket();
    $('estimate-button').disabled = false;
    $('model-status').textContent = 'Le moteur se charge lors de la première estimation.';
    performance.mark('valometra-form-ready');
    performance.measure('valometra-formulaire', { start: 0, end: 'valometra-form-ready' });
  })
  .catch(() => {
    $('model-status').textContent = 'Les communes n’ont pas pu être chargées. Rechargez la page.';
  });

// Utilisation hors connexion : le service worker est facultatif, son échec n'est pas bloquant.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
