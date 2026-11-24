import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Contrôles statiques d'accessibilité des pages HTML (structure, identifiants, libellés).
// Ils ne remplacent pas un essai au lecteur d'écran.
const pages = ['index', 'admin', 'my-requests', 'credits'];
const read = name => readFileSync(new URL(`../public/${name}.html`, import.meta.url), 'utf8');

for (const name of pages) {
  const html = read(name);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);

  test(`${name}.html : langue, titre et images décrites`, () => {
    assert.match(html, /<html[^>]*\slang="fr"/);
    assert.match(html, /<title>[^<]{3,}<\/title>/);
    for (const img of html.matchAll(/<img\b[^>]*>/g)) assert.match(img[0], /\salt="/, img[0]);
  });

  test(`${name}.html : identifiants uniques`, () => {
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual([...new Set(duplicates)], []);
  });

  test(`${name}.html : les références d'accessibilité pointent vers des éléments existants`, () => {
    const references = [
      ...[...html.matchAll(/\sfor="([^"]+)"/g)].map(m => m[1]),
      ...[...html.matchAll(/aria-(?:describedby|controls|labelledby)="([^"]+)"/g)].flatMap(m =>
        m[1].split(/\s+/),
      ),
    ];
    const missing = references.filter(id => !ids.includes(id));
    assert.deepEqual(missing, []);
  });
}

test("index.html : lien d'évitement et zone principale", () => {
  const html = read('index');
  assert.match(html, /<a class="skip-link" href="#contenu"/);
  assert.match(html, /<main[^>]*id="contenu"/);
  assert.equal([...html.matchAll(/<main\b/g)].length, 1);
  assert.ok(html.includes('aria-label="Navigation principale"'));
});

test("index.html : chaque page de l'application a un titre de niveau 1", () => {
  const html = read('index');
  for (const id of ['estimate', 'market', 'method']) {
    const start = html.indexOf(`<section id="${id}"`);
    assert.ok(start >= 0, id);
    const end = html.indexOf('</section>', start);
    assert.match(html.slice(start, end), /<h1[ >]/, id);
  }
});
