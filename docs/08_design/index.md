# Charte graphique

| | |
|---|---|
| Version | **1.0.0** (voir `design/CHANGELOG.md`) |
| Source de vérité | `design/tokens/valometra.tokens.json` |
| Maquettes | canvas « Valometra — Charte graphique » (8 planches) |
| Appliquée à | ce site de documentation |

La charte définit l'identité visuelle de Valometra : logo, couleurs,
typographie, composants d'interface, data-visualisation et ton
éditorial. Elle est **pilotée par des design tokens** : chaque valeur
visuelle n'existe qu'à un seul endroit et se propage automatiquement
(voir [ADR 0007](../07_decisions/adr/0007-charte-graphique-tokens.md)).

**Signature** : « La valeur juste, mesurée. »

## Piliers de marque

| Pilier | Ce que cela implique visuellement |
|---|---|
| **Précision** | Chiffres tabulaires, montants arrondis, sources citées sous chaque graphique |
| **Transparence** | Toute estimation est accompagnée de sa fourchette et de son niveau de fiabilité |
| **Clarté** | Fonds neutres, une seule action mise en avant par écran, pas d'effets décoratifs |

## Organisation

```
design/
  tokens/valometra.tokens.json   source unique (format W3C Design Tokens)
  logo/*.svg                     fichiers maîtres du logo
  build_tokens.py                générateur
  README.md  CHANGELOG.md
docs/assets/stylesheets/
  valometra-tokens.css           GÉNÉRÉ : variables --vm-*
  valometra.css                  habillage du site (n'utilise que des --vm-*)
docs/assets/images/*.svg         GÉNÉRÉ : copie de design/logo/
docs/08_design/reference.md      GÉNÉRÉ : valeurs et contrastes
```

## Pages

| Je veux… | Page |
|---|---|
| connaître les règles du logo, des couleurs, de la typo, des graphiques | [Identité visuelle](identite.md) |
| comprendre l'architecture des tokens et les utiliser dans du code | [Design tokens](tokens.md) |
| connaître la valeur exacte d'un token ou un contraste | [Référence des tokens](reference.md) |
| modifier la charte (couleur, police, nouveau thème…) | [Faire évoluer la charte](evolution.md) |
