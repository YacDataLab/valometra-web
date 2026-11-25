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

test('every pictogram used by the pages or the scripts exists in the SVG sprite', () => {
  const sprite = readFileSync(new URL('../public/icons.svg', import.meta.url), 'utf8');
  const symbols = new Set([...sprite.matchAll(/<symbol id="(i-[\w-]+)"/g)].map(m => m[1]));
  assert.ok(symbols.size >= 10);
  const scripts = ['estimate.js', 'theme.js'].map(f =>
    readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8'),
  );
  const sources = [...pages.map(read), ...scripts];
  const used = [
    ...sources.flatMap(source => [...source.matchAll(/icons\.svg#(i-[\w-]+)/g)].map(m => m[1])),
    ...scripts[0].matchAll(/icon\('([\w-]+)'/g).map(m => 'i-' + m[1]),
  ];
  assert.ok(used.length > 5);
  assert.deepEqual(
    [...new Set(used)].filter(id => !symbols.has(id)),
    [],
  );
});

// Navigation : les quatre pages partagent le même en-tête et le même pied de page.
const chrome = (html, tag) => {
  const block = html.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))[0];
  return block
    .replace(/ aria-current="page"/g, '')
    .replace(/ hidden/g, '')
    .replace(/href="\/?#/g, 'href="#');
};

test('header and footer are identical on every page (links to the app views are normalised)', () => {
  for (const tag of ['header', 'footer'])
    for (const name of pages.slice(1))
      assert.equal(chrome(read(name), tag), chrome(read('index'), tag), `${name} ${tag}`);
});

test('secondary pages reach the app views through absolute links', () => {
  for (const name of pages.slice(1))
    for (const view of ['estimate', 'market', 'method'])
      assert.ok(read(name).includes(`href="/#${view}"`), `${name} #${view}`);
});

test('every internal link of the index points to an existing view, id or page', () => {
  const html = read('index');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const [, href] of html.matchAll(/<a\b[^>]*\shref="(#[^"]*)"/g))
    assert.ok(ids.has(href.slice(1)), href);
  for (const [, href] of html.matchAll(/<a\b[^>]*\shref="\/([\w.-]+)"/g))
    if (href.endsWith('.html')) assert.ok(pages.includes(href.replace('.html', '')), href);
});

test('the footer exposes the private area link only to managers, and marks the current page', () => {
  assert.match(read('index'), /<a id="admin-link" href="\/gestion" hidden>/);
  assert.match(read('admin'), /<a id="admin-link" href="\/gestion" aria-current="page">/);
  assert.match(read('my-requests'), /href="\/mes-demandes" aria-current="page"/);
  assert.match(read('credits'), /href="\/credits.html" aria-current="page"/);
});
