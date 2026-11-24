import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/format.js';

const {
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
