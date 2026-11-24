import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../public/format.js';

const { frDate, precision } = globalThis.ValometraFormat;

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
