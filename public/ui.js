// Contrôles de choix. Dans les deux cas, le <select> reste la source de vérité (valeur,
// événement change, accessibilité sans script) : le contrôle n'en est qu'une présentation.
const updaters = new WeakMap();

// Contrôle segmenté : remplace une liste déroulante de 2 ou 3 choix par des boutons radio.
export function segmented(select) {
  const label = select.closest('label');
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label?.firstChild?.textContent.trim() ?? '');
  const buttons = [...select.options].map(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.dataset.value = option.value;
    button.textContent = option.textContent;
    group.append(button);
    return button;
  });
  const update = () => {
    for (const button of buttons) {
      const checked = button.dataset.value === select.value;
      button.setAttribute('aria-checked', checked);
      button.tabIndex = checked ? 0 : -1;
    }
  };
  const choose = button => {
    select.value = button.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    update();
    button.focus();
  };
  group.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) choose(button);
  });
  group.addEventListener('keydown', event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = buttons.findIndex(button => button.dataset.value === select.value);
    choose(buttons[(current + step + buttons.length) % buttons.length]);
  });
  select.hidden = true;
  select.after(group);
  updaters.set(select, update);
  update();
}

// Liste personnalisée : champ filtrable pour une longue liste (ex. les communes) ou liste
// de choix simple (`filterable: false`) avec la même apparence. Saisie, liste, flèches, Entrée,
// Échap. Le libellé du <label> devient le nom accessible du champ ; la liste reste hors ligne.
const fold = text =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function combobox(select, { filterable = true } = {}) {
  const label = select.closest('label');
  const id = select.id;
  const labelId = `${id}-label`;
  // Le libellé est soit un texte nu, soit un <span class="req"> (champ obligatoire).
  const named = [...label.childNodes].find(
    node => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('req'),
  );
  if (named) named.id = labelId;
  else {
    const textNode = [...label.childNodes].find(
      node => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    const caption = document.createElement('span');
    caption.id = labelId;
    caption.textContent = textNode.textContent.trim();
    textNode.replaceWith(caption);
  }

  const input = document.createElement('input');
  input.id = `${id}-input`;
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.readOnly = !filterable;
  input.dataset.for = id;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-list`);
  input.setAttribute('aria-labelledby', labelId);

  const list = document.createElement('ul');
  list.id = `${id}-list`;
  list.className = 'combobox-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-labelledby', labelId);
  list.hidden = true;

  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');

  const wrap = document.createElement('div');
  wrap.className = filterable ? 'combobox' : 'combobox combobox-select';
  wrap.append(input, list, status);
  select.before(wrap);
  select.hidden = true;

  const selectedText = () => select.options[select.selectedIndex]?.textContent ?? '';
  let shown = [];
  let active = -1;

  const isOpen = () => !list.hidden;
  const setActive = index => {
    active = index;
    const items = [...list.querySelectorAll('[role="option"]')];
    items.forEach((item, i) => item.classList.toggle('is-active', i === index));
    if (index >= 0 && items[index]) {
      input.setAttribute('aria-activedescendant', items[index].id);
      items[index].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
  };
  const open = () => {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const render = query => {
    const q = filterable ? fold(query.trim()) : '';
    shown = [...select.options].filter(option => !q || fold(option.textContent).includes(q));
    const items = shown.map((option, i) => {
      const item = document.createElement('li');
      item.id = `${id}-option-${i}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      if (option.disabled) item.setAttribute('aria-disabled', 'true');
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      if (option.value === select.value) item.classList.add('is-current');
      return item;
    });
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'combobox-empty';
      empty.textContent = 'Aucun résultat';
      items.push(empty);
    }
    list.replaceChildren(...items);
    if (filterable)
      status.textContent = shown.length ? `${shown.length} résultat(s)` : 'Aucun résultat';
    // Liste de choix : la valeur courante est active à l'ouverture.
    setActive(filterable ? -1 : shown.findIndex(option => option.value === select.value));
  };
  const choose = option => {
    if (!option || option.disabled) return;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = option.textContent;
    close();
  };

  input.addEventListener('focus', () => {
    if (!filterable) return;
    input.select();
    render('');
    open();
  });
  input.addEventListener('click', () => {
    if (filterable) return;
    if (isOpen()) close();
    else {
      render('');
      open();
    }
  });
  input.addEventListener('input', () => {
    render(input.value);
    open();
  });
  input.addEventListener('blur', () => {
    input.value = selectedText();
    close();
  });
  input.addEventListener('keydown', event => {
    const last = list.querySelectorAll('[role="option"]').length - 1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen()) {
        if (!filterable) render('');
        return open();
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(Math.min(Math.max(active + step, 0), last));
    } else if (!filterable && (event.key === 'Enter' || event.key === ' ')) {
      // Liste de choix : Entrée ou Espace ouvre la liste, puis choisit l'élément actif.
      event.preventDefault();
      if (!isOpen()) {
        render('');
        open();
      } else if (active >= 0) choose(shown[active]);
      else close();
    } else if (event.key === 'Enter' && isOpen() && active >= 0) {
      event.preventDefault();
      choose(shown[active]);
    } else if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      input.value = selectedText();
      close();
    }
  });
  // mousedown garde le focus dans le champ ; click choisit, sans déclencher le libellé.
  list.addEventListener('mousedown', event => event.preventDefault());
  list.addEventListener('click', event => {
    const item = event.target.closest('[role="option"]');
    if (!item) return;
    event.preventDefault();
    choose(shown[[...list.children].indexOf(item)]);
  });

  // Affichage recalculé à chaque changement de valeur, y compris ceux écrits par le code.
  const update = () => {
    input.value = selectedText();
    input.disabled = select.disabled;
    if (isOpen()) render(input.value);
  };
  select.addEventListener('change', update);
  update();
  updaters.set(select, update);
}

// À appeler après une modification de `select.value` par le code.
export const syncChoice = select => updaters.get(select)?.();
