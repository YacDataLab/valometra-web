// État partagé entre les modules de l'application et accès aux données.
export const $ = id => document.getElementById(id);

export const state = { metadata: null, market: [] };

export function readJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error('Données indisponibles.');
    return response.json();
  });
}

let marketPromise;
// Les ventes ne sont chargées qu'au premier usage (marché ou comparables d'une estimation).
export function loadMarket() {
  marketPromise ??= readJson('market.json')
    .then(rows => {
      state.market = rows;
    })
    .catch(error => {
      marketPromise = undefined;
      throw error;
    });
  return marketPromise;
}
