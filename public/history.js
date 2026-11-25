'use strict';
// Historique local des estimations : stocké uniquement dans ce navigateur, sur
// consentement (case à cocher), jamais envoyé au serveur.
(() => {
  const LIST_KEY = 'valometra-history',
    ENABLED_KEY = 'valometra-history-enabled';
  const $ = id => document.getElementById(id);
  const F = () => window.ValometraFormat;
  const { money, roundMoney, esc } = window.ValometraFormat;
  const store = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Stockage indisponible : rien à effacer. */
      }
    },
  };
  let selected = [];

  const enabled = () => store.get(ENABLED_KEY) === '1';
  const entries = () => F().parseHistory(store.get(LIST_KEY));

  function renderCompare(list) {
    const [a, b] = selected.map(at => list.find(e => e.at === at));
    const box = $('history-compare');
    if (!a || !b) {
      box.textContent = selected.length ? 'Cochez une deuxième estimation pour comparer.' : '';
      return;
    }
    const gap = F().compareEntries(a, b),
      sign = n => (n > 0 ? '+' : n < 0 ? '−' : ''),
      euros = n => `${sign(n)}${money(Math.abs(n))}`,
      percent = n =>
        `${sign(n)}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(Math.abs(n))}\u202f%`,
      count = n => `${sign(n)}${Math.abs(n)}`;
    const row = (label, x, y, delta) =>
      `<tr><th scope="row">${label}</th><td>${x}</td><td>${y}</td><td>${delta}</td></tr>`;
    box.innerHTML =
      `<div class="table-wrap"><table><thead><tr><th></th><th>Estimation A</th><th>Estimation B</th><th>Écart (B − A)</th></tr></thead><tbody>` +
      row(
        'Bien',
        esc(a.query ? F().parseShare(a.query).adresse : ''),
        esc(F().parseShare(b.query).adresse),
        '',
      ) +
      row(
        'Prix estimé',
        roundMoney(a.point),
        roundMoney(b.point),
        `${euros(Math.round(gap.point.euros / 1000) * 1000)} · ${percent(gap.point.percent)}`,
      ) +
      row(
        'Prix au m²',
        money(Math.round(a.point / a.surface)),
        money(Math.round(b.point / b.surface)),
        percent(gap.perM2.percent),
      ) +
      row(
        'Surface',
        `${a.surface}\u202fm²`,
        `${b.surface}\u202fm²`,
        `${count(gap.surface)}\u202fm²`,
      ) +
      row('Pièces', a.rooms, b.rooms, count(gap.rooms)) +
      `</tbody></table></div><p class="hint">Estimation A : la première cochée ; B : la seconde. Chaque estimation garde sa propre fourchette ; comparez-les avec prudence.</p>`;
  }

  function render() {
    const on = enabled(),
      list = on ? entries() : [];
    $('history-enabled').checked = on;
    $('history-clear').hidden = !list.length;
    selected = selected.filter(at => list.some(e => e.at === at));
    $('history-list').innerHTML = list.length
      ? list
          .map(e => {
            const shared = F().parseShare(e.query);
            return `<li><div><b>${esc(shared.adresse)}</b><span class="hint">${esc(e.town)} · ${shared.surface}\u202fm² · ${shared.pieces} pièces · ${esc(F().frDate(e.at))}</span></div><div class="history-values"><b>${roundMoney(e.point)}</b><span class="hint">de ${roundMoney(e.low)} à ${roundMoney(e.high)}</span></div><div class="history-actions"><label class="check"><input type="checkbox" data-compare="${esc(e.at)}"${selected.includes(e.at) ? ' checked' : ''}>Comparer</label><button type="button" class="link" data-reopen="${esc(e.at)}">Rouvrir</button></div></li>`;
          })
          .join('')
      : on
        ? '<li class="hint">Aucune estimation enregistrée pour le moment.</li>'
        : '';
    renderCompare(list);
  }

  $('history-enabled').addEventListener('change', event => {
    if (event.target.checked) {
      if (!store.set(ENABLED_KEY, '1')) {
        event.target.checked = false;
        $('history-compare').textContent = 'Le stockage du navigateur est indisponible.';
        return;
      }
    } else {
      store.remove(ENABLED_KEY);
      store.remove(LIST_KEY);
      selected = [];
    }
    render();
  });
  $('history-clear').addEventListener('click', () => {
    store.remove(LIST_KEY);
    selected = [];
    render();
  });
  $('history-list').addEventListener('change', event => {
    const at = event.target.dataset?.compare;
    if (!at) return;
    selected = event.target.checked ? [...selected, at].slice(-2) : selected.filter(x => x !== at);
    render();
  });
  $('history-list').addEventListener('click', event => {
    const at = event.target.dataset?.reopen;
    const entry = at && entries().find(e => e.at === at);
    if (!entry) return;
    window.dispatchEvent(
      new CustomEvent('valometra:reopen', { detail: F().parseShare(entry.query) }),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.ValometraHistory = {
    // Appelé après une estimation lancée par l'utilisateur ; sans effet si la case est décochée.
    record(entry) {
      if (!enabled()) return;
      const next = F().addHistory(entries(), { ...entry, at: new Date().toISOString() });
      store.set(LIST_KEY, JSON.stringify(next));
      render();
    },
  };
  render();
})();
