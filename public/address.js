'use strict';
(() => {
  const input = document.getElementById('address'),
    list = document.getElementById('address-suggestions'),
    status = document.getElementById('address-status');
  let towns = [],
    selection = null,
    timer,
    controller,
    sequence = 0;
  const clear = () => {
    window.ValometraEnrichment?.clear();
    window.dispatchEvent(new CustomEvent('valometra:address-cleared'));
    selection = null;
    for (const id of ['town', 'address-city', 'address-postal'])
      document.getElementById(id).value = '';
  };
  const hide = () => {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  };
  const invalidate = () => {
    clearTimeout(timer);
    controller?.abort();
    sequence++;
    clear();
    hide();
  };
  function pick(feature) {
    const p = feature.properties;
    clearTimeout(timer);
    controller?.abort();
    sequence++;
    selection = {
      ban: /^[0-9A-Za-z]+_[0-9A-Za-z]+_[0-9A-Za-z]+(?:_[0-9A-Za-z]+)*$/.test(p.id || '')
        ? p.id
        : '',
      label: p.label,
      code: p.citycode,
      postal: p.postcode,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
    };
    input.value = selection.label;
    document.getElementById('town').value = selection.code;
    document.getElementById('address-city').value = towns.find(t => t.code === selection.code).name;
    document.getElementById('address-postal').value = selection.postal;
    status.textContent = 'Adresse sélectionnée. Commune, code postal et position récupérés.';
    input.setCustomValidity('');
    hide();
    input.focus();
    window.ValometraEnrichment?.lookup({ ...selection });
  }
  function eligible(f) {
    const p = f.properties || {},
      c = f.geometry?.coordinates;
    return (
      p.type === 'housenumber' &&
      towns.some(t => t.code === p.citycode) &&
      /^\d{5}$/.test(p.postcode || '') &&
      Array.isArray(c) &&
      c.length === 2 &&
      c.every(Number.isFinite) &&
      Math.abs(c[0]) <= 180 &&
      Math.abs(c[1]) <= 90
    );
  }
  async function search(query, token, expected) {
    controller = new AbortController();
    status.textContent = 'Recherche d’adresses…';
    try {
      const params = new URLSearchParams({
        q: query,
        limit: '8',
        index: 'address',
        lat: '45.18',
        lon: '5.73',
      });
      const response = await fetch('https://data.geopf.fr/geocodage/search?' + params, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw Error('geocoding');
      const data = await response.json();
      if (token !== sequence) return;
      const rows = Array.isArray(data.features)
        ? data.features.filter(f => f.properties?.label)
        : [];
      hide();
      const exact =
        expected &&
        rows.find(f => eligible(f) && (expected === true || f.properties.label === expected));
      if (exact) {
        pick(exact);
        return;
      }
      if (!rows.length) {
        status.textContent = 'Aucune adresse trouvée. Précisez le numéro, la rue et la commune.';
        return;
      }
      for (const f of rows) {
        const li = document.createElement('li'),
          button = document.createElement('button');
        button.type = 'button';
        button.textContent = f.properties.label;
        const valid = eligible(f);
        if (!valid) {
          button.disabled = true;
          button.textContent +=
            ' — ' +
            (towns.some(t => t.code === f.properties.citycode)
              ? 'précisez le numéro'
              : 'hors zone couverte');
        } else button.addEventListener('click', () => pick(f));
        li.append(button);
        list.append(li);
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      status.textContent = rows.some(eligible)
        ? 'Choisissez votre adresse dans les suggestions.'
        : 'Aucune adresse précise couverte. Ajoutez un numéro et une commune parmi les ' +
          ValometraConfig.townCount +
          ' communes couvertes.';
    } catch (e) {
      if (e.name === 'AbortError' || token !== sequence) return;
      hide();
      status.textContent =
        'Recherche indisponible. Vérifiez votre connexion et réessayez en modifiant l’adresse.';
    }
  }
  input.addEventListener('input', () => {
    invalidate();
    input.setCustomValidity('Sélectionnez une adresse complète dans les suggestions.');
    const q = input.value.trim();
    if (q.length < 4) {
      status.textContent = 'Saisissez au moins 4 caractères avec le numéro et la rue.';
      return;
    }
    const token = sequence;
    timer = setTimeout(() => search(q, token), 350);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && !list.hidden) {
      e.preventDefault();
      list.querySelector('button:not(:disabled)')?.focus();
    }
    if (e.key === 'Escape') hide();
  });
  list.addEventListener('keydown', e => {
    const buttons = [...list.querySelectorAll('button:not(:disabled)')],
      i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      hide();
      input.focus();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[Math.min(i + 1, buttons.length - 1)]?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (i <= 0) input.focus();
      else buttons[i - 1].focus();
    }
  });
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) hide();
  });
  window.ValometraAddress = {
    init(items) {
      towns = items;
      input.disabled = false;
      status.textContent =
        ValometraConfig.townCount + ' communes autour de Grenoble. Entrez une adresse complète.';
    },
    // Lien partagé : recherche l'adresse et la sélectionne si le libellé est identique.
    restore(label, firstSuggestion = false) {
      invalidate();
      input.value = label;
      input.setCustomValidity('Sélectionnez une adresse complète dans les suggestions.');
      search(label, ++sequence, firstSuggestion || label);
    },
    getSelected() {
      return selection && input.value === selection.label ? { ...selection } : null;
    },
  };
})();
