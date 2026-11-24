import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import '../public/config.js';

const config = globalThis.ValometraConfig;
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../public/index.html');

test('the number of covered towns matches the metadata', () => {
  const { towns } = JSON.parse(read('../public/metadata.json'));
  assert.equal(towns.length, config.townCount);
  assert.ok(html.includes(`${config.townCount} communes`));
});

test('the reference date is the same everywhere in the page', () => {
  assert.ok(html.includes(config.referenceLabel));
  assert.ok(html.includes(`max="${config.referenceDate}"`));
  assert.ok(html.includes(`value="${config.referenceDate}"`));
  assert.ok(html.includes(`value="${config.marketStart}"`));
});

test('the measured coverage figures are the ones shown on the method page', () => {
  assert.ok(html.includes(`${config.coverage[80]} %`));
  assert.ok(html.includes(`${config.coverage[50]} %`));
});

test('the model days feature matches the reference date', () => {
  const days = (Date.parse(config.referenceDate) - Date.parse('2025-01-01')) / 86400000;
  assert.equal(config.daysSince2025, days);
});
