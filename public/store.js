// État partagé entre les modules de l'application et accès aux données.
export const state = { metadata: null, market: [] };

export function readJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error('Données indisponibles.');
    return response.json();
  });
}

// Le fichier stocke les colonnes une fois, puis les valeurs de chaque vente : plus léger à transférer.
// Chaque vente redevient un objet, pour le reste de l'application.
export function decodeMarket({ columns, rows }) {
  return rows.map(values => Object.fromEntries(columns.map((column, i) => [column, values[i]])));
}

let marketPromise;
// Les ventes ne sont chargées qu'au premier usage (marché ou comparables d'une estimation).
export function loadMarket() {
  marketPromise ??= readJson('market.json')
    .then(data => {
      state.market = decodeMarket(data);
    })
    .catch(error => {
      marketPromise = undefined;
      throw error;
    });
  return marketPromise;
}
