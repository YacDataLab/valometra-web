import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { historicalIris } from '../public/js/iris.js';
import { config } from '../public/js/config.js';

const source = readFileSync(new URL('../public/js/enrichment.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export const addressData', 'window.ValometraEnrichment');
const bundled = JSON.parse(readFileSync(new URL('../public/data/filosofi.json', import.meta.url)));
const preprocessing = JSON.parse(
  readFileSync(new URL('../public/models/preprocessing.json', import.meta.url)),
);
const first = '381850101';
const second = '381850102';
const data = {
  commune: '38185',
  provenance: { iris_geography: '2022-01-01' },
  iris: {
    [first]: {
      insee_niveau_vie_median: 24000,
      insee_taux_pauvrete: 0,
      insee_niveau_vie_d9: null,
      insee_rapport_interdecile: 3.5,
    },
    [second]: { insee_niveau_vie_median: 31000 },
  },
};

const polygon = (x1, y1, x2, y2) => ({
  type: 'Polygon',
  crs: { properties: { name: 'EPSG:2154' } },
  coordinates: [
    [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1],
    ],
  ],
});
const contours = {
  crs: { properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
  features: [
    { properties: { CODE_IRIS: first }, geometry: polygon(0, 0, 100, 100) },
    { properties: { CODE_IRIS: second }, geometry: polygon(100, 0, 200, 100) },
  ],
};
const footprints = { [first]: polygon(10, 10, 20, 20), [second]: polygon(110, 10, 120, 20) };

function harness({ irisByBan, readFilosofi, footprintByBan = {} }) {
  const nodes = new Map();
  const createElement = () => ({
    value: '',
    dataset: {},
    listeners: {},
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    },
    dispatchEvent(event) {
      this.listeners[event.type]?.(event);
    },
    replaceChildren() {},
    append() {},
  });
  const node = id => {
    if (id.startsWith('extra-')) return null;
    if (!nodes.has(id)) nodes.set(id, createElement());
    return nodes.get(id);
  };
  const window = { dispatchEvent() {} };
  let reads = 0;
  runInNewContext(source, {
    window,
    config,
    historicalIris,
    $: node,
    syncChoice() {},
    document: { getElementById: node, createElement },
    AbortController,
    AbortSignal,
    URLSearchParams,
    Event,
    CustomEvent: Event,
    setTimeout,
    clearTimeout,
    async fetch(url) {
      if (url === 'data/iris-grenoble-2022.geojson')
        return { ok: true, json: async () => contours };
      if (url === 'data/filosofi.json') {
        reads++;
        return { ok: true, json: readFilosofi };
      }
      const params = new URL(url).searchParams;
      if (url.includes('api.bdnb.io')) {
        const ban = params.get('cle_interop_adr').slice(3);
        return {
          ok: true,
          json: async () =>
            (irisByBan[ban] ?? []).map((iris, index) => ({
              cle_interop_adr: ban,
              batiment_groupe_id: String(index),
              code_iris: iris,
              geom_groupe: footprintByBan[ban] ?? footprints[iris],
            })),
        };
      }
      const ban = params.get('qs').split('"')[1];
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              identifiant_ban: ban,
              type_batiment: 'appartement',
              numero_dpe: 'DPE-TEST',
              date_etablissement_dpe: '2025-01-01',
              surface_habitable_logement: 65,
              etiquette_dpe: 'C',
            },
          ],
        }),
      };
    },
  });
  const enrichment = window.ValometraEnrichment;
  return {
    node,
    enrichment,
    reads: () => reads,
    lookup: (ban, code = '38185') => enrichment.lookup({ ban, code }),
    select(index) {
      node('building-choice').value = index;
      node('building-choice').dispatchEvent(new Event('change'));
    },
    features() {
      return Object.fromEntries(
        Object.entries(enrichment.getFeatures()).filter(([key]) => key.startsWith('insee_')),
      );
    },
  };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('Grenoble joins by string IRIS, preserves zero, skips masked indicators and caches JSON', async () => {
  const h = harness({ irisByBan: { g: [first] }, readFilosofi: async () => data });
  assert.equal(h.reads(), 0);
  await h.lookup('g');
  await tick();
  assert.deepEqual(h.features(), {
    insee_code_iris: first,
    insee_niveau_vie_median: 24000,
    insee_taux_pauvrete: 0,
    insee_rapport_interdecile: 3.5,
  });
  assert.equal(h.enrichment.getFeatures().bdnb_code_iris, first);
  assert.equal(h.enrichment.getFeatures().dpe_etiquette_energie, undefined);
  h.node('dpe-choice').value = '0';
  h.node('dpe-choice').dispatchEvent(new Event('change'));
  h.node('dpe-confirm-button').dispatchEvent(new Event('click'));
  assert.equal(h.enrichment.getFeatures().dpe_etiquette_energie, 'C');
  assert.ok(preprocessing.categorical_features.includes('insee_code_iris'));
  for (const field of Object.keys(data.iris[first])) {
    assert.ok(preprocessing.features.includes(field));
    assert.ok(Number.isFinite(preprocessing.numeric_medians[field]));
  }
  await h.lookup('g');
  await tick();
  assert.equal(h.reads(), 1);
});

test('unknown or out-of-scope IRIS and missing provenance omit all Filosofi features', async () => {
  const h = harness({
    irisByBan: { unknown: ['381859999'], outside: ['384210101'], missing: [null], g: [first] },
    readFilosofi: async () => data,
  });
  for (const [ban, code] of [['outside'], ['missing'], ['g', '38421']]) {
    await h.lookup(ban, code);
    assert.deepEqual(h.features(), {});
  }
  assert.equal(h.reads(), 0);
  await h.lookup('unknown');
  await tick();
  assert.deepEqual(h.features(), {});
  const shipped = harness({
    irisByBan: { g: [first] },
    readFilosofi: async () => ({ ...bundled, provenance: null }),
  });
  await shipped.lookup('g');
  await tick();
  assert.deepEqual(shipped.features(), {});
  const offline = harness({
    irisByBan: { g: [first] },
    readFilosofi: async () => {
      throw Error('offline');
    },
  });
  await offline.lookup('g');
  await tick();
  assert.deepEqual(offline.features(), {});
  assert.equal(offline.enrichment.isBusy(), false);
});

test('a rapid address or building change discards stale Filosofi responses', async () => {
  let resolve;
  const pending = new Promise(done => {
    resolve = done;
  });
  const h = harness({
    irisByBan: { old: [first], next: [first, second], outside: ['384210101'] },
    readFilosofi: () => pending,
  });
  await h.lookup('old');
  assert.equal(h.enrichment.isBusy(), true);
  await h.lookup('next');
  h.select('0');
  h.select('1');
  assert.deepEqual(h.features(), {});
  resolve(data);
  await tick();
  assert.deepEqual(h.features(), { insee_code_iris: second, insee_niveau_vie_median: 31000 });
  h.select('');
  assert.deepEqual(h.features(), {});
  await h.lookup('old');
  await h.lookup('outside', '38421');
  await tick();
  assert.deepEqual(h.features(), {});
});

test('the Grenoble footprint and BDNB code must agree and avoid boundaries', async () => {
  const h = harness({
    irisByBan: { wrong: [first], shared: [first], g: [first] },
    footprintByBan: { wrong: footprints[second], shared: polygon(95, 10, 105, 20) },
    readFilosofi: async () => data,
  });
  for (const ban of ['wrong', 'shared', 'g']) {
    await h.lookup(ban);
    await tick();
    assert.deepEqual(
      h.features(),
      ban === 'g'
        ? {
            insee_code_iris: first,
            insee_niveau_vie_median: 24000,
            insee_taux_pauvrete: 0,
            insee_rapport_interdecile: 3.5,
          }
        : {},
    );
  }
});

test('published INSEE values and IGN contours cover the same 70 codes', () => {
  const published = JSON.parse(
    readFileSync(new URL('../public/data/iris-grenoble-2022.geojson', import.meta.url)),
  );
  const codes = published.features.map(feature => feature.properties.CODE_IRIS).sort();
  assert.equal(codes.length, 70);
  assert.deepEqual(Object.keys(bundled.iris).sort(), codes);
  assert.equal(bundled.provenance.iris_geography, '2022-01-01');
});

test('a diagonal footprint can fit an IRIS even when its rectangle crosses the limit', () => {
  const diagonalDistrict = structuredClone(contours);
  diagonalDistrict.features = [
    {
      properties: { CODE_IRIS: first },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [100, 0],
            [0, 100],
            [0, 0],
          ],
        ],
      },
    },
  ];
  const building = polygon(0, 0, 1, 1);
  building.coordinates = [
    [
      [15, 65],
      [65, 15],
      [68, 18],
      [18, 68],
      [15, 65],
    ],
  ];
  assert.equal(historicalIris(building, diagonalDistrict), first);
  assert.equal(historicalIris(polygon(40, 40, 60, 60), diagonalDistrict), null);
});

test('touching a boundary or enclosing an IRIS enclave is rejected', () => {
  const district = structuredClone(contours);
  district.features[0].geometry.coordinates.push(polygon(40, 40, 50, 50).coordinates[0]);
  assert.equal(historicalIris(polygon(80, 10, 100, 20), district), null);
  assert.equal(historicalIris(polygon(30, 30, 60, 60), district), null);
  assert.equal(historicalIris(polygon(30, 30, 39, 39), district), first);
});
