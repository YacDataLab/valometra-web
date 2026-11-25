// Point d'entrée de la page d'accueil : navigation entre les vues, chargement des communes.
import { $, state, readJson, loadMarket } from './store.js';
import { loadLeaflet } from './map.js';
import { initMarket, showMarket, marketReady } from './market.js';
import { initEstimate } from './estimate.js';

const F = window.ValometraFormat;

const VIEWS = ['estimate', 'market', 'method'];
const PAGE_TITLES = {
  estimate: 'Valometra — L’immobilier, en perspective',
  market: 'Le marché local — Valometra',
  method: 'Méthode et limites — Valometra',
};

let navigation = 0;

async function route(event) {
  const current = ++navigation;
  const hash = location.hash.slice(1);
  const id = VIEWS.includes(hash) ? hash : 'estimate';
  document.querySelectorAll('.page').forEach(element => {
    element.hidden = element.id !== id;
  });
  document.title = PAGE_TITLES[id];
  document.querySelectorAll('.site-nav a[href^="#"]').forEach(link => {
    if (link.hash === '#' + id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  // Navigation au clavier ou au lecteur d'écran : le focus suit le titre de la page.
  if (event?.type === 'hashchange') {
    const heading = document.querySelector('.page:not([hidden]) h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }
  if (id !== 'market') return;
  $('market-stats').textContent = 'Chargement des ventes…';
  try {
    await Promise.all([loadMarket(), loadLeaflet()]);
    if (current === navigation) showMarket();
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

// Constellation des communes couvertes (hero) : dessinée à partir de metadata.json.
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

readJson('metadata.json')
  .then(data => {
    state.metadata = data;
    initEstimate(data.towns);
    initMarket(data.towns);
    renderConstellation(data.towns);
    if (marketReady()) showMarket();
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
