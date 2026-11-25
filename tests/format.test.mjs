import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as format from '../public/format.js';
import { readFileSync } from 'node:fs';
import { decodeMarket } from '../public/store.js';

const {
  scenarioFeatures,
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
  esc,
  money,
  num,
  dec,
  binEdge,
  median,
  scaleDomain,
  rampColor,
} = format;

test('dates are shown day first', () => {
  assert.equal(frDate('2026-06-30'), '30/06/2026');
  assert.equal(frDate('2025-07-01T10:00:00Z'), '01/07/2025');
  // Date et heure : format français (jour/mois/année), l'heure dépend du fuseau de la machine.
  assert.match(frDateTime('2026-06-30T10:00:00Z'), /^30\/06\/2026 \d{2}:00:00$/);
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

test('gauge places the estimate on the displayed range', () => {
  assert.equal(gauge(150, [100, 200]), 50);
  // Valeurs hors échelle : ramenées aux extrémités.
  assert.equal(gauge(250, [100, 200]), 100);
  assert.equal(gauge(50, [100, 200]), 0);
  assert.equal(gauge(1, [5, 5]), null);
  assert.equal(gauge(NaN, [0, 5]), null);
  assert.equal(gauge(3, undefined), null);
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

const entry = (n, overrides = {}) => ({
  at: '2026-11-25T10:00:00.000Z',
  query: shareQuery({ adresse: `${n} rue Test 38000 Grenoble`, surface: 60 + n, pieces: 3 }),
  town: 'Grenoble',
  surface: 60 + n,
  rooms: 3,
  point: 150000 + n * 1000,
  low: 100000,
  high: 200000,
  ...overrides,
});

test('history reading ignores corrupted storage and invalid entries', () => {
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory('{pas du json'), []);
  assert.deepEqual(parseHistory('{"a":1}'), []);
  const raw = JSON.stringify([entry(1), { query: 'x' }, entry(2, { point: 'cher' }), entry(3)]);
  assert.deepEqual(
    parseHistory(raw).map(e => e.surface),
    [61, 63],
  );
});

test('history keeps the 10 most recent and replaces the same property', () => {
  let list = [];
  for (let n = 1; n <= 12; n++) list = addHistory(list, entry(n));
  assert.equal(list.length, 10);
  assert.equal(list[0].surface, 72);
  const again = addHistory(list, entry(5, { point: 999999 }));
  assert.equal(again.length, 10);
  assert.equal(again[0].point, 999999);
  assert.equal(again.filter(e => e.surface === 65).length, 1);
});

test('comparison gives the gaps between two estimates', () => {
  const a = entry(0, { point: 150000 });
  const b = entry(10, { point: 180000, surface: 70, rooms: 4 });
  const gap = compareEntries(a, b);
  assert.equal(gap.point.euros, 30000);
  assert.equal(gap.point.percent, 20);
  assert.equal(gap.surface, 10);
  assert.equal(gap.rooms, 1);
  assert.ok(Math.abs(gap.perM2.percent - 2.857) < 0.01);
});

test('constellation places every town inside the frame, the busiest one as hub', () => {
  const towns = [
    { code: '1', name: 'Grand', lat: 45.18, lon: 5.72, n: 2450 },
    { code: '2', name: 'Nord', lat: 45.26, lon: 5.76, n: 5 },
    { code: '3', name: 'Sud', lat: 44.99, lon: 5.6, n: 8 },
    { code: '4', name: 'Est', lat: 45.2, lon: 5.84, n: 36 },
    { code: '5', name: 'Cassée', lat: null, lon: 5.7, n: 3 },
  ];
  const points = constellation(towns, { width: 300, height: 420, pad: 28, labels: 2 });
  assert.equal(points.length, 4);
  for (const p of points) {
    assert.ok(p.x >= 28 - 1e-9 && p.x <= 272 + 1e-9, `${p.name} x=${p.x}`);
    assert.ok(p.y >= 28 - 1e-9 && p.y <= 392 + 1e-9, `${p.name} y=${p.y}`);
  }
  assert.deepEqual(
    points.filter(p => p.hub).map(p => p.name),
    ['Grand'],
  );
  assert.deepEqual(
    points.filter(p => p.label).map(p => p.name),
    ['Grand', 'Est'],
  );
  const byName = Object.fromEntries(points.map(p => [p.name, p]));
  assert.ok(byName.Nord.y < byName.Sud.y);
  assert.ok(byName.Est.x > byName.Sud.x);
  assert.deepEqual(constellation([]), []);
});

test('esc neutralises markup and tolerates missing values', () => {
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
});

test('money, num and dec use French formats with narrow no-break spaces', () => {
  assert.equal(money(139201), '139\u202f201\u202f€');
  assert.equal(num(4620), '4\u202f620');
  assert.equal(dec(2.46), '2,5');
});

test('binEdge keeps neighbouring class edges distinct', () => {
  assert.equal(binEdge(889), '889');
  assert.equal(binEdge(1778), '1,8k');
  assert.equal(binEdge(2667), '2,7k');
});

test('median handles odd, even and empty lists', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test('scaleDomain ignores extreme values', () => {
  const values = [...Array(98).keys()].map(i => 100 + i).concat([1, 1_000_000]);
  const domain = scaleDomain(values);
  assert.ok(domain.lo >= 100 && domain.hi <= 197, JSON.stringify(domain));
  assert.equal(scaleDomain([]), null);
});

test('rampColor interpolates along the stops and clamps outside the domain', () => {
  const stops = ['#000000', '#ff0000', '#ffffff'];
  const domain = { lo: 0, hi: 10 };
  assert.equal(rampColor(-5, domain, stops), '#000000');
  assert.equal(rampColor(0, domain, stops), '#000000');
  assert.equal(rampColor(5, domain, stops), '#ff0000');
  assert.equal(rampColor(2.5, domain, stops), '#800000');
  assert.equal(rampColor(99, domain, stops), '#ffffff');
  assert.equal(rampColor(3, { lo: 4, hi: 4 }, stops), '#ff0000');
});

test('market data is stored in columns and decodes to one object per sale', () => {
  const data = JSON.parse(readFileSync(new URL('../public/market.json', import.meta.url), 'utf8'));
  assert.ok(data.rows.length > 0);
  assert.ok(data.rows.every(row => row.length === data.columns.length));
  const [sale] = decodeMarket({ columns: ['town', 'price'], rows: [['Grenoble', 55000]] });
  assert.deepEqual(sale, { town: 'Grenoble', price: 55000 });
  const decoded = decodeMarket(data);
  assert.equal(decoded.length, data.rows.length);
  assert.ok(data.columns.every(column => column in decoded[0]));
});
