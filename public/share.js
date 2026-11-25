// Lien partageable : les caractéristiques du bien dans l'URL, sans estimation enregistrée.
import { $ } from './dom.js';
import * as F from './format.js';
import { state } from './store.js';

// Valeurs du formulaire à reporter dans le lien et dans l'historique.
export function shareValues() {
  return {
    adresse: state.lastInputs.address,
    surface: $('surface').value,
    pieces: $('rooms').value,
    definition: state.lastInputs.surfaceDefinition,
    carrez: $('carrez').value,
    dependances: $('dependencies').value,
    annee: $('year').value,
  };
}

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
    history.replaceState(history.state, '', shareUrl());
  }
  setTimeout(() => {
    button.querySelector('span').textContent = 'Copier le lien de cette estimation';
  }, 2500);
}

export function bindShare() {
  $('share-link').addEventListener('click', copyShareLink);
}
