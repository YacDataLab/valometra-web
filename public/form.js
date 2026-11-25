// Formulaire d'estimation : lecture et validation des champs, préremplissage.
import { $ } from './dom.js';
import * as F from './format.js';
import { config } from './config.js';
import { state } from './store.js';
import { combobox, syncChoice } from './ui.js';
import { addressData } from './enrichment.js';
import { addressSearch } from './address.js';

// Lit le formulaire : { error } avec un message à afficher, ou { inputs } prêt pour le moteur.
export function collectInputs() {
  const address = addressSearch.getSelected();
  if (!address) return { error: 'Sélectionnez une adresse complète parmi les suggestions.' };
  if (addressData.isBusy())
    return {
      error: 'La recherche des données de l’adresse est en cours. Patientez quelques instants.',
    };
  const town = state.metadata.towns.find(t => t.code === address.code);
  if (!town)
    return {
      error:
        'Cette commune n’est pas couverte. Choisissez une adresse dans l’une des communes proposées.',
    };
  if ($('dpe').value && (!$('dpe-date').value || $('dpe-date').value > config.referenceDate))
    return {
      error: `Indiquez la date du DPE, au plus tard le ${config.referenceLabel}, ou laissez le DPE non renseigné.`,
    };
  const lat = address.lat,
    lon = address.lon;
  const f = {
    ...addressData.getFeatures(),
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
    jours_depuis_2025: config.daysSince2025,
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
  return {
    inputs: {
      town,
      address: address.label,
      surface: +f.surface_habitable,
      surfaceDefinition: $('surface-definition').value,
      features: f,
      enrichment: addressData.getSummary(),
    },
  };
}

// Préremplit le formulaire depuis un lien partagé ; l'estimation reste à lancer.
export function applySharedLink() {
  const shared = F.parseShare(location.search);
  if (shared) fillForm(shared);
}

export function fillForm(shared, firstSuggestion = false) {
  $('surface').value = shared.surface;
  $('rooms').value = shared.pieces;
  if (shared.definition) {
    $('surface-definition').value = shared.definition;
    syncChoice($('surface-definition'));
  }
  if (shared.carrez) $('carrez').value = shared.carrez;
  if (shared.dependances !== undefined) $('dependencies').value = shared.dependances;
  if (shared.annee) $('year').value = shared.annee;
  addressSearch.restore(shared.adresse, firstSuggestion);
}

// Contrôles de choix du formulaire et règle du DPE ; à appeler une fois au chargement.
export function initForm() {
  // Listes du formulaire : même liste personnalisée que la commune.
  for (const select of document.querySelectorAll('#estimate-form select'))
    combobox(select, { filterable: false });
  $('dpe').addEventListener('change', () => {
    $('dpe-date').required = Boolean($('dpe').value);
  });
}
