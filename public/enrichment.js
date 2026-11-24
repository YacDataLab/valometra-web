'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let seq = 0,
    controller,
    address = null,
    buildings = [],
    dpes = [],
    buildingFeatures = {},
    dpeFeatures = {},
    applied = new Map(),
    busy = false;
  const buildingMap = {
    code_iris: 'bdnb_code_iris',
    annee_construction: 'bdnb_annee_construction',
    nb_niveau: 'bdnb_nb_niveaux',
    nb_log: 'bdnb_nb_logements',
    mat_mur_txt: 'bdnb_materiau_murs',
    mat_toit_txt: 'bdnb_materiau_toit',
    hauteur_mean: 'bdnb_hauteur_moyenne_m',
    surface_emprise_sol: 'bdnb_emprise_sol_m2',
    altitude_sol_mean: 'bdnb_altitude_sol_m',
    usage_principal_bdnb_open: 'bdnb_usage_principal',
    alea_argile: 'bdnb_alea_argile',
    alea_radon: 'bdnb_alea_radon',
  };
  const dpeMap = {
    etiquette_dpe: 'dpe_etiquette_energie',
    etiquette_ges: 'dpe_etiquette_ges',
    conso_5_usages_par_m2_ep: 'dpe_conso_ep_m2',
    annee_construction: 'dpe_annee_construction',
    periode_construction: 'dpe_periode_construction',
    nombre_niveau_logement: 'dpe_niveaux_logement',
    hauteur_sous_plafond: 'dpe_hauteur_sous_plafond',
    qualite_isolation_enveloppe: 'dpe_isolation_enveloppe',
    type_energie_principale_chauffage: 'dpe_energie_chauffage',
    type_installation_chauffage: 'dpe_installation_chauffage',
  };
  const field = k =>
    k === 'dpe_etiquette_energie'
      ? $('dpe')
      : k === 'bdnb_annee_construction'
        ? $('year')
        : $('extra-' + k);
  const usable = v => v !== null && v !== undefined && String(v) !== '';
  function mapValues(row, mapping) {
    const f = {};
    for (const [source, target] of Object.entries(mapping))
      if (usable(row[source])) f[target] = row[source];
    return f;
  }
  function undo(group) {
    for (const [k, a] of applied) {
      if (a.group !== group) continue;
      const el = field(k);
      if (el && el.value === String(a.value)) el.value = '';
      applied.delete(k);
    }
    if (group === 'dpe') {
      if ($('dpe-date').dataset.auto === 'true') {
        $('dpe-date').value = '';
        delete $('dpe-date').dataset.auto;
      }
      dpeFeatures = {};
    } else buildingFeatures = {};
  }
  function populate(features, group) {
    for (const [k, value] of Object.entries(features)) {
      const el = field(k);
      if (!el) continue;
      if (el.value !== '' && !applied.has(k) && group !== 'dpe') continue;
      if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(value))) {
        delete features[k];
        continue;
      }
      if (el.type === 'number') {
        const number = Number(value),
          minimum = el.min === '' ? -Infinity : Number(el.min),
          maximum = el.max === '' ? Infinity : Number(el.max);
        if (!Number.isFinite(number) || number < minimum || number > maximum) {
          delete features[k];
          continue;
        }
      }
      el.value = String(value);
      applied.set(k, { value, group });
    }
  }
  function reset() {
    seq++;
    controller?.abort();
    busy = false;
    undo('building');
    undo('dpe');
    address = null;
    buildings = [];
    dpes = [];
    $('enrichment').hidden = true;
    $('building-choice').replaceChildren();
    $('dpe-choice').replaceChildren();
    $('dpe-confirm').hidden = true;
    $('enrichment-status').textContent = '';
    $('dpe').dispatchEvent(new Event('change'));
  }
  function addOption(select, value, label) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.append(o);
  }
  async function getJSON(url, signal) {
    const r = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw Error('HTTP ' + r.status);
    return r.json();
  }
  function applyBuilding(index) {
    undo('building');
    undo('dpe');
    $('dpe-confirm').hidden = true;
    $('dpe-choice').value = '';
    if (index === '') return;
    const b = buildings[+index];
    buildingFeatures = mapValues(b, buildingMap);
    populate(buildingFeatures, 'building');
    $('building-status').textContent =
      `Fiche ${b.batiment_groupe_id} · ${Object.keys(buildingFeatures).length} caractéristiques récupérées. Vérifiez les valeurs préremplies.`;
  }
  function previewDPE() {
    undo('dpe');
    const value = $('dpe-choice').value;
    $('dpe-confirm').hidden = value === '';
    if (value === '') return;
    const r = dpes[+value];
    const size = Number(r.surface_habitable_logement),
      entered = Number($('surface').value);
    $('dpe-preview').textContent =
      `DPE ${r.numero_dpe} · ${r.date_etablissement_dpe} · ${size} m² · ${r.complement_adresse_logement || 'étage non précisé'}. ` +
      (entered && Math.abs(size - entered) / entered > 0.2
        ? 'La surface diffère de plus de 20 % de votre saisie. Les surfaces DPE et DVF peuvent différer : vérifiez le document.'
        : 'Vérifiez qu’il s’agit bien de votre appartement.');
  }
  function applyDPE() {
    const index = $('dpe-choice').value;
    if (index === '') return;
    const r = dpes[+index];
    undo('dpe');
    dpeFeatures = mapValues(r, dpeMap);
    dpeFeatures.dpe_type = 'existant';
    if (usable(r.logement_traversant)) {
      const v = String(r.logement_traversant).toLowerCase();
      if (['oui', '1', 'true'].includes(v)) dpeFeatures.dpe_traversant = 1;
      else if (['non', '0', 'false'].includes(v)) dpeFeatures.dpe_traversant = 0;
    }
    populate(dpeFeatures, 'dpe');
    $('dpe-date').value = r.date_etablissement_dpe;
    $('dpe-date').dataset.auto = 'true';
    $('dpe').dispatchEvent(new Event('change'));
    $('dpe-preview').textContent =
      `DPE ${r.numero_dpe} confirmé. Ses informations sont ajoutées au formulaire et seront utilisées pour l’estimation.`;
    $('dpe-confirm-button').textContent = 'DPE confirmé';
    window.dispatchEvent(new CustomEvent('valometra:dpe-confirmed'));
  }
  async function lookup(a) {
    reset();
    address = a;
    $('enrichment').hidden = false;
    if (!a.ban) {
      $('enrichment-status').textContent =
        'L’identifiant de cette adresse est indisponible. Vous pouvez compléter les caractéristiques manuellement.';
      return;
    }
    busy = true;
    const token = seq;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    $('enrichment-status').textContent = 'Recherche du bâtiment et des diagnostics officiels…';
    $('building-status').textContent = '';
    $('dpe-preview').textContent = '';
    const bKeys = [
      'batiment_groupe_id',
      'cle_interop_adr',
      'libelle_adr_principale_ban',
      ...Object.keys(buildingMap),
    ].join(',');
    const dKeys = [
      'numero_dpe',
      'identifiant_ban',
      'date_etablissement_dpe',
      'date_fin_validite_dpe',
      'type_batiment',
      'surface_habitable_logement',
      'complement_adresse_logement',
      'complement_adresse_batiment',
      'id_rnb',
      'logement_traversant',
      ...Object.keys(dpeMap),
    ].join(',');
    const bURL =
      'https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet/adresse?' +
      new URLSearchParams({ cle_interop_adr: 'eq.' + a.ban, select: bKeys, limit: '10' });
    const dURL =
      'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines?' +
      new URLSearchParams({ qs: 'identifiant_ban:"' + a.ban + '"', size: '100', select: dKeys });
    const [b, d] = await Promise.allSettled([
      getJSON(bURL, controller.signal),
      getJSON(dURL, controller.signal),
    ]);
    clearTimeout(timeout);
    if (token !== seq) return;
    busy = false;
    let messages = [];
    $('building-choice').replaceChildren();
    addOption($('building-choice'), '', 'Choisir un bâtiment / saisie manuelle');
    if (b.status === 'fulfilled' && Array.isArray(b.value)) {
      buildings = b.value.filter(r => r.cle_interop_adr === a.ban && r.batiment_groupe_id);
      buildings.forEach((r, i) =>
        addOption(
          $('building-choice'),
          String(i),
          `${r.batiment_groupe_id} · ${r.annee_construction || 'année inconnue'} · ${r.nb_log || '?'} logements`,
        ),
      );
      if (buildings.length === 1) {
        $('building-choice').value = '0';
        applyBuilding('0');
        messages.push('Un bâtiment identifié, caractéristiques préremplies.');
      } else
        messages.push(
          buildings.length
            ? `${buildings.length} bâtiments : choisissez celui du logement.`
            : 'Aucun bâtiment retrouvé à cette adresse.',
        );
      if (b.value.length >= 10) messages.push('Les 10 premières fiches bâtiment sont affichées.');
    } else messages.push('Service bâtiment indisponible : la saisie manuelle reste possible.');
    $('dpe-choice').replaceChildren();
    addOption($('dpe-choice'), '', 'Choisir mon DPE / saisie manuelle');
    if (d.status === 'fulfilled' && Array.isArray(d.value.results)) {
      const exact = d.value.results.filter(
        r => r.identifiant_ban === a.ban && String(r.type_batiment).toLowerCase() === 'appartement',
      );
      dpes = exact
        .filter(
          r =>
            r.numero_dpe &&
            /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.date_etablissement_dpe || '') &&
            r.date_etablissement_dpe <= ValometraConfig.referenceDate &&
            (!r.date_fin_validite_dpe ||
              r.date_fin_validite_dpe >= ValometraConfig.referenceDate) &&
            Number(r.surface_habitable_logement) > 0,
        )
        .sort((a, b) => b.date_etablissement_dpe.localeCompare(a.date_etablissement_dpe));
      dpes.forEach((r, i) =>
        addOption(
          $('dpe-choice'),
          String(i),
          `${r.numero_dpe} · ${r.surface_habitable_logement} m² · ${r.etiquette_dpe || '?'} · ${r.complement_adresse_logement || 'étage non précisé'} · ${r.date_etablissement_dpe}`,
        ),
      );
      messages.push(
        `${dpes.length} DPE éligibles à cette adresse : confirmez celui de votre appartement.`,
      );
      if (exact.length > dpes.length)
        messages.push(
          'Les diagnostics postérieurs à juin 2026 ou non valides à cette date ne sont pas utilisés.',
        );
      if (d.value.total > 100) messages.push('Les 100 premiers diagnostics sont examinés.');
    } else
      messages.push(
        'Service DPE indisponible : vous pouvez renseigner votre diagnostic manuellement.',
      );
    $('enrichment-status').textContent = messages.join(' ');
  }
  $('building-choice').addEventListener('change', () => applyBuilding($('building-choice').value));
  $('dpe-choice').addEventListener('change', () => {
    $('dpe-confirm-button').textContent = 'Confirmer que ce DPE est celui de mon logement';
    previewDPE();
  });
  $('dpe-confirm-button').addEventListener('click', applyDPE);
  $('enrichment-retry').addEventListener('click', () => {
    if (address) lookup({ ...address });
  });
  window.ValometraEnrichment = {
    clear: reset,
    clearDPE() {
      undo('dpe');
      $('dpe-choice').value = '';
      $('dpe-confirm').hidden = true;
    },
    lookup,
    isBusy: () => busy,
    getFeatures() {
      const f = { ...buildingFeatures, ...dpeFeatures };
      for (const [k, a] of applied) {
        const el = field(k);
        if (el && el.value === '') delete f[k];
      }
      return f;
    },
    getSummary() {
      return {
        building: Object.keys(buildingFeatures).length > 0,
        dpe: Object.keys(dpeFeatures).length > 0,
      };
    },
  };
})();
