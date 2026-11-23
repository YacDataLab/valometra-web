# Faire évoluer la charte

## Procédure

1. Modifier **uniquement** `design/tokens/valometra.tokens.json` (et/ou
   un fichier de `design/logo/`).
2. Régénérer : `uv run python design/build_tokens.py`.
3. Contrôler : `uv run pytest tests/unit/test_design_tokens.py` puis
   `uv run zensical serve` pour vérifier le rendu clair **et** sombre.
4. Incrémenter `$extensions.valometra.version` dans le JSON et ajouter une
   entrée à `design/CHANGELOG.md`.
5. Mettre à jour [Identité visuelle](identite.md) si une **règle d'usage**
   change (la [Référence](reference.md) se met à jour seule).
6. Commiter tokens, sorties générées et documentation **ensemble**.

## Versionnement

Versionnement sémantique, comme une bibliothèque :

| Changement | Version | Exemples |
|---|---|---|
| Correctif sans effet visible notable | correctif `1.0.x` | ajuster une teinte pour gagner du contraste |
| Ajout compatible | mineure `1.x.0` | nouveau token, nouvelle couleur de data-viz, nouveau thème |
| Rupture | majeure `x.0.0` | renommer ou supprimer un token, changer de police, refonte du logo |

Un token renommé casse tout CSS qui l'utilise : préférer ajouter le
nouveau nom, garder l'ancien en alias (`{nouveau.chemin}`) pendant une
version mineure, puis le supprimer en version majeure.

## Cas courants

| Je veux… | Je modifie |
|---|---|
| changer la couleur d'action | `theme.clair.action` / `theme.sombre.action` (alias) ou `color.cuivre.500` |
| ajouter une nuance | une clé dans `color.<gamme>` |
| ajouter une couleur de graphique | `color.dataviz.categorie-7` |
| changer une police | `font.family.*` **et** `font.text` / `font.code` dans `zensical.toml`, et l'`@import` de `valometra.css` |
| ajouter un thème (ex. contraste élevé) | un groupe `theme.<nom>` avec les **mêmes clés**, et son sélecteur dans `THEME_SELECTORS` (`design/build_tokens.py`) |
| contrôler une nouvelle paire de contraste | `CONTRAST_PAIRS` dans `design/build_tokens.py` |
| changer le logo | le SVG dans `design/logo/` (la copie dans la doc est automatique) |

## Exporter vers d'autres outils

Le JSON suit le format W3C Design Tokens : il s'importe dans Figma
(plugins Tokens Studio, Variables Import) ou se transforme avec
Style Dictionary pour produire d'autres formats (SCSS, Tailwind, Android,
iOS). Ajouter une sortie = ajouter une fonction `build_<format>` et
l'enregistrer dans `expected_outputs` de `design/build_tokens.py`.
