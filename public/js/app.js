// Point d'entrée de la page d'accueil : navigation entre les vues, chargement des communes.
import { $ } from './dom.js';
import * as F from './format.js';
import { state, readJson, loadMarket } from './store.js';
import { loadLeaflet } from './map.js';
import { initMarket, showMarket, marketReady, renderMarket } from './market.js';
import { initEstimate } from './estimate.js';
import './history.js';
import './form-flow.js';

// Registre des vues : une entrée par <section class="page"> de index.html, dans le même ordre que la navigation.
// Ajouter une page : la section, son lien dans <nav class="site-nav">, puis une entrée ici.
// `prepare` charge les données avant l'affichage et `show` les affiche ; le lien de la vue est alors préchargé au survol.
const PAGES = {
  estimate: { title: 'Valometra — L’immobilier, en perspective' },
  market: {
    title: 'Le marché local — Valometra',
    prepare: () => Promise.all([loadMarket(), loadLeaflet()]),
    show: showMarket,
  },
  statistiques: {
    title: 'Statistiques du marché — Valometra',
    prepare: () => loadMarket(),
    show: renderMarket,
  },
  method: { title: 'Méthode et limites — Valometra' },
};

let navigation = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Retour arrière : chaque entrée d'historique garde sa position de défilement (en mémoire),
// et la vue revient à l'endroit où le visiteur l'avait laissée. Un lien neuf repart du haut.
history.scrollRestoration = 'manual';
const scrollByEntry = new Map();
let entryKey = null;
let routing = false;
window.addEventListener(
  'scroll',
  () => {
    if (!routing && entryKey) scrollByEntry.set(entryKey, window.scrollY);
  },
  { passive: true },
);

async function route(event) {
  const current = ++navigation;
  const hash = location.hash.slice(1);
  const id = Object.hasOwn(PAGES, hash) ? hash : 'estimate';
  // Position de la vue quittée, relevée avant que la page ne change de hauteur.
  if (entryKey) scrollByEntry.set(entryKey, window.scrollY);
  routing = true;
  entryKey = history.state?.key ?? `${Date.now()}-${Math.random()}`;
  const restore = scrollByEntry.get(entryKey);
  history.replaceState({ key: entryKey }, '', location.href);
  // Changement de vue : fondu entre les vues quand le navigateur le permet, sans mouvement
  // si le visiteur a demandé de réduire les animations.
  const update = () => {
    document.querySelectorAll('.page').forEach(element => {
      element.hidden = element.id !== id;
    });
    document.title = PAGES[id].title;
    document.querySelectorAll('.site-nav a[href^="#"]').forEach(link => {
      if (link.hash === '#' + id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.scrollTo(0, restore ?? 0);
    requestAnimationFrame(() => {
      routing = false;
    });
    // Sur téléphone, la barre de navigation défile : la vue active reste visible.
    document
      .querySelector('.site-nav [aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
    // Navigation au clavier ou au lecteur d'écran : le focus suit le titre de la page,
    // et une annonce brève indique la vue ouverte.
    if (event?.type === 'hashchange') {
      const heading = document.querySelector('.page:not([hidden]) h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      $('route-status').textContent =
        'Vue ouverte : ' +
        (document.querySelector('.site-nav [aria-current="page"]')?.textContent.trim() ?? '');
    }
  };
  if (event?.type === 'hashchange' && document.startViewTransition && !reduceMotion.matches)
    document.startViewTransition(update);
  else update();
  const page = PAGES[id];
  if (!page.prepare) return;
  $('market-stats').textContent = 'Chargement des ventes…';
  try {
    await page.prepare();
    if (current === navigation) {
      page.show();
      // La page ne prend sa hauteur finale qu'ici : la position mémorisée est rétablie maintenant.
      if (restore !== undefined) window.scrollTo(0, restore);
    }
  } catch {
    if (current === navigation)
      $('market-stats').textContent = 'Ventes indisponibles. Rouvrez l’explorateur pour réessayer.';
  }
}

$('start-estimate').addEventListener('click', () => {
  const target = $('address').disabled ? $('estimate-form') : $('address');
  target.focus?.();
  target.scrollIntoView({ block: $('address').disabled ? 'start' : 'center' });
});

// Préchargement des vues fondées sur les données, quand le visiteur approche de leur lien (survol ou focus).
// store.js et map.js mettent les données en cache : l'ouverture n'attend plus le réseau.
// Un échec est ignoré ici ; la vue le signale et réessaie à l'ouverture.
for (const [id, page] of Object.entries(PAGES)) {
  if (!page.prepare) continue;
  const preload = () => page.prepare().catch(() => {});
  document.querySelectorAll(`.site-nav a[href="#${id}"]`).forEach(link => {
    link.addEventListener('pointerenter', preload);
    link.addEventListener('focus', preload);
  });
}

// Constellation des communes couvertes (hero) : dessinée à partir de data/metadata.json.
function renderConstellation(towns) {
  const points = F.constellation(towns);
  if (!points.length) return;
  const circle = p =>
    `<circle class="${p.hub ? 'const-hub' : 'const-dot'}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}"/>`;
  const label = p =>
    p.hub
      ? `<text class="const-label const-label-hub" x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${F.esc(p.name)}</text>`
      : `<text class="const-label" x="${p.x.toFixed(1)}" y="${(p.y + p.r + 14).toFixed(1)}" text-anchor="middle">${F.esc(p.name)}</text>`;
  $('hero-art').innerHTML =
    `<svg viewBox="0 0 300 420" role="img" aria-labelledby="const-title"><title id="const-title">Les ${points.length} communes couvertes, placées selon leur position ; la taille suit le nombre de ventes.</title>` +
    [...points]
      .sort((a, b) => b.r - a.r)
      .map(circle)
      .join('') +
    points
      .filter(p => p.label)
      .map(label)
      .join('') +
    `<text class="const-caption" x="150" y="412" text-anchor="middle">${points.length} communes · taille = nombre de ventes</text></svg>`;
}

window.addEventListener('hashchange', route);
route();

readJson('data/metadata.json')
  .then(data => {
    state.metadata = data;
    initEstimate(data.towns);
    initMarket(data.towns);
    renderConstellation(data.towns);
    if (marketReady()) showMarket();
    else if (!$('statistiques').hidden) renderMarket();
    $('estimate-button').disabled = false;
    $('model-status').textContent = 'Le moteur se charge lors de la première estimation.';
    performance.mark('valometra-form-ready');
    performance.measure('valometra-formulaire', { start: 0, end: 'valometra-form-ready' });
  })
  .catch(() => {
    $('model-status').textContent = 'Les communes n’ont pas pu être chargées. Rechargez la page.';
  });

// Utilisation hors connexion : le service worker est facultatif, son échec n'est pas bloquant.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
