// Résultat d'une estimation : bloc de prix, fourchette, repères locaux, comparables.
// Fonctions de rendu sans effet de bord : elles renvoient du HTML.
import * as F from './format.js';
import { config } from './config.js';
import { simulatorHtml } from './simulator.js';
import { feedbackHtml } from './feedback.js';

const { esc, money, roundMoney, num, median } = F;
// Pictogramme du sprite SVG icons.svg (jeu Tabler, licence MIT).
const icon = name =>
  `<svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-${name}"/></svg>`;

const precisionHtml = precision =>
  precision
    ? `<span class="level"><span class="bars" data-level="${precision.bars}" role="img" aria-label="Précision de la fourchette : ${precision.label}, ${precision.bars} sur 3">${[1, 2, 3].map(i => `<i${i <= precision.bars ? ' class="on"' : ''}></i>`).join('')}</span>${precision.label}</span>`
    : '—';

const priceBlock = (value, input) =>
  `<div class="result-top"><div class="section-head"><div><span class="eyebrow">Votre estimation</span><h2 tabindex="-1">${esc(input.town.name)} · ${num(input.surface)} m²</h2></div></div><p class="hint">${esc(input.address)}</p><div class="price">${roundMoney(value)}</div><span class="price-unit">Estimation indicative · référence au ${config.referenceLabel}</span></div>`;

const rangeBlock = (value, intervals) => {
  const [low, high] = intervals['80'],
    position = F.gauge(value, intervals['80']),
    label = `Estimation ${roundMoney(value)}, fourchette étendue de ${roundMoney(low)} à ${roundMoney(high)}`,
    bar =
      position === null
        ? '<div class="range-bar"></div>'
        : `<div class="gauge" role="img" aria-label="${label}"><span class="gauge-point" style="left:${position}%"></span></div><ul class="gauge-legend" aria-hidden="true"><li><i class="point"></i>Estimation</li><li><i class="extended"></i>Étendue 80 %</li></ul>`;
  return `<div class="range-box"><h3>Fourchette étendue · objectif 80 %</h3>${bar}<div class="range-values"><span>${roundMoney(low)}</span><span>${roundMoney(high)}</span></div><p class="hint">Bornes personnalisées à partir des caractéristiques du bien. La couverture mesurée sur les ventes de juin 2026 est de ${config.coverage[80]} %.</p></div>`;
};

const figure = (name, title, value, note) =>
  `<div><dt>${icon(name)}${title}</dt><dd>${value}<small>${note}</small></dd></div>`;

const keyFigures = (value, input, comps, intervals) => {
  const perM2 = value / input.surface,
    local = median(comps.map(r => r.price / r.surface));
  return `<dl class="key-figures">${
    figure(
      'ruler-2',
      'Prix au m²',
      money(Math.round(perM2)),
      local
        ? `médiane locale ${money(local)} / m²<br>${gapText(perM2, local)}`
        : 'sans repère local',
    ) +
    figure(
      'building-community',
      'Comparables',
      comps.length,
      'ventes de la commune, surfaces à ±25 %',
    ) +
    figure(
      'chart-arrows-vertical',
      'Précision',
      precisionHtml(F.precision(value, intervals['80'])),
      'largeur de la fourchette',
    )
  }</dl>`;
};

const contextBlock = input => {
  const { features, enrichment } = input,
    located = features.latitude
      ? `Adresse localisée · bâtiment ${enrichment?.building ? 'retrouvé' : 'renseigné manuellement ou absent'} · DPE ${enrichment?.dpe ? 'confirmé depuis l’ADEME' : 'saisi manuellement ou absent'}.`
      : 'Coordonnées non renseignées';
  return `<dl class="context"><dt>Localisation</dt><dd>${located}</dd></dl><p class="hint">Une expertise sur place reste utile pour l’état, l’étage, la vue et les travaux. Aucun ajustement de marché après ${config.referenceLabel.slice(3)}.</p>`;
};

const actionsBlock = () =>
  `<div class="result-actions"><a class="secondary" href="#method">Comprendre ces repères</a><button type="button" class="secondary" id="share-link">${icon('link')}<span>Copier le lien de cette estimation</span></button><button type="button" class="secondary" id="print-result">${icon('printer')}Imprimer</button></div>`;

const printNote = () =>
  `<p class="print-only">Document généré le ${F.frDate(new Date().toISOString())} par Valometra (open source, licence AGPL-3.0). Estimation indicative, référence au ${config.referenceLabel} : elle ne remplace pas une expertise.</p>`;

function gapText(pricePerM2, median) {
  const gap = F.gapToMedian(pricePerM2, median);
  if (gap === null) return '';
  const rounded = Math.round(gap);
  if (rounded === 0) return 'au niveau de la médiane';
  return `${Math.abs(rounded)}\u202f% ${rounded > 0 ? 'au-dessus' : 'en dessous'}`;
}

function comparablesTable(rows) {
  if (!rows.length) return '';
  const { frDate, frDistance } = F;
  return (
    `<div class="comparables"><h3>Ventes comparables les plus proches</h3><div class="table-wrap"><table><thead><tr><th>Distance</th><th>Date</th><th>Surface</th><th>Prix</th></tr></thead><tbody>` +
    rows
      .map(
        r =>
          `<tr><td>${frDistance(r.meters)}</td><td>${frDate(r.date)}</td><td>${num(r.surface)}\u202fm²</td><td>${money(r.price)}<small>${money(Math.round(r.price / r.surface))}\u202f/\u202fm²</small></td></tr>`,
      )
      .join('') +
    `</tbody></table></div><p class="hint">Ventes réelles de la commune, surfaces à ±25 %, classées par distance. La position est celle de la parcelle, pas du logement.</p></div>`
  );
}

// HTML complet du résultat ; `market` sert aux repères locaux et aux comparables.
export function resultHtml(value, input, intervals, market) {
  const { town, surface, features } = input,
    comps = market.filter(
      r => r.code === town.code && r.surface >= surface * 0.75 && r.surface <= surface * 1.25,
    ),
    nearest = F.nearestComparables(market, {
      code: town.code,
      surface,
      lat: Number(features.latitude),
      lon: Number(features.longitude),
    });
  return (
    priceBlock(value, input) +
    rangeBlock(value, intervals) +
    keyFigures(value, input, comps, intervals) +
    contextBlock(input) +
    simulatorHtml(input) +
    comparablesTable(nearest) +
    actionsBlock() +
    feedbackHtml() +
    printNote()
  );
}
