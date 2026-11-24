'use strict';
// Fonctions d'affichage sans dépendance au DOM (testées dans tests/format.test.mjs).
(() => {
  // « 2026-06-30 » -> « 30/06/2026 » ; toute autre valeur est renvoyée telle quelle.
  const frDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? '');
  };

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

  // Positions (en %) de l'estimation et de la fourchette centrale sur l'échelle de la
  // fourchette étendue, pour la jauge du résultat.
  const gauge = (value, inner, outer) => {
    const valid = b => Array.isArray(b) && b.length === 2 && b.every(Number.isFinite);
    if (!Number.isFinite(value) || !valid(inner) || !valid(outer) || outer[1] <= outer[0])
      return null;
    const at = n => Math.min(100, Math.max(0, ((n - outer[0]) / (outer[1] - outer[0])) * 100));
    return { low: at(inner[0]), high: at(inner[1]), point: at(value) };
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
    du: ValometraConfig.marketStart,
    au: ValometraConfig.referenceDate,
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
    if (['m2', 'price', 'surface'].includes(couleur)) out.couleur = couleur;
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

  globalThis.ValometraFormat = {
    monthlyMedian,
    frMonth,
    gapToMedian,
    communeRanking,
    marketQuery,
    parseMarket,
    scenarioFeatures,
    variation,
    frDate,
    precision,
    gauge,
    distance,
    nearestComparables,
    frDistance,
    shareQuery,
    parseShare,
  };
})();
