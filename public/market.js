// Explorateur du marché : filtres, statistiques, carte, graphiques, classement et tableau.
import { $, state } from './store.js';
import { hasMap, inView, drawSales, initMap, resetView } from './map.js';
import { combobox, segmented, syncChoice } from './ui.js';

const F = window.ValometraFormat;
const { esc, money, num, median, measure, binEdge, frDate } = F;

let filtered = [],
  page = 0;

function getBase(ignoreTown = false) {
  const town = ignoreTown ? '' : $('market-town').value,
    dpe = $('market-dpe').value;
  return state.market.filter(
    r =>
      (!town || r.code === town) &&
      (!$('min-area').value || r.surface >= +$('min-area').value) &&
      (!$('max-area').value || r.surface <= +$('max-area').value) &&
      (!$('min-price').value || r.price >= +$('min-price').value) &&
      (!$('max-price').value || r.price <= +$('max-price').value) &&
      (!$('from-date').value || r.date >= $('from-date').value) &&
      (!$('to-date').value || r.date <= $('to-date').value) &&
      (!dpe || (dpe === 'missing' ? !r.dpe : r.dpe === dpe)),
  );
}
const MARKET_FIELDS = {
  commune: 'market-town',
  smin: 'min-area',
  smax: 'max-area',
  pmin: 'min-price',
  pmax: 'max-price',
  du: 'from-date',
  au: 'to-date',
  dpe: 'market-dpe',
  couleur: 'map-color',
};
// Reflète les filtres dans l'URL pour pouvoir partager une vue du marché.
function syncMarketUrl() {
  const url = new URL(location.href),
    values = {};
  for (const [key, id] of Object.entries(MARKET_FIELDS)) {
    values[key] = $(id).value;
    url.searchParams.delete(key);
  }
  for (const [key, value] of F.marketQuery(values)) {
    if (!(key === 'couleur' && value === 'm2')) url.searchParams.set(key, value);
  }
  history.replaceState(history.state, '', url);
}
function applyMarketLink() {
  const shared = F.parseMarket(location.search);
  for (const [key, value] of Object.entries(shared)) {
    const field = $(MARKET_FIELDS[key]);
    // Une commune absente de la liste ou une valeur inconnue laisse le filtre vide.
    field.value = value;
    if (field.value !== String(value)) field.value = '';
    syncChoice(field);
  }
}

function renderMarket() {
  if (!state.metadata) return;
  syncMarketUrl();
  const base = getBase();
  filtered = $('visible-only').checked && hasMap() ? base.filter(inView) : base;
  const prices = filtered.map(r => r.price),
    m2 = filtered.map(r => r.price / r.surface);
  $('market-stats').innerHTML =
    `<div class="stat"><b>${num(filtered.length)}</b><span>ventes sélectionnées</span></div><div class="stat"><b>${filtered.length ? money(median(m2)) : '—'}</b><span>prix médian / m²</span></div><div class="stat"><b>${filtered.length ? money(median(prices)) : '—'}</b><span>prix médian</span></div>`;
  drawSales(base, $('map-color').value);
  drawHistogram();
  drawTrend();
  renderRanking();
  page = 0;
  renderTable();
}
function drawTrend() {
  const { monthlyMedian, frMonth } = window.ValometraFormat,
    series = monthlyMedian(filtered),
    points = series.filter(m => m.reliable),
    box = $('market-trend');
  $('trend-note').textContent =
    'Chaque point est la médiane d’un mois, affichée à partir de 10 ventes. Sur un an seulement, ce n’est pas une tendance : les variations restent à lire avec prudence.';
  if (points.length < 2) {
    box.textContent = 'Pas assez de ventes par mois pour tracer une courbe avec ces filtres.';
    return;
  }
  const W = 600,
    H = 220,
    pad = { l: 64, r: 16, t: 16, b: 34 },
    months = series.map(m => m.month),
    values = points.map(m => m.median),
    lo = Math.min(...values) * 0.95,
    hi = Math.max(...values) * 1.05,
    x = m => pad.l + (months.indexOf(m) / Math.max(1, months.length - 1)) * (W - pad.l - pad.r),
    y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b),
    line = points.map(m => `${x(m.month).toFixed(1)},${y(m.median).toFixed(1)}`).join(' '),
    ticks = [lo, (lo + hi) / 2, hi];
  box.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prix médian au m² par mois : de ${money(points[0].median)} en ${frMonth(points[0].month)} à ${money(points.at(-1).median)} en ${frMonth(points.at(-1).month)}.">` +
    ticks
      .map(
        v =>
          `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${num(v)}</text>`,
      )
      .join('') +
    `<polyline class="trend-line" points="${line}"/>` +
    points
      .map(
        m =>
          `<circle class="trend-dot" cx="${x(m.month).toFixed(1)}" cy="${y(m.median).toFixed(1)}" r="4"><title>${frMonth(m.month)} : ${money(m.median)}/m², ${m.count} ventes</title></circle>`,
      )
      .join('') +
    [months[0], months.at(-1)]
      .map(
        (m, i) =>
          `<text class="axis" x="${x(m).toFixed(1)}" y="${H - 10}" text-anchor="${i ? 'end' : 'start'}">${frMonth(m)}</text>`,
      )
      .join('') +
    `</svg>`;
}

function renderRanking() {
  const selected = $('market-town').value;
  $('town-ranking').innerHTML = F.communeRanking(getBase(true))
    .map(
      t =>
        `<tr${t.code === selected ? ' class="selected"' : ''}><td><button type="button" class="link" data-code="${esc(t.code)}">${esc(t.town)}</button></td><td>${num(t.count)}${t.reliable ? '' : '<small>échantillon faible</small>'}</td><td>${money(t.median)}</td></tr>`,
    )
    .join('');
}
$('town-ranking').addEventListener('click', event => {
  const button = event.target.closest('button[data-code]');
  if (!button) return;
  $('market-town').value = button.dataset.code;
  syncChoice($('market-town'));
  renderMarket();
  $('market-stats').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
function drawHistogram() {
  const key = $('hist-measure').value,
    values = filtered.map(r => measure(r, key));
  if (!values.length) {
    $('market-hist').textContent = 'Aucune vente pour ces filtres.';
    return;
  }
  const max = Math.max(...values),
    step = Math.ceil(max / 10) || 1,
    counts = Array(10).fill(0);
  values.forEach(v => counts[Math.min(9, Math.floor(v / step))]++);
  const largest = Math.max(...counts);
  $('market-hist').setAttribute(
    'aria-label',
    `Histogramme de ${values.length} ventes, ${key === 'm2' ? 'prix au mètre carré' : key === 'price' ? 'prix total' : 'surface'}.`,
  );
  $('market-hist').innerHTML = counts
    .map(
      (n, i) =>
        `<div class="hist-bin" title="${num(i * step)} à ${num((i + 1) * step)} : ${n} ventes"><span>${n || ''}</span><div class="bar" style="height:${(n / largest) * 112}px"></div><span>${binEdge(i * step)}</span></div>`,
    )
    .join('');
}
function renderTable() {
  const rows = [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
    pages = Math.max(1, Math.ceil(rows.length / 15));
  page = Math.min(page, pages - 1);
  $('sales-table').innerHTML =
    rows
      .slice(page * 15, page * 15 + 15)
      .map(
        r =>
          `<tr><td>${esc(frDate(r.date))}</td><td>${esc(r.town)}</td><td>${num(r.surface)} m²</td><td>${money(r.price)}</td><td>${money(r.price / r.surface)}</td><td>${esc(r.dpe || '—')}</td></tr>`,
      )
      .join('') || '<tr><td colspan="6">Aucune vente ne correspond aux filtres.</td></tr>';
  $('page-sales').textContent = `Page ${page + 1} / ${pages}`;
  $('table-count').textContent = `${filtered.length} ventes`;
  $('prev-sales').disabled = page === 0;
  $('next-sales').disabled = page === pages - 1;
}
for (const id of [
  'market-town',
  'min-area',
  'max-area',
  'min-price',
  'max-price',
  'from-date',
  'to-date',
  'market-dpe',
  'map-color',
  'visible-only',
])
  $(id).addEventListener('change', renderMarket);
$('hist-measure').addEventListener('change', drawHistogram);
$('prev-sales').onclick = () => {
  page--;
  renderTable();
};
$('next-sales').onclick = () => {
  page++;
  renderTable();
};
$('reset-market').onclick = () => {
  for (const id of ['market-town', 'min-area', 'max-area', 'min-price', 'max-price', 'market-dpe'])
    $(id).value = '';
  syncChoice($('market-town'));
  syncChoice($('market-dpe'));
  $('from-date').value = ValometraConfig.marketStart;
  $('to-date').value = ValometraConfig.referenceDate;
  $('map-color').value = 'm2';
  syncChoice($('map-color'));
  syncChoice($('hist-measure'));
  $('visible-only').checked = false;
  resetView();
  renderMarket();
};
$('export-market').onclick = () => {
  const rows = [
    ['date', 'commune', 'surface_m2', 'prix_eur', 'prix_m2', 'dpe'],
    ...filtered.map(r => [
      r.date,
      r.town,
      r.surface,
      r.price,
      Math.round(r.price / r.surface),
      r.dpe,
    ]),
  ];
  const csv =
    '\ufeff' +
    rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
    a = document.createElement('a');
  a.href = url;
  a.download = 'valometra-ventes-selection.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Appelé une fois les communes connues : liste des communes et filtres issus d'un lien partagé.
export function initMarket(towns) {
  $('market-town').insertAdjacentHTML(
    'beforeend',
    towns.map(town => `<option value="${town.code}">${esc(town.name)}</option>`).join(''),
  );
  combobox($('market-town'));
  combobox($('market-dpe'), { filterable: false });
  segmented($('map-color'));
  segmented($('hist-measure'));
  applyMarketLink();
}

// Appelé quand l'onglet Marché s'ouvre : prépare la carte puis dessine tout.
export function showMarket() {
  initMap(() => {
    if ($('visible-only').checked) renderMarket();
  });
  renderMarket();
}

export const marketReady = () => !$('market').hidden && state.market.length > 0;
export { renderMarket };
