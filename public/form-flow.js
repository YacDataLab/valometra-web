'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const mode = $('dpe-mode');
  let previous = 'none';
  function clearDPE() {
    window.ValometraEnrichment?.clearDPE();
    $('dpe').value = '';
    $('dpe-date').value = '';
    document.querySelectorAll('[data-feature^="dpe_"]').forEach(e => (e.value = ''));
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
    syncMode(false);
    $('dpe-mode-help').textContent =
      'DPE sélectionné et confirmé. Vous pouvez vérifier les informations préremplies ci-dessous.';
  });
  window.addEventListener('valometra:address-cleared', () => {
    mode.value = 'none';
    previous = 'none';
    $('manual-dpe').hidden = true;
    $('dpe-mode-help').textContent = '';
  });
  syncMode(false);
  $('surface-definition').addEventListener('change', () => {
    if ($('surface-definition').value === 'carrez' && !$('carrez').value)
      $('carrez').value = $('surface').value;
  });
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
})();
