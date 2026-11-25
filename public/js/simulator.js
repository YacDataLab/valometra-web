// Simulateur « et si ? » : relance le moteur avec une variante du bien et affiche l'écart.
import { $ } from './dom.js';
import * as F from './format.js';
import { state } from './store.js';
import { combobox } from './ui.js';
import { predict } from './engine.js';

const { esc, roundMoney } = F;
const FAILURE = 'La simulation a échoué. Réessayez.';
let simulation = 0;

export function simulatorHtml(input) {
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

// À appeler une fois le résultat affiché (le simulateur en fait partie).
export function bindSimulator() {
  combobox($('sim-dpe'), { filterable: false });
  $('simulate').addEventListener('click', runScenario);
}

async function runScenario() {
  if (!state.lastInputs || !state.lastPrediction) return;
  const features = F.scenarioFeatures(state.lastInputs.features, {
    surface: $('sim-surface').value,
    rooms: $('sim-rooms').value,
    dependencies: $('sim-dependencies').value,
    dpe: $('sim-dpe').value,
  });
  const id = ++simulation;
  $('simulate').disabled = true;
  $('simulation').textContent = 'Calcul de la variante…';
  try {
    const data = await predict(features);
    if (id === simulation) showScenario(data);
  } catch {
    if (id !== simulation) return;
    $('simulate').disabled = false;
    $('simulation').textContent = FAILURE;
  }
}

function showScenario(data) {
  $('simulate').disabled = false;
  const base = state.lastPrediction.value,
    gap = F.variation(base, data.value),
    bounds = data.intervals?.['80'];
  if (!gap) {
    $('simulation').textContent = FAILURE;
    return;
  }
  const sign = gap.euros > 0 ? '+' : gap.euros < 0 ? '−' : '',
    percent = F.dec(Math.abs(gap.percent));
  $('simulation').innerHTML =
    `<dl class="simulation-result"><div><dt>Estimation de base</dt><dd>${roundMoney(base)}</dd></div>` +
    `<div><dt>Variante</dt><dd>${roundMoney(data.value)}${bounds?.every(Number.isFinite) ? `<small>de ${roundMoney(bounds[0])} à ${roundMoney(bounds[1])} (80 %)</small>` : ''}</dd></div>` +
    `<div><dt>Écart</dt><dd>${sign}${roundMoney(Math.abs(gap.euros))}<small>${sign}${percent}\u202f%</small></dd></div></dl>`;
}
