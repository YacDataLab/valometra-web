# Filosofi pour Grenoble

L’enrichissement concerne les bâtiments de Grenoble (INSEE **38185**). Le
code IRIS de la fiche BDNB sélectionnée sert de clé. Le site charge
`public/filosofi.json` à la première sélection d’un bâtiment éligible et
réutilise le résultat pour la session. Les valeurs manquantes restent à la
charge du prétraitement du modèle.

## État de la provenance

`public/preprocessing.json` confirme que `insee_code_iris` est une catégorie
et que les quatre mesures ci-dessous sont numériques. Il reste à retrouver
le fichier ou le manifeste d’entraînement qui établit le millésime de revenu,
le zonage IRIS, les colonnes et leurs unités ou transformations. Il faut
également confirmer que le code IRIS fourni par la BDNB correspond au même
zonage, ou disposer d’une correspondance vérifiée.

La publication officielle [Filosofi 2021, Revenus, pauvreté et niveau de vie
(Iris)](https://www.insee.fr/fr/statistiques/8229323) indique une géographie au
**1ᵉʳ janvier 2022**. Son CSV « Base Iris sur les revenus disponibles » a
servi à tester le générateur, avec 70 codes de Grenoble extraits. Le tableau
décrit cette publication. La correspondance avec l’entraînement reste à
confirmer.

| Entrée du modèle | Colonne 2021 | Définition INSEE pour cette publication |
| --- | --- | --- |
| `insee_code_iris` | `IRIS` | Code IRIS, chaîne de neuf caractères |
| `insee_niveau_vie_median` | `DISP_MED21` | Médiane du revenu disponible par unité de consommation, en euros |
| `insee_taux_pauvrete` | `DISP_TP6021` | Taux au seuil de 60 % du revenu disponible par UC médian métropolitain, en pourcentage |
| `insee_niveau_vie_d9` | `DISP_D921` | Neuvième décile du revenu disponible par unité de consommation, en euros |
| `insee_rapport_interdecile` | `DISP_RD21` | Rapport D9/D1 du revenu disponible par unité de consommation |

## Génération

L’artefact livré est généré ainsi tant que la provenance d’entraînement n’est
pas confirmée. Sa table IRIS est vide et aucune valeur Filosofi n’est envoyée
au modèle.

```sh
python3 scripts/build_filosofi.py --unverified
```

Après confirmation, télécharger le CSV officiel du millésime établi depuis
la publication INSEE et extraire le fichier de données. Préparer un manifeste
JSON comportant `source` (URL de publication INSEE), `vintage`,
`iris_geography`, `training_reference`, `bdnb_iris_reference`,
`definitions` (une définition d’entraînement par indicateur numérique) et
`columns` (les quatre noms de variables du modèle et la clé `iris`, associés
aux en-têtes du CSV). Puis lancer depuis la racine du dépôt :

```sh
python3 scripts/build_filosofi.py --csv chemin/revenus.csv --provenance chemin/provenance.json
npm test
```

Le script conserve uniquement les codes IRIS commençant par `38185`. Les
cellules vides ou masquées, notamment `ns` et `so`, donnent `null`. En cas de
fichier indisponible, d’IRIS inconnu ou d’indicateur manquant, le site omet les
variables concernées. Une nouvelle adresse ou un autre bâtiment efface les
valeurs précédentes.
