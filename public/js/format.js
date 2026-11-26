// Fonctions d'affichage sans dépendance au DOM (testées dans tests/format.test.mjs).
import { config } from './config.js';
// « 2026-06-30 » -> « 30/06/2026 » ; toute autre valeur est renvoyée telle quelle.
const frDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? '');
};
// Date et heure locales (« 25/11/2026 14:03 ») pour les dates horodatées du service.
const frDateTime = value => new Date(value).toLocaleString('fr-FR');

// Précision de la fourchette : largeur de la fourchette étendue (objectif 80 %)
// rapportée à l'estimation. Indicateur descriptif, pas une probabilité de justesse.
const PRECISION = [
  { max: 0.6, bars: 3, label: 'Resserrée' },
  { max: 1, bars: 2, label: 'Moyenne' },
  { max: Infinity, bars: 1, label: 'Large' },
];
const precision = (value, bounds) => {
  if (!(value > 0) || !Array.isArray(bounds) || !bounds.every(Number.isFinite)) return null;
  const width = (bounds[1] - bounds[0]) / value;
  return { ...PRECISION.find(level => width <= level.max), width };
};

// Position (en %) de l'estimation sur l'échelle de la fourchette affichée, pour la jauge du résultat.
const gauge = (value, range) => {
  const valid = Array.isArray(range) && range.length === 2 && range.every(Number.isFinite);
  if (!Number.isFinite(value) || !valid || range[1] <= range[0]) return null;
  return Math.min(100, Math.max(0, ((value - range[0]) / (range[1] - range[0])) * 100));
};

// Distance en mètres entre deux points GPS (formule de haversine).
const distance = (a, b) => {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad,
    h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

// Ventes les plus proches du bien dans sa commune, à surface comparable (±25 %).
const nearestComparables = (rows, target, limit = 5) =>
  rows
    .filter(
      r =>
        r.code === target.code &&
        r.surface >= target.surface * 0.75 &&
        r.surface <= target.surface * 1.25 &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon),
    )
    .map(r => ({ ...r, meters: distance(target, r) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);

// Distance lisible : « 120 m », « 1,4 km ».
const frDistance = meters =>
  meters < 1000
    ? `${Math.round(meters / 10) * 10} m`
    : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;

// Lien partageable : uniquement les caractéristiques saisies, jamais de DPE
// (un DPE doit toujours être confirmé par l'utilisateur).
const SHARE_FIELDS = {
  adresse: { type: 'text' },
  surface: { type: 'number', min: 9, max: 500 },
  pieces: { type: 'number', min: 1, max: 15 },
  definition: { type: 'enum', values: ['habitable', 'carrez', 'dvf', 'unknown'] },
  carrez: { type: 'number', min: 5, max: 500 },
  dependances: { type: 'number', min: 0, max: 20 },
  annee: { type: 'number', min: 1600, max: 2026 },
};
const shareQuery = values => {
  const params = new URLSearchParams();
  for (const key of Object.keys(SHARE_FIELDS))
    if (values[key] !== undefined && values[key] !== null && String(values[key]) !== '')
      params.set(key, values[key]);
  return params.toString();
};
const parseShare = search => {
  const params = new URLSearchParams(search),
    out = {};
  for (const [key, rule] of Object.entries(SHARE_FIELDS)) {
    const raw = params.get(key);
    if (raw === null) continue;
    if (rule.type === 'text') {
      if (raw.trim() && raw.length <= 200) out[key] = raw.trim();
    } else if (rule.type === 'enum') {
      if (rule.values.includes(raw)) out[key] = raw;
    } else {
      const n = Number(raw);
      if (raw.trim() !== '' && Number.isFinite(n) && n >= rule.min && n <= rule.max) out[key] = n;
    }
  }
  return out.adresse && out.surface && out.pieces ? out : null;
};

// Variables du modèle d'une variante du bien. Les détails du DPE saisis pour
// l'étiquette d'origine sont retirés : ils ne correspondraient plus à la nouvelle.
const scenarioFeatures = (base, changes) => {
  const f = { ...base };
  const surface = Number(changes.surface);
  if (surface > 0) {
    const ratio = surface / Number(base.surface_habitable);
    f.surface_habitable = String(surface);
    if (Number(base.surface_carrez) > 0 && Number.isFinite(ratio))
      f.surface_carrez = String(Math.round(Number(base.surface_carrez) * ratio * 10) / 10);
  }
  if (Number(changes.rooms) > 0) f.nb_pieces = String(changes.rooms);
  if (changes.dependencies !== undefined && changes.dependencies !== '')
    f.nb_dependances = String(changes.dependencies);
  if (changes.dpe) {
    for (const key of Object.keys(f)) if (key.startsWith('dpe_')) delete f[key];
    f.dpe_etiquette_energie = changes.dpe;
    f.dpe_type = 'existant';
    f.dpe_disponible = 1;
  }
  return f;
};

// Écart entre l'estimation de base et celle de la variante.
const variation = (base, next) =>
  base > 0 && Number.isFinite(next)
    ? { euros: next - base, percent: ((next - base) / base) * 100 }
    : null;

// Filtres de l'explorateur du marché dans l'URL (valeurs par défaut omises).
const marketDefaults = () => ({
  du: config.marketStart,
  au: config.referenceDate,
});
const MARKET_NUMBERS = ['smin', 'smax', 'pmin', 'pmax'];
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const marketQuery = values => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || String(value) === '') continue;
    if (marketDefaults()[key] === value) continue;
    params.set(key, value);
  }
  return params;
};
const parseMarket = search => {
  const params = new URLSearchParams(search),
    out = {};
  const commune = params.get('commune');
  if (/^\d{5}$/.test(commune ?? '')) out.commune = commune;
  for (const key of MARKET_NUMBERS) {
    const raw = params.get(key);
    if (raw !== null && raw.trim() !== '' && Number(raw) >= 0 && Number.isFinite(Number(raw)))
      out[key] = Number(raw);
  }
  for (const key of ['du', 'au']) {
    const raw = params.get(key);
    if (raw !== null && isDate(raw)) out[key] = raw;
  }
  const dpe = params.get('dpe');
  if (dpe && /^([A-G]|missing)$/.test(dpe)) out.dpe = dpe;
  const couleur = params.get('couleur');
  if (['m2', 'price', 'surface', 'iris'].includes(couleur))
    out.couleur = couleur === 'iris' ? 'm2' : couleur;
  return out;
};

const middle = values => {
  const sorted = [...values].sort((a, b) => a - b),
    i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

// Prix médian au m² par commune. Sous `minSales` ventes, la médiane n'est pas
// fiable : la commune est signalée et classée après les autres.
const communeRanking = (rows, minSales = 10) => {
  const byTown = new Map();
  for (const r of rows) {
    if (!(r.surface > 0) || !Number.isFinite(r.price)) continue;
    if (!byTown.has(r.code)) byTown.set(r.code, { code: r.code, town: r.town, m2: [] });
    byTown.get(r.code).m2.push(r.price / r.surface);
  }
  return [...byTown.values()]
    .map(t => ({
      code: t.code,
      town: t.town,
      count: t.m2.length,
      median: middle(t.m2),
      reliable: t.m2.length >= minSales,
    }))
    .sort((a, b) => b.reliable - a.reliable || b.median - a.median);
};

// Écart (en %) du prix au m² de l'estimation à la médiane locale.
const gapToMedian = (pricePerM2, medianPerM2) =>
  pricePerM2 > 0 && medianPerM2 > 0 ? ((pricePerM2 - medianPerM2) / medianPerM2) * 100 : null;

// Prix médian au m² par mois (« 2025-07 »). Un mois de moins de `minSales` ventes
// reste dans la série mais n'est pas fiable : il n'est pas relié sur la courbe.
const monthlyMedian = (rows, minSales = 10) => {
  const byMonth = new Map();
  for (const r of rows) {
    const month = /^(\d{4}-\d{2})/.exec(r.date ?? '')?.[1];
    if (!month || !(r.surface > 0) || !Number.isFinite(r.price)) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r.price / r.surface);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, values]) => ({
      month,
      count: values.length,
      median: middle(values),
      reliable: values.length >= minSales,
    }));
};

// « 2025-07 » -> « juil. 2025 ».
const frMonth = month => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const names = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ];
  return match ? `${names[Number(match[2]) - 1]} ${match[1]}` : String(month);
};

// Historique local des estimations : lecture tolérante (le contenu du navigateur
// peut être absent, ancien ou modifié) et ajout borné, le plus récent d'abord.
const HISTORY_MAX = 10;
const validEntry = e =>
  e &&
  typeof e === 'object' &&
  typeof e.query === 'string' &&
  parseShare(e.query) !== null &&
  typeof e.town === 'string' &&
  e.town.length <= 80 &&
  typeof e.at === 'string' &&
  !Number.isNaN(Date.parse(e.at)) &&
  [e.surface, e.rooms, e.point, e.low, e.high].every(Number.isFinite);
const parseHistory = raw => {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(validEntry).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
};
// Une estimation du même bien (même requête) remplace la précédente.
const addHistory = (list, entry) =>
  [entry, ...list.filter(e => e.query !== entry.query)].slice(0, HISTORY_MAX);

// Lignes de comparaison de deux estimations conservées.
const compareEntries = (a, b) => {
  const perM2 = e => e.point / e.surface;
  return {
    point: variation(a.point, b.point),
    perM2: variation(perM2(a), perM2(b)),
    surface: b.surface - a.surface,
    rooms: b.rooms - a.rooms,
  };
};

// Carte schématique des communes (hero) : projection plate corrigée de la latitude,
// rayon proportionnel à la racine du nombre de ventes, étiquette pour les plus actives.
const constellation = (towns, { width = 300, height = 420, pad = 28, labels = 1 } = {}) => {
  const valid = towns.filter(t => Number.isFinite(t.lat) && Number.isFinite(t.lon));
  if (!valid.length) return [];
  const lats = valid.map(t => t.lat),
    lons = valid.map(t => t.lon),
    minLat = Math.min(...lats),
    maxLat = Math.max(...lats),
    minLon = Math.min(...lons),
    maxLon = Math.max(...lons),
    cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180),
    spanX = Math.max((maxLon - minLon) * cos, 1e-6),
    spanY = Math.max(maxLat - minLat, 1e-6),
    scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY),
    offsetX = (width - spanX * scale) / 2,
    offsetY = (height - spanY * scale) / 2,
    busiest = [...valid].sort((a, b) => b.n - a.n).slice(0, labels);
  return valid.map(t => ({
    code: t.code,
    name: t.name,
    x: offsetX + (t.lon - minLon) * cos * scale,
    y: offsetY + (maxLat - t.lat) * scale,
    r: 3 + Math.sqrt(Math.max(t.n, 0)) * 0.52,
    hub: t === busiest[0],
    label: busiest.includes(t),
  }));
};

// Échappement HTML pour tout texte inséré dans un gabarit.
const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Charte : espace fine insécable (U+202F) avant € et entre les milliers.
const narrow = text => text.replace(/\u00a0/g, '\u202f');
const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const integers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const money = value => narrow(euros.format(value));
const num = value => narrow(integers.format(value));
const dec = value => narrow(decimals.format(value));

// Prix arrondi au millier : l'estimation n'est pas plus précise que cela.
const roundMoney = value => money(Math.round(value / 1000) * 1000);

// Valeur affichée sur la carte et l'histogramme : prix au m², prix total ou surface.
const measure = (row, key) =>
  key === 'price' ? row.price : key === 'surface' ? row.surface : row.price / row.surface;

// Borne de classe d'un histogramme : une décimale en milliers, pour que deux bornes voisines
// restent distinctes.
const binEdge = value => (value >= 1000 ? dec(value / 1000) + 'k' : num(value));

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Échelle de couleurs continue : le domaine va du 5e au 95e centile, pour qu'une vente
// atypique n'écrase pas toute la palette.
const scaleDomain = (values, from = 0.05, to = 0.95) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { lo: at(from), hi: at(to) };
};

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
// Couleur (#rrggbb) d'une valeur sur une rampe de teintes, interpolées linéairement.
const rampColor = (value, domain, stops) => {
  const span = domain.hi - domain.lo,
    t = span > 0 ? Math.min(1, Math.max(0, (value - domain.lo) / span)) : 0.5,
    position = t * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(position)),
    a = hexToRgb(stops[i]),
    b = hexToRgb(stops[i + 1]),
    mix = a.map((channel, k) => Math.round(channel + (b[k] - channel) * (position - i)));
  return '#' + mix.map(c => c.toString(16).padStart(2, '0')).join('');
};

export {
  esc,
  money,
  roundMoney,
  measure,
  num,
  dec,
  binEdge,
  median,
  scaleDomain,
  rampColor,
  constellation,
  parseHistory,
  addHistory,
  compareEntries,
  monthlyMedian,
  frMonth,
  gapToMedian,
  communeRanking,
  marketQuery,
  parseMarket,
  scenarioFeatures,
  variation,
  frDate,
  frDateTime,
  precision,
  gauge,
  distance,
  nearestComparables,
  frDistance,
  shareQuery,
  parseShare,
};
