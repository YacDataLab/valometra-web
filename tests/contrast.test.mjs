import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Contraste WCAG 2.2 des paires (texte, fond) réellement utilisées par l'interface,
// dans les thèmes clair et sombre. Les jetons viennent de public/brand/tokens.css et
// des alias de public/style.css.
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const tokens = read('../public/brand/tokens.css');
const style = read('../public/style.css');

const declarations = (css, selectorStart) => {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, `bloc introuvable : ${selectorStart}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
};

const palette = declarations(tokens, ':root {');
const light = { ...palette, ...declarations(tokens, ':root,\n[data-md-color-scheme="default"]') };
const dark = { ...light, ...declarations(tokens, '[data-md-color-scheme="slate"]') };
const aliasLight = declarations(style, ':root {');
const aliasDark = declarations(style, ":root[data-vm-theme='sombre'] {");
const themes = {
  clair: { ...light, ...aliasLight },
  sombre: { ...dark, ...aliasLight, ...aliasDark },
};

const resolve = (theme, name, depth = 0) => {
  const value = themes[theme][name];
  assert.ok(value && depth < 10, `jeton introuvable : ${name} (${theme})`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  return ref ? resolve(theme, ref[1], depth + 1) : value;
};

const luminance = hex => {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const PAIRS = [
  ['--vm-texte', '--vm-surface'],
  ['--vm-texte', '--vm-fond'],
  ['--vm-texte-secondaire', '--vm-surface'],
  ['--vm-texte-secondaire', '--vm-fond'],
  ['--heading', '--vm-surface'],
  ['--heading', '--vm-fond'],
  ['--heading-soft', '--vm-surface'],
  ['--vm-lien', '--vm-surface'],
  ['--vm-lien', '--vm-fond'],
  ['--vm-action', '--vm-surface'],
  ['--vm-action', '--vm-fond'],
  ['--placeholder', '--vm-surface'],
  ['--vm-etat-erreur', '--vm-surface'],
  ['--vm-sur-action', '--vm-action'],
];

for (const theme of Object.keys(themes)) {
  test(`contraste du texte, thème ${theme} : au moins 4,5 : 1`, () => {
    const failures = [];
    for (const [fg, bg] of PAIRS) {
      const value = ratio(resolve(theme, fg), resolve(theme, bg));
      if (value < 4.5) failures.push(`${fg} sur ${bg} : ${value.toFixed(2)}`);
    }
    assert.deepEqual(failures, []);
  });
}
