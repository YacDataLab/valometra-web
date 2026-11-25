// Estimation : formulaire, moteur de calcul (Worker), résultat, simulateur, retour anonyme, partage.
import { $, state, loadMarket } from './store.js';
import { segmented } from './ui.js';

const F = window.ValometraFormat;
const { esc, money, roundMoney, num, median } = F;
// Pictogramme du sprite SVG icons.svg (jeu Tabler, licence MIT).
const icon = name =>
  `<svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-${name}"/></svg>`;

let worker,
  enginePromise,
  lastInputs = null,
  requestId = 0,
  simId = null,
  simCount = 0,
  feedbackSentFor = null,
  hasResult = false,
  lastPrediction = null;

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
  if (!state.metadata || $('estimate-button').disabled) return;
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
  const town = state.metadata.towns.find(t => t.code === address.code);
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

const bandLabel = band => (band === '50' ? 'centrale' : 'étendue');

const precisionHtml = precision =>
  precision
    ? `<span class="level"><span class="bars" data-level="${precision.bars}" role="img" aria-label="Précision de la fourchette : ${precision.label}, ${precision.bars} sur 3">${[1, 2, 3].map(i => `<i${i <= precision.bars ? ' class="on"' : ''}></i>`).join('')}</span>${precision.label}</span>`
    : '—';

const priceBlock = (value, input) =>
  `<div class="result-top"><div class="section-head"><div><span class="eyebrow">Votre estimation</span><h2 tabindex="-1">${esc(input.town.name)} · ${num(input.surface)} m²</h2></div></div><p class="hint">${esc(input.address)}</p><div class="price">${roundMoney(value)}</div><span class="price-unit">Estimation indicative · référence au ${ValometraConfig.referenceLabel}</span></div>`;

const rangeBlock = (value, intervals, band) => {
  const [low, high] = intervals[band],
    gauge = F.gauge(value, intervals['50'], intervals['80']),
    label = `Estimation ${roundMoney(value)}, fourchette centrale de ${roundMoney(intervals['50'][0])} à ${roundMoney(intervals['50'][1])}, fourchette étendue de ${roundMoney(intervals['80'][0])} à ${roundMoney(intervals['80'][1])}`,
    bar = gauge
      ? `<div class="gauge" role="img" aria-label="${label}"><span class="gauge-central" style="left:${gauge.low}%;width:${gauge.high - gauge.low}%"></span><span class="gauge-point" style="left:${gauge.point}%"></span></div><ul class="gauge-legend" aria-hidden="true"><li><i class="point"></i>Estimation</li><li><i class="central"></i>Centrale 50 %</li><li><i class="extended"></i>Étendue 80 %</li></ul>`
      : '<div class="range-bar"></div>',
    coverage =
      band === '50'
        ? 'Cette fourchette plus étroite couvre environ une vente sur deux dans l’évaluation historique.'
        : `La couverture mesurée sur les ventes de juin 2026 est de ${ValometraConfig.coverage[80]} %.`;
  return `<div class="range-box"><h3>Fourchette ${bandLabel(band)} · objectif ${band} %</h3>${bar}<div class="range-values"><span>${roundMoney(low)}</span><span>${roundMoney(high)}</span></div><p class="hint">Bornes personnalisées à partir des caractéristiques du bien. ${coverage}</p></div>`;
};

const figure = (name, title, value, note) =>
  `<div><dt>${icon(name)}${title}</dt><dd>${value}<small>${note}</small></dd></div>`;

const keyFigures = (value, input, comps, intervals) => {
  const perM2 = value / input.surface,
    local = median(comps.map(r => r.price / r.surface));
  return `<dl class="key-figures">${
    figure(
      'ruler-2',
      'Prix au m²',
      money(Math.round(perM2)),
      local
        ? `médiane locale ${money(local)} / m²<br>${gapText(perM2, local)}`
        : 'sans repère local',
    ) +
    figure(
      'building-community',
      'Comparables',
      comps.length,
      'ventes de la commune, surfaces à ±25 %',
    ) +
    figure(
      'chart-arrows-vertical',
      'Précision',
      precisionHtml(F.precision(value, intervals['80'])),
      'largeur de la fourchette',
    )
  }</dl>`;
};

const contextBlock = input => {
  const { features, enrichment } = input,
    located = features.latitude
      ? `Adresse localisée · bâtiment ${enrichment?.building ? 'retrouvé' : 'renseigné manuellement ou absent'} · DPE ${enrichment?.dpe ? 'confirmé depuis l’ADEME' : 'saisi manuellement ou absent'}.`
      : 'Coordonnées non renseignées';
  return `<dl class="context"><dt>Localisation</dt><dd>${located}</dd></dl><p class="hint">Une expertise sur place reste utile pour l’état, l’étage, la vue et les travaux. Aucun ajustement de marché après ${ValometraConfig.referenceLabel.slice(3)}.</p>`;
};

const actionsBlock = () =>
  `<div class="result-actions"><a class="secondary" href="#method">Comprendre ces repères</a><button type="button" class="secondary" id="share-link">${icon('link')}<span>Copier le lien de cette estimation</span></button><button type="button" class="secondary" id="print-result">${icon('printer')}Imprimer</button></div>`;

const printNote = () =>
  `<p class="print-only">Document généré le ${F.frDate(new Date().toISOString())} par Valometra (open source, licence AGPL-3.0). Estimation indicative, référence au ${ValometraConfig.referenceLabel} : elle ne remplace pas une expertise.</p>`;

function showResult(value, input, intervals) {
  hasResult = true;
  const band = $('interval-coverage').value || '80',
    bounds = intervals?.[band];
  if (!bounds || !bounds.every(Number.isFinite)) {
    $('model-status').textContent =
      'Les bornes n’ont pas pu être calculées. Relancez l’estimation.';
    return;
  }
  const { town, surface, features } = input,
    comps = state.market.filter(
      r => r.code === town.code && r.surface >= surface * 0.75 && r.surface <= surface * 1.25,
    ),
    nearest = F.nearestComparables(state.market, {
      code: town.code,
      surface,
      lat: Number(features.latitude),
      lon: Number(features.longitude),
    });
  $('result').innerHTML =
    priceBlock(value, input) +
    rangeBlock(value, intervals, band) +
    keyFigures(value, input, comps, intervals) +
    contextBlock(input) +
    simulatorHtml(input) +
    comparablesTable(nearest) +
    actionsBlock() +
    feedbackHtml() +
    printNote();
  $('print-result').addEventListener('click', () => window.print());
  $('feedback')?.addEventListener('click', sendFeedback);
  $('share-link').addEventListener('click', copyShareLink);
  $('simulate').addEventListener('click', runScenario);
  window.dispatchEvent(
    new CustomEvent('valometra:estimated', {
      detail: {
        address: input.address,
        surface,
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
  if (!state.metadata) return;
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
  const features = F.scenarioFeatures(lastInputs.features, {
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
    gap = F.variation(base, data.value),
    bounds = data.intervals?.['80'];
  if (!gap) {
    $('simulation').textContent = 'La simulation a échoué. Réessayez.';
    return;
  }
  const sign = gap.euros > 0 ? '+' : gap.euros < 0 ? '−' : '',
    percent = F.dec(Math.abs(gap.percent));
  $('simulation').innerHTML =
    `<dl class="simulation-result"><div><dt>Estimation de base</dt><dd>${roundMoney(base)}</dd></div>` +
    `<div><dt>Variante</dt><dd>${roundMoney(data.value)}${bounds?.every(Number.isFinite) ? `<small>de ${roundMoney(bounds[0])} à ${roundMoney(bounds[1])} (80 %)</small>` : ''}</dd></div>` +
    `<div><dt>Écart</dt><dd>${sign}${roundMoney(Math.abs(gap.euros))}<small>${sign}${percent}\u202f%</small></dd></div></dl>`;
}

function gapText(pricePerM2, median) {
  const gap = F.gapToMedian(pricePerM2, median);
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
    query: F.shareQuery(shareValues()),
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
  url.search = F.shareQuery(shareValues());
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
  const shared = F.parseShare(location.search);
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

segmented($('interval-coverage'));

window.addEventListener('valometra:estimated', () => {
  $('result').scrollIntoView({ block: 'start' });
});

// Appelé une fois les communes connues : liste des communes pour l'adresse et lien partagé.
export function initEstimate(towns) {
  window.ValometraAddress.init(towns);
  applySharedLink();
}
