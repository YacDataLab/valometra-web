import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/enrichment.js', import.meta.url), 'utf8');
const bundled = JSON.parse(readFileSync(new URL('../public/filosofi.json', import.meta.url)));
const preprocessing = JSON.parse(readFileSync(new URL('../public/preprocessing.json', import.meta.url)));
const first = '381850101';
const second = '381850102';
const data = {
  commune: '38185',
  provenance: { fixture: true },
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

function harness({ irisByBan, readFilosofi }) {
  const nodes = new Map();
  const createElement = () => ({
    value: '', dataset: {}, listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    dispatchEvent(event) { this.listeners[event.type]?.(event); },
    replaceChildren() {}, append() {},
  });
  const node = id => {
    if (id.startsWith('extra-')) return null;
    if (!nodes.has(id)) nodes.set(id, createElement());
    return nodes.get(id);
  };
  const window = { dispatchEvent() {} };
  let reads = 0;
  runInNewContext(source, {
    window, document: { getElementById: node, createElement },
    AbortController, AbortSignal, URLSearchParams, Event, CustomEvent: Event, setTimeout, clearTimeout,
    async fetch(url) {
      if (url === 'filosofi.json') {
        reads++;
        return { ok: true, json: readFilosofi };
      }
      const params = new URL(url).searchParams;
      if (url.includes('api.bdnb.io')) {
        const ban = params.get('cle_interop_adr').slice(3);
        return { ok: true, json: async () => (irisByBan[ban] ?? []).map((iris, index) => ({
          cle_interop_adr: ban, batiment_groupe_id: String(index), code_iris: iris,
        })) };
      }
      const ban = params.get('qs').split('"')[1];
      return { ok: true, json: async () => ({ results: [{
        identifiant_ban: ban, type_batiment: 'appartement', numero_dpe: 'DPE-TEST',
        date_etablissement_dpe: '2025-01-01', surface_habitable_logement: 65, etiquette_dpe: 'C',
      }] }) };
    },
  });
  const enrichment = window.ValometraEnrichment;
  return {
    node, enrichment, reads: () => reads,
    lookup: (ban, code = '38185') => enrichment.lookup({ ban, code }),
    select(index) {
      node('building-choice').value = index;
      node('building-choice').dispatchEvent(new Event('change'));
    },
    features() {
      return Object.fromEntries(Object.entries(enrichment.getFeatures()).filter(([key]) => key.startsWith('insee_')));
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
    insee_code_iris: first, insee_niveau_vie_median: 24000,
    insee_taux_pauvrete: 0, insee_rapport_interdecile: 3.5,
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

test('unknown or out-of-scope IRIS and shipped unverified data omit all Filosofi features', async () => {
  const h = harness({ irisByBan: { unknown: ['381859999'], outside: ['384210101'], missing: [null], g: [first] }, readFilosofi: async () => data });
  for (const [ban, code] of [['outside'], ['missing'], ['g', '38421']]) {
    await h.lookup(ban, code);
    assert.deepEqual(h.features(), {});
  }
  assert.equal(h.reads(), 0);
  await h.lookup('unknown');
  await tick();
  assert.deepEqual(h.features(), {});
  const shipped = harness({ irisByBan: { g: [first] }, readFilosofi: async () => bundled });
  await shipped.lookup('g');
  await tick();
  assert.deepEqual(shipped.features(), {});
  const offline = harness({ irisByBan: { g: [first] }, readFilosofi: async () => { throw Error('offline'); } });
  await offline.lookup('g');
  await tick();
  assert.deepEqual(offline.features(), {});
  assert.equal(offline.enrichment.isBusy(), false);
});

test('a rapid address or building change discards stale Filosofi responses', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const h = harness({ irisByBan: { old: [first], next: [first, second], outside: ['384210101'] }, readFilosofi: () => pending });
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
