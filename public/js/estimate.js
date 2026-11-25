// Estimation : orchestre le formulaire, le moteur et l'affichage du résultat.
// Le détail est dans form.js (champs), engine.js (calcul), result.js (rendu), simulator.js,
// feedback.js (retour anonyme) et share.js (lien partageable).
import { $ } from './dom.js';
import * as F from './format.js';
import { state, loadMarket } from './store.js';
import { localHistory } from './history.js';
import { startEngine, predict, resetEngine } from './engine.js';
import { collectInputs, fillForm, applySharedLink, initForm } from './form.js';
import { resultHtml } from './result.js';
import { bindSimulator } from './simulator.js';
import { bindFeedback } from './feedback.js';
import { bindShare, shareValues } from './share.js';
import { addressSearch } from './address.js';

let submission = 0,
  hasResult = false;

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
  const { inputs, error } = collectInputs();
  if (error) {
    $('model-status').textContent = error;
    return;
  }
  state.lastInputs = inputs;
  $('estimate-button').disabled = true;
  $('estimate-button').textContent = 'Calcul en cours…';
  $('model-status').textContent = 'Calcul de votre estimation…';
  performance.mark('valometra-estimate-start');
  const id = ++submission;
  try {
    await Promise.all([startEngine(), loadMarket()]);
    const prediction = await predict(inputs.features);
    if (id !== submission) return;
    $('estimate-button').disabled = false;
    $('estimate-button').textContent = 'Actualiser mon estimation';
    state.lastPrediction = prediction;
    performance.mark('valometra-estimate-ready');
    performance.measure(
      'valometra-estimation',
      'valometra-estimate-start',
      'valometra-estimate-ready',
    );
    showResult(prediction.value, inputs, prediction.intervals);
    $('result').querySelector('h2')?.focus({ preventScroll: true });
    recordHistory(prediction);
  } catch (error) {
    if (id === submission) engineFailure(error.message);
  }
});
$('estimate-form').addEventListener('input', () => {
  if (hasResult)
    $('model-status').textContent =
      'Les caractéristiques ont changé. Actualisez l’estimation pour recalculer le résultat.';
});

function showResult(value, input, intervals) {
  hasResult = true;
  const band = '80',
    bounds = intervals?.[band];
  if (!bounds || !bounds.every(Number.isFinite)) {
    $('model-status').textContent =
      'Les bornes n’ont pas pu être calculées. Relancez l’estimation.';
    return;
  }
  $('result').innerHTML = resultHtml(value, input, intervals, state.market);
  bindSimulator();
  bindFeedback();
  bindShare();
  $('print-result').addEventListener('click', () => window.print());
  window.dispatchEvent(
    new CustomEvent('valometra:estimated', {
      detail: {
        address: input.address,
        surface: input.surface,
        rooms: Number(input.features.nb_pieces),
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

function recordHistory(prediction) {
  const bounds = prediction.intervals?.['80'];
  if (!bounds?.every(Number.isFinite)) return;
  localHistory.record({
    query: F.shareQuery(shareValues()),
    town: state.lastInputs.town.name,
    surface: state.lastInputs.surface,
    rooms: Number(state.lastInputs.features.nb_pieces),
    point: prediction.value,
    low: bounds[0],
    high: bounds[1],
  });
}

window.addEventListener('valometra:reopen', event => {
  fillForm(event.detail);
  $('model-status').textContent =
    'Estimation rouverte depuis votre historique. Lancez l’estimation pour la recalculer.';
});

window.addEventListener('valometra:estimated', () => {
  $('result').scrollIntoView({ block: 'start' });
});

initForm();

// Appelé une fois les communes connues : liste des communes pour l'adresse et lien partagé.
export function initEstimate(towns) {
  addressSearch.init(towns);
  applySharedLink();
}
