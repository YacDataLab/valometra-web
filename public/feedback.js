// Retour anonyme sur la justesse d'une estimation (voir POST /api/feedback).
import { $ } from './dom.js';
import { state } from './store.js';

// Estimation pour laquelle un retour a déjà été envoyé : un seul retour par résultat.
let feedbackSentFor = null;

export function feedbackHtml() {
  if (feedbackSentFor === state.lastPrediction)
    return '<p class="feedback-done" role="status">Merci, votre retour est enregistré.</p>';
  return (
    '<section class="feedback" id="feedback"><h3>Cette estimation vous semble-t-elle juste ?</h3>' +
    '<label>Prix réel, si vous le connaissez (€)<input id="feedback-actual" type="number" min="10000" max="5000000" step="1000" placeholder="Facultatif"></label>' +
    '<div class="feedback-choices"><button type="button" class="secondary" data-verdict="trop_bas">Trop basse</button><button type="button" class="secondary" data-verdict="juste">Juste</button><button type="button" class="secondary" data-verdict="trop_haut">Trop haute</button></div>' +
    '<p class="hint">Retour anonyme : ni adresse ni coordonnées, seulement la commune, la surface, les pièces et le prix estimé.</p><p id="feedback-status" role="status"></p></section>'
  );
}

export function bindFeedback() {
  $('feedback')?.addEventListener('click', sendFeedback);
}

async function sendFeedback(event) {
  const verdict = event.target.dataset?.verdict;
  if (!verdict || !state.lastInputs || !state.lastPrediction) return;
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
        town_code: state.lastInputs.town.code,
        surface: state.lastInputs.surface,
        rooms: Number(state.lastInputs.features.nb_pieces),
        estimate: state.lastPrediction.value,
        actual: actual === '' ? null : Number(actual),
      }),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    feedbackSentFor = state.lastPrediction;
    $('feedback').outerHTML =
      '<p class="feedback-done" role="status">Merci, votre retour est enregistré.</p>';
  } catch (error) {
    buttons.forEach(b => (b.disabled = false));
    $('feedback-status').textContent =
      error.message || 'Le retour est indisponible pour le moment.';
  }
}
