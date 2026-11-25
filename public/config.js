'use strict';
// Valeurs de référence du modèle et de l'application, définies une seule fois.
// Elles sont vérifiées par tests/config.test.mjs (pages HTML, métadonnées, modèle).
globalThis.ValometraConfig = Object.freeze({
  // Date de référence des prix et date limite des DPE retenus.
  referenceDate: '2026-06-30',
  referenceLabel: '30 juin 2026',
  // Début de la période de ventes de l'explorateur du marché.
  marketStart: '2025-07-01',
  // Variable `jours_depuis_2025` envoyée au modèle (nombre de jours à la date de référence).
  daysSince2025: 545,
  // Couverture mesurée sur les 239 ventes de juin 2026 pour la fourchette affichée (objectif 80 %).
  coverage: Object.freeze({ 80: '84,9' }),
  townCount: 39,
});
