import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMarket } from '../public/js/format.js';
import { groupMarketZones } from '../public/js/market-zones.js';
import { decodeMarket } from '../public/js/store.js';

const market = decodeMarket(
  JSON.parse(readFileSync(new URL('../public/data/market.json', import.meta.url))),
);

test('les groupes couvrent les ventes filtrées à Grenoble et dans les autres communes', () => {
  for (const rows of [market, market.filter(row => row.code === '38169')]) {
    const { zones, bands } = groupMarketZones(rows, 'm2');
    assert.ok(zones.length > 1);
    assert.ok(bands.length > 0);
    assert.equal(
      zones.reduce((sum, zone) => sum + zone.count, 0),
      rows.length,
    );
    assert.ok(zones.every(zone => zone.count >= 10 && zone.median > 0));
  }
  assert.deepEqual(parseMarket('?couleur=iris'), { couleur: 'm2' });
});

test('les zones contiguës fusionnent et recalculent la médiane sur toutes leurs ventes', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({
    lat: 45.18,
    lon: 5.7 + i / 10000,
    surface: 20,
    price: i < 60 ? 40000 : 42000,
  }));
  const { zones } = groupMarketZones(rows, 'm2');
  assert.ok(zones.some(zone => zone.rectangles.length > 1));
  assert.equal(
    zones.reduce((sum, zone) => sum + zone.count, 0),
    80,
  );
  assert.equal(zones.find(zone => zone.count === 60)?.median, 2000);
  assert.equal(groupMarketZones(rows.slice(0, 9), 'm2').zones[0].median, null);
  assert.deepEqual(groupMarketZones([], 'm2'), { zones: [], bands: [] });
});
