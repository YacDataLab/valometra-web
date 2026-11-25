import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resultHtml } from '../public/js/result.js';
import { state } from '../public/js/store.js';

const input = {
  town: { code: '38185', name: 'Grenoble' },
  address: '10 rue <b>Test</b>',
  surface: 65,
  surfaceDefinition: 'habitable',
  features: { latitude: '45.19', longitude: '5.72', nb_pieces: '3', nb_dependances: '1' },
  enrichment: { building: true, dpe: false },
};
const intervals = { 50: [270000, 300000], 80: [250000, 330000] };
const market = [
  { code: '38185', surface: 60, price: 240000, date: '2026-05-01', lat: 45.19, lon: 5.72 },
  { code: '38185', surface: 70, price: 290000, date: '2026-04-01', lat: 45.2, lon: 5.73 },
  { code: '38421', surface: 65, price: 100000, date: '2026-04-01', lat: 45.1, lon: 5.7 },
];

test('the result shows the price, the chosen range and the local repères', () => {
  state.lastPrediction = { value: 285000, intervals };
  const html = resultHtml(285000, input, intervals, market);
  assert.match(html, /Grenoble · 65 m²|Grenoble · 65 m²/);
  assert.match(html, /Fourchette étendue · objectif 80 %/);
  assert.match(html, /class="gauge"/);
  assert.match(html, /Comparables<\/dt><dd>2</);
  assert.match(html, /id="simulate"/);
  assert.match(html, /id="feedback"/);
  assert.ok(!html.includes('Centrale 50 %'));
});

test('the result escapes the address typed by the visitor', () => {
  const html = resultHtml(285000, input, intervals, market);
  assert.ok(!html.includes('<b>Test</b>'));
  assert.ok(html.includes('&lt;b&gt;Test&lt;/b&gt;'));
});

test('the result still renders without comparable sales', () => {
  const html = resultHtml(285000, input, intervals, []);
  assert.match(html, /sans repère local/);
  assert.ok(!html.includes('Ventes comparables les plus proches'));
});

// Faux Worker du navigateur : répond « ready » puis une estimation par demande.
function installWorker(behaviour) {
  const created = [];
  globalThis.Worker = class {
    constructor() {
      created.push(this);
      this.terminated = false;
    }
    postMessage(message) {
      queueMicrotask(() => behaviour(this, message));
    }
    terminate() {
      this.terminated = true;
    }
  };
  return created;
}

test('the engine starts once, resolves each prediction by its own id and can be reset', async () => {
  const created = installWorker((worker, message) => {
    if (message.type === 'init') worker.onmessage({ data: { type: 'ready' } });
    else if (message.features.fail)
      worker.onmessage({ data: { type: 'error', message: 'boom', id: message.id } });
    else
      worker.onmessage({
        data: { type: 'prediction', id: message.id, value: message.features.value, intervals: {} },
      });
  });
  const { predict, resetEngine } = await import('../public/js/engine.js');
  const [a, b] = await Promise.all([predict({ value: 1 }), predict({ value: 2 })]);
  assert.deepEqual([a.value, b.value], [1, 2]);
  assert.equal(created.length, 1);
  await assert.rejects(predict({ fail: true }), /boom/);
  resetEngine();
  assert.ok(created[0].terminated);
  await predict({ value: 3 });
  assert.equal(created.length, 2);
  resetEngine();
});

test('a crash of the engine rejects the calculations in progress', async () => {
  installWorker((worker, message) => {
    if (message.type === 'init') worker.onmessage({ data: { type: 'ready' } });
    else worker.onerror();
  });
  const { predict } = await import('../public/js/engine.js');
  await assert.rejects(predict({ value: 1 }), /n’a pas pu démarrer/);
});
