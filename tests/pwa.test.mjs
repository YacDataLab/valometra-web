import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const url = path => new URL(`../public/${path}`, import.meta.url);
const manifest = JSON.parse(readFileSync(url('manifest.json'), 'utf8'));

test('the manifest describes an installable app with existing icons', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'fr');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url);
  const sizes = manifest.icons.map(icon => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const icon of manifest.icons) assert.ok(existsSync(url(icon.src)), icon.src);
});

test('the index page links the manifest', () => {
  assert.match(
    readFileSync(url('index.html'), 'utf8'),
    /<link rel="manifest" href="manifest.json">/,
  );
});

test('the service worker never touches the API or the private pages', () => {
  const worker = readFileSync(url('sw.js'), 'utf8');
  for (const path of ['/api/', '/gestion', '/mes-demandes'])
    assert.ok(worker.includes(`'${path}'`), path);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.origin !== self\.location\.origin/);
});
