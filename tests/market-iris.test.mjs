import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMarket } from '../public/js/format.js';
import { createIrisSummary } from '../public/js/market-iris.js';
import { decodeMarket } from '../public/js/store.js';

const contours = JSON.parse(
  readFileSync(new URL('../public/data/iris-grenoble-carte.geojson', import.meta.url)),
);
const market = decodeMarket(
  JSON.parse(readFileSync(new URL('../public/data/market.json', import.meta.url))),
);

test('les zones utilisent la médiane au m² du lot filtré', () => {
  const summarize = createIrisSummary(contours);
  const first = market[0];
  const rows = Array.from({ length: 10 }, (_, i) => ({
    ...first,
    surface: 20,
    price: 20000 + i * 2000,
  }));
  const unrelated = { ...first, code: '99999' };
  const invalid = { ...first, surface: 0 };
  const full = [...summarize([...rows, unrelated, invalid]).values()];
  assert.deepEqual(full, [{ count: 10, median: 1450 }]);
  assert.deepEqual([...summarize(rows.slice(0, 9)).values()], [{ count: 9, median: null }]);
  assert.deepEqual(summarize([]), new Map());
});

test('les ventes réelles couvrent Grenoble et la couche peut être partagée', () => {
  const districts = [...createIrisSummary(contours)(market).values()];
  assert.equal(contours.features.length, 70);
  assert.ok(districts.filter(district => district.median !== null).length > 40);
  assert.deepEqual(parseMarket('?couleur=iris'), { couleur: 'iris' });
});
