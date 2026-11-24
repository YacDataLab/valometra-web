import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/config.js';
import '../public/format.js';

const {
  scenarioFeatures,
  monthlyMedian,
  frMonth,
  gapToMedian,
  communeRanking,
  marketQuery,
  parseMarket,
  variation,
  frDate,
  precision,
  gauge,
  distance,
  nearestComparables,
  frDistance,
  shareQuery,
  parseShare,
} = globalThis.ValometraFormat;

test('dates are shown day first', () => {
  assert.equal(frDate('2026-06-30'), '30/06/2026');
  assert.equal(frDate('2025-07-01T10:00:00Z'), '01/07/2025');
  assert.equal(frDate(''), '');
  assert.equal(frDate(undefined), '');
  assert.equal(frDate('n/a'), 'n/a');
});

test('precision level follows the relative width of the 80 % range', () => {
  assert.deepEqual(precision(100, [80, 130]).label, 'Resserrée');
  assert.equal(precision(100, [80, 130]).bars, 3);
  assert.equal(precision(100, [60, 140]).label, 'Moyenne');
  assert.equal(precision(100, [50, 160]).label, 'Large');
  assert.equal(precision(100, [50, 160]).bars, 1);
  // Reference case of the regression test: width is about 82 % of the estimate.
  assert.equal(precision(154751.86, [102860.96, 230167.53]).label, 'Moyenne');
});

test('precision is unavailable for invalid input', () => {
  assert.equal(precision(0, [1, 2]), null);
  assert.equal(precision(100, [NaN, 2]), null);
  assert.equal(precision(100, undefined), null);
});

test('gauge places the estimate and the central range on the extended range', () => {
  assert.deepEqual(gauge(150, [125, 175], [100, 200]), { low: 25, high: 75, point: 50 });
  // Valeurs hors échelle : ramenées aux extrémités.
  assert.equal(gauge(250, [50, 300], [100, 200]).point, 100);
  assert.equal(gauge(250, [50, 300], [100, 200]).low, 0);
  assert.equal(gauge(1, [1, 2], [5, 5]), null);
  assert.equal(gauge(NaN, [1, 2], [0, 5]), null);
  assert.equal(gauge(3, undefined, [0, 5]), null);
});

test('distance and readable distance', () => {
  const grenoble = { lat: 45.188, lon: 5.724 };
  assert.equal(Math.round(distance(grenoble, grenoble)), 0);
  // 0,01° de latitude ≈ 1 112 m.
  const d = distance(grenoble, { lat: 45.198, lon: 5.724 });
  assert.ok(d > 1100 && d < 1125);
  assert.equal(frDistance(123), '120 m');
  assert.equal(frDistance(1450), '1,4 km');
});

test('nearest comparables stay in the commune, near the surface, sorted by distance', () => {
  const target = { code: '38185', surface: 60, lat: 45.188, lon: 5.724 };
  const rows = [
    { code: '38185', surface: 60, lat: 45.19, lon: 5.724, price: 1 },
    { code: '38185', surface: 62, lat: 45.1885, lon: 5.724, price: 2 },
    { code: '38185', surface: 100, lat: 45.1881, lon: 5.724, price: 3 },
    { code: '38421', surface: 60, lat: 45.1881, lon: 5.724, price: 4 },
    { code: '38185', surface: 60, lat: null, lon: null, price: 5 },
  ];
  const result = nearestComparables(rows, target, 5);
  assert.deepEqual(
    result.map(r => r.price),
    [2, 1],
  );
  assert.equal(nearestComparables(rows, target, 1).length, 1);
});

test('share link keeps only valid typed fields and never carries a DPE', () => {
  const query = shareQuery({
    adresse: '12 Rue Lesdiguières 38000 Grenoble',
    surface: 65,
    pieces: 3,
    definition: 'carrez',
    carrez: '',
    dpe: 'G',
  });
  assert.ok(!query.includes('dpe'));
  assert.ok(!query.includes('carrez='));
  assert.deepEqual(parseShare(query), {
    adresse: '12 Rue Lesdiguières 38000 Grenoble',
    surface: 65,
    pieces: 3,
    definition: 'carrez',
  });
});

test('share link rejects incomplete or out-of-range values', () => {
  assert.equal(parseShare(''), null);
  assert.equal(parseShare('adresse=x&surface=65'), null);
  assert.equal(parseShare('adresse=x&surface=5000&pieces=3'), null);
  assert.equal(parseShare('adresse=x&surface=abc&pieces=3'), null);
  assert.deepEqual(parseShare('adresse=x&surface=65&pieces=3&definition=hack&annee=1'), {
    adresse: 'x',
    surface: 65,
    pieces: 3,
  });
});

test('scenario changes only what is asked and leaves the base untouched', () => {
  const base = {
    surface_habitable: '60',
    surface_carrez: '58',
    nb_pieces: '3',
    nb_dependances: '0',
    code_commune: '38185',
  };
  const next = scenarioFeatures(base, { surface: 66, rooms: 4, dependencies: 1 });
  assert.equal(next.surface_habitable, '66');
  assert.equal(next.surface_carrez, '63.8');
  assert.equal(next.nb_pieces, '4');
  assert.equal(next.nb_dependances, '1');
  assert.equal(next.code_commune, '38185');
  assert.equal(base.surface_habitable, '60');
  assert.deepEqual(scenarioFeatures(base, {}), base);
});

test('scenario DPE replaces the label and drops stale DPE details', () => {
  const base = { dpe_etiquette_energie: 'G', dpe_conso_ep_m2: '450', dpe_disponible: 1 };
  const next = scenarioFeatures(base, { dpe: 'C' });
  assert.deepEqual(next, {
    dpe_etiquette_energie: 'C',
    dpe_type: 'existant',
    dpe_disponible: 1,
  });
  const noDpe = scenarioFeatures({ nb_pieces: '2' }, { dpe: 'B' });
  assert.equal(noDpe.dpe_etiquette_energie, 'B');
  assert.equal(noDpe.dpe_disponible, 1);
});

test('variation gives the gap in euros and percent', () => {
  assert.deepEqual(variation(100000, 110000), { euros: 10000, percent: 10 });
  assert.equal(variation(0, 5), null);
  assert.equal(variation(100, NaN), null);
});

test('market filters go to the URL without default values', () => {
  const params = marketQuery({
    commune: '38185',
    smin: 40,
    smax: '',
    du: '2025-07-01',
    au: '2026-03-31',
    dpe: 'missing',
    couleur: 'm2',
  });
  assert.equal(params.get('commune'), '38185');
  assert.equal(params.get('du'), null);
  assert.equal(params.get('smax'), null);
  assert.equal(params.get('au'), '2026-03-31');
  assert.equal(params.get('couleur'), 'm2');
});

test('market filters are read back and invalid values are ignored', () => {
  assert.deepEqual(
    parseMarket('commune=38185&smin=40&pmax=300000&dpe=G&couleur=price&du=2025-09-01'),
    {
      commune: '38185',
      smin: 40,
      pmax: 300000,
      dpe: 'G',
      couleur: 'price',
      du: '2025-09-01',
    },
  );
  assert.deepEqual(
    parseMarket('commune=abc&smin=-5&pmax=x&dpe=Z&couleur=evil&du=2025-13-45&au=hier'),
    {},
  );
  assert.deepEqual(parseMarket(''), {});
});

test('commune ranking sorts by median price per m² and sets small samples last', () => {
  const sale = (code, town, surface, price) => ({ code, town, surface, price });
  const rows = [
    sale('A', 'Alpha', 50, 100000),
    sale('A', 'Alpha', 50, 110000),
    sale('A', 'Alpha', 50, 120000),
    sale('B', 'Beta', 50, 150000),
    sale('B', 'Beta', 50, 160000),
    sale('B', 'Beta', 50, 170000),
    sale('C', 'Gamma', 50, 400000),
    sale('Z', 'Zéro', 0, 1),
  ];
  const ranking = communeRanking(rows, 3);
  assert.deepEqual(
    ranking.map(r => [r.town, r.count, r.median, r.reliable]),
    [
      ['Beta', 3, 3200, true],
      ['Alpha', 3, 2200, true],
      ['Gamma', 1, 8000, false],
    ],
  );
  assert.deepEqual(communeRanking([]), []);
});

test('gap to the local median', () => {
  assert.equal(Math.round(gapToMedian(2381, 2271) * 10) / 10, 4.8);
  assert.equal(gapToMedian(2000, 2500), -20);
  assert.equal(gapToMedian(2000, null), null);
  assert.equal(gapToMedian(0, 2500), null);
});

test('monthly median is sorted and flags months with few sales', () => {
  const sale = (date, price) => ({ date, surface: 50, price });
  const rows = [
    sale('2025-08-10', 100000),
    sale('2025-08-11', 120000),
    sale('2025-07-02', 90000),
    sale('2025-07-03', 110000),
    sale('2025-07-04', 130000),
    { date: 'n/a', surface: 50, price: 1 },
  ];
  const series = monthlyMedian(rows, 3);
  assert.deepEqual(
    series.map(m => [m.month, m.count, m.median, m.reliable]),
    [
      ['2025-07', 3, 2200, true],
      ['2025-08', 2, 2200, false],
    ],
  );
  assert.deepEqual(monthlyMedian([]), []);
});

test('month label is in French', () => {
  assert.equal(frMonth('2025-07'), 'juil. 2025');
  assert.equal(frMonth('2026-06'), 'juin 2026');
  assert.equal(frMonth('x'), 'x');
});
