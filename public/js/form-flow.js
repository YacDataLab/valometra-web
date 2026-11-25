import { addressData } from './enrichment.js';
import { $ } from './dom.js';
import { syncChoice } from './ui.js';

const mode = $('dpe-mode');
let previous = 'none';
function clearDPE() {
  addressData.clearDPE();
  $('dpe').value = '';
  $('dpe-date').value = '';
  document.querySelectorAll('[data-feature^="dpe_"]').forEach(e => {
    e.value = '';
    syncChoice(e);
  });
  $('dpe').dispatchEvent(new Event('change'));
}
function syncMode(clear = true) {
  const selected = mode.value;
  if (clear && selected !== previous) clearDPE();
  $('manual-dpe').hidden = selected === 'none';
  $('dpe-mode-help').textContent =
    selected === 'manual'
      ? 'Recopiez les informations du diagnostic de votre appartement. Vous pouvez compléter uniquement ce que vous connaissez.'
      : selected === 'found'
        ? 'Sélectionnez votre appartement dans la liste des diagnostics retrouvés et confirmez son numéro, sa surface et son étage.'
        : 'Vous pouvez obtenir une estimation sans DPE.';
  previous = selected;
  if (selected === 'found') {
    $('enrichment').hidden = false;
    $('dpe-choice').focus();
  }
}
mode.addEventListener('change', () => syncMode());
window.addEventListener('valometra:dpe-confirmed', () => {
  mode.value = 'found';
  syncChoice(mode);
  syncMode(false);
  $('dpe-mode-help').textContent =
    'DPE sélectionné et confirmé. Vous pouvez vérifier les informations préremplies ci-dessous.';
});
window.addEventListener('valometra:address-cleared', () => {
  mode.value = 'none';
  syncChoice(mode);
  previous = 'none';
  $('manual-dpe').hidden = true;
  $('dpe-mode-help').textContent = '';
});
syncMode(false);
$('surface-definition').addEventListener('change', () => {
  if ($('surface-definition').value === 'carrez' && !$('carrez').value)
    $('carrez').value = $('surface').value;
});
// Messages d'erreur de la charte : pictogramme, phrase corrective, focus sur le champ.
const errorText = field => {
  const v = field.validity,
    holder = document.querySelector(`label[for="${field.id}"]`) ?? field.closest('label'),
    label = (holder?.querySelector('.req') ?? holder)?.textContent?.replace(/\s*\*$/, '').trim();
  if (v.customError) return field.validationMessage;
  if (v.valueMissing)
    return field.tagName === 'SELECT'
      ? `Choisissez une option pour « ${label} ».`
      : `Renseignez « ${label} ».`;
  if (v.rangeUnderflow || v.rangeOverflow)
    return `Saisissez une valeur entre ${field.min} et ${field.max}.`;
  return field.validationMessage;
};
// Une liste personnalisée (ui.js) cache le <select> : l'erreur et le focus vont au champ visible.
const visible = field => document.getElementById(field.id + '-input') ?? field;
const clearError = field => {
  if (!field) return;
  field.removeAttribute('aria-invalid');
  visible(field).removeAttribute('aria-invalid');
  document.getElementById(field.id + '-error')?.remove();
};
const fieldOf = element => document.getElementById(element.dataset.for ?? element.id);
let focusPending = false;
$('estimate-form').addEventListener(
  'invalid',
  event => {
    const field = event.target;
    if (!field.id) return;
    event.preventDefault();
    clearError(field);
    const message = document.createElement('p');
    message.id = field.id + '-error';
    message.className = 'field-error';
    message.setAttribute('role', 'alert');
    message.textContent = errorText(field);
    (field.closest('label') ?? field).after(message);
    visible(field).setAttribute('aria-invalid', 'true');
    if (!focusPending) {
      focusPending = true;
      setTimeout(() => {
        focusPending = false;
        visible(field).focus();
      }, 0);
    }
  },
  true,
);
$('estimate-form').addEventListener('input', event => clearError(fieldOf(event.target)));
$('estimate-form').addEventListener('change', event => clearError(fieldOf(event.target)));
$('estimate-form').addEventListener(
  'invalid',
  e => {
    let parent = e.target.parentElement;
    while (parent && parent !== $('estimate-form')) {
      if (parent.tagName === 'DETAILS') parent.open = true;
      parent = parent.parentElement;
    }
  },
  true,
);
