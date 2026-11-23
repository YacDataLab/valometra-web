# Identité visuelle

Règles d'usage. Les valeurs exactes sont dans la
[Référence des tokens](reference.md), générée depuis les tokens.

## Logo

![Logotype Valometra](../assets/images/valometra-logo.svg){ width="320" }

« Valo » pour la valeur, « metra » pour la mesure : le symbole associe un
**toit** (le bien) à une **règle graduée** dont le trait central, plus
long, marque la juste valeur.

| Fichier (`design/logo/`) | Usage |
|---|---|
| `valometra-logo.svg` | Version principale, fonds clairs |
| `valometra-logo-inverse.svg` | Fonds ardoise ou sombres |
| `valometra-symbole.svg` | Symbole seul (avatar, icône d'application) |
| `valometra-symbole-inverse.svg` | Symbole sur fond sombre (en-tête de ce site) |
| `valometra-symbole-mono.svg` | Monochrome (gravure, tampon, fax) |
| `favicon.svg` | Favicon : graduations simplifiées pour les petites tailles |

**Construction** : trame de 48 unités, rayon 12 u, toit à 90° (trait
3,5 u), règle (trait 3 u, graduations 2 u). Wordmark en Plus Jakarta
Sans Bold, bas de casse, approche −2,5 %.

**Zone de protection** : ½ hauteur du symbole sur les quatre côtés.
**Tailles minimales** : logotype 96 px / 24 mm ; symbole seul 16 px / 6 mm.

!!! warning "Interdits"
    Déformer ou étirer · changer les couleurs · ajouter ombre ou effet ·
    poser sur un fond à faible contraste · recomposer le wordmark.

!!! note "Wordmark"
    Les SVG de `design/logo/` composent le wordmark avec la police
    Plus Jakarta Sans. Pour l'impression ou un usage hors web, produire
    une version vectorisée (texte converti en tracés) depuis un outil de
    dessin et l'ajouter au même dossier.

## Couleurs

| Gamme | Rôle | Teinte de marque |
|---|---|---|
| **Ardoise** | Primaire : confiance, structure (en-têtes, titres, données) | 800 |
| **Cuivre** | Accent : valeur et action principale (un seul bouton cuivre par écran) | 500 |
| **Pierre** | Neutres chauds : fonds, textes, bordures | 50 (fond), 900 (texte) |
| **États** | Succès, avertissement, erreur, information | — |

Proportions indicatives : Pierre 60 %, Ardoise 25 %, Cuivre 10 %, États 5 %.

Règles d'accessibilité (WCAG 2.2 AA) :

- texte courant : contraste ≥ 4,5:1 ; les paires sémantiques sont
  **vérifiées par un test** ([contrastes](reference.md#contrastes-controles)) ;
- Cuivre 300/400 et Ardoise 300/400 : décoratifs sur fond clair, jamais
  pour du texte ;
- une couleur ne porte jamais seule une information : toujours une icône,
  un libellé ou une forme en plus.

## Typographie

| Famille | Rôle | Graisses |
|---|---|---|
| **Plus Jakarta Sans** | Titres, chiffres-clés, wordmark | 600, 700, 800 |
| **Inter** | Texte courant, interface, tableaux | 400, 500, 600 |
| **IBM Plex Mono** | Sur-titres, identifiants, code, tokens | 400, 500 |

Échelle modulaire de ratio 1,25 sur une base de 16 px (`--vm-font-size-*`).
Les trois familles sont sous licence libre (SIL OFL).

**Écriture des montants** : espace fine insécable (U+202F) entre les
milliers et avant €, % et m² (`412 000 €`, `4 120 €/m²`) ; estimation
arrondie au millier, jamais de centimes ; virgule décimale ; chiffres
tabulaires dans tout tableau.

## Composants d'interface

- Cibles tactiles ≥ 44 px ; focus visible (anneau `--vm-focus` de 3 px).
- Boutons : principal (cuivre), secondaire (ardoise), contour, texte.
  Hauteurs 36 / 48 / 56 px, rayon `--vm-radius-md`.
- Champs : libellé visible au-dessus, erreur sous le champ avec icône et
  message expliquant comment corriger.
- **Carte de résultat** (composant signature) : prix estimé, fourchette
  probable, prix au m², nombre de comparables, badge de fiabilité.
- **Indice de fiabilité** : haute / moyenne / faible, porté par la
  couleur, le nombre de barres (3 / 2 / 1) et le libellé.

## Data-visualisation

- Palette catégorielle `--vm-color-dataviz-categorie-1` à `-6`, dans cet
  ordre ; bleu et orange pour rester lisible par les daltoniens.
- Séquentielle (prix au m²) : gamme Ardoise 50 → 900. Divergente (écart
  au marché) : Cuivre ← Pierre 100 → Ardoise.
- Toute valeur estimée montre son **intervalle** (bande ou barre).
- Le titre énonce la conclusion ; le sous-titre donne mesure, unité et
  période ; la source est citée en pied.
- Le cuivre désigne le bien de l'utilisateur, le reste est en ardoise.
- Ni 3D, ni dégradé ; barres partant de zéro ; libellés directs plutôt
  qu'une légende séparée.

## Ton éditorial

Expert mais accessible, factuel, rassurant, honnête sur les limites.
Vouvoiement.

| Nous écrivons | Nous évitons |
|---|---|
| « Votre bien est estimé entre 387 000 et 437 000 €. » | « Votre bien vaut exactement 412 000 € ! » |
| « Peu de ventes comparables : la fiabilité est moyenne. » | « Notre IA ne se trompe jamais. » |
| « prix au mètre carré », « surface habitable » | sigles non expliqués (« PPSM », « AVM hédonique ») |

Montants ci-dessus : exemples d'illustration.
