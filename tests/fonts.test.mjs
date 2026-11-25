import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Deux familles hébergées (aucun appel à un service de polices externe, aucune police mono).
const read = path => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');

test('fonts are self-hosted: no external font service in pages or styles', () => {
  for (const page of ['index.html', 'admin.html', 'my-requests.html', 'credits.html'])
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(page)), page);
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read('style.css')));
});

test('the two font families are declared with existing files', () => {
  const css = read('style.css');
  const families = [
    ...css.matchAll(/@font-face\s*{[^}]*font-family:\s*'([^']+)'[^}]*url\('([^']+)'\)/g),
  ];
  assert.deepEqual(families.map(f => f[1]).sort(), ['Inter', 'Plus Jakarta Sans']);
  for (const [, , file] of families)
    assert.ok(existsSync(new URL(`../public/${file}`, import.meta.url)), file);
  assert.ok(existsSync(new URL('../public/fonts/LICENSE.txt', import.meta.url)));
});

test('the interface no longer uses the monospace family', () => {
  for (const file of ['style.css', 'app.js', 'estimate.js', 'market.js', 'history.js'])
    assert.ok(!read(file).includes('font-family-mono'), file);
});
