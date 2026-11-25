// Contrôle segmenté : remplace une liste déroulante de 2 ou 3 choix par des boutons radio.
// Le <select> reste la source de vérité (valeur, événement change, accessibilité sans script).
const updaters = new WeakMap();

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

// À appeler après une modification de `select.value` par le code.
export const syncSegmented = select => updaters.get(select)?.();
