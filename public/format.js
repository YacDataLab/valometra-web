'use strict';
// Fonctions d'affichage sans dépendance au DOM (testées dans tests/format.test.mjs).
(() => {
  // « 2026-06-30 » -> « 30/06/2026 » ; toute autre valeur est renvoyée telle quelle.
  const frDate = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value ?? '');
  };

  // Précision de la fourchette : largeur de la fourchette étendue (objectif 80 %)
  // rapportée à l'estimation. Indicateur descriptif, pas une probabilité de justesse.
  const PRECISION = [
    { max: 0.6, bars: 3, label: 'Resserrée' },
    { max: 1, bars: 2, label: 'Moyenne' },
    { max: Infinity, bars: 1, label: 'Large' },
  ];
  const precision = (value, bounds) => {
    if (!(value > 0) || !Array.isArray(bounds) || !bounds.every(Number.isFinite)) return null;
    const width = (bounds[1] - bounds[0]) / value;
    return { ...PRECISION.find(level => width <= level.max), width };
  };

  globalThis.ValometraFormat = { frDate, precision };
})();
