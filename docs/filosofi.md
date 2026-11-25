# Filosofi pour Grenoble

L’enrichissement s’applique aux bâtiments de la commune INSEE `38185`.
Le navigateur recoupe le code IRIS actuel de la BDNB et l’empreinte du
bâtiment avec les contours IGN du **1ᵉʳ janvier 2022**. Il utilise les
valeurs de la ligne Filosofi uniquement si les deux codes concordent.

## Sources et vérification de l’entraînement

- [INSEE Filosofi 2021 (IRIS)](https://www.insee.fr/fr/statistiques/8229323),
  base CSV sur les revenus disponibles, géographie au 1ᵉʳ janvier 2022.
- [Contours IRIS IGN 2022](https://data.geopf.fr/telechargement/download/CONTOURS-IRIS/CONTOURS-IRIS_2-1__SHP__FRA_2022-01-01/CONTOURS-IRIS_2-1__SHP__FRA_2022-01-01.7z),
  couche métropolitaine en Lambert-93, licence ouverte.
- [Référentiel administratif BDNB](https://bdnb.io/schema/latest/bdnb_v07_refadmin/tables/iris.html).
  Les 70 codes grenoblois sont communs à la BDNB, à Filosofi 2021 et aux contours
  IGN 2022 et 2026. Les géométries 2022 et 2026 diffèrent.
- [Valometra — Atelier de prédiction](https://valometra-atelier-prediction.agreeablepoppy2.chatgpt.site)
  contient `dist/dataset.csv`. Son SHA-256 correspond à `source_sha256`
  dans `dist/models/catboost-v1/metrics.json`, qui liste les cinq entrées
  `insee_*`. Le prétraitement de cet export est identique à celui du site.
  Parmi les ventes grenobloises du CSV antérieures à mai 2026, les **2 199**
  lignes rattachées à un IRIS ont les quatre valeurs du CSV INSEE correspondant
  à leur code, masques compris. Sur ces lignes, **2 198** ont les quatre
  valeurs numériques. Les diagnostics de la phase initiale d’entraînement
  référencent 1 738 ventes grenobloises du CSV, dont 1 717 avec les cinq
  entrées Filosofi renseignées. Les quatre noms bruts du CSV INSEE sont
  remplacés par les noms Valometra ci-dessous. Le modèle natif CatBoost
  de l’Atelier et l’export Python du site concordent à moins d’un centime
  sur un échantillon de 100 ventes de Grenoble (écart maximal : 0,0022 €).

| Entrée du modèle | Colonne INSEE | Valeur |
| --- | --- | --- |
| `insee_code_iris` | `IRIS` | Code IRIS, chaîne de neuf caractères |
| `insee_niveau_vie_median` | `DISP_MED21` | Médiane du revenu disponible par unité de consommation, en euros |
| `insee_taux_pauvrete` | `DISP_TP6021` | Taux au seuil de 60 % du revenu médian métropolitain, en points de pourcentage |
| `insee_niveau_vie_d9` | `DISP_D921` | Neuvième décile du revenu disponible par unité de consommation, en euros |
| `insee_rapport_interdecile` | `DISP_RD21` | Rapport D9/D1, sans unité |

## Génération

Télécharger le fichier officiel « Base Iris sur les revenus disponibles »
et extraire `BASE_TD_FILO_IRIS_2021_DISP.csv`. Depuis la racine du dépôt :

```sh
python3 scripts/build_filosofi.py \
  --csv BASE_TD_FILO_IRIS_2021_DISP.csv \
  --provenance scripts/filosofi-provenance.json
```

Le générateur produit `public/data/filosofi.json`. Les cellules vides ou
masquées, notamment `ns` et `so`, deviennent `null`. Seules les données
publiques INSEE sont intégrées au JSON.

Pour régénérer les contours, extraire le Shapefile métropolitain
`CONTOURS-IRIS.shp` de l’archive IGN, puis exécuter :

```sh
ogr2ogr -f GeoJSON /tmp/iris-grenoble-2022.json CONTOURS-IRIS.shp \
  -where "INSEE_COM = '38185'" -select CODE_IRIS -t_srs EPSG:2154 \
  -lco COORDINATE_PRECISION=3
python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path('/tmp/iris-grenoble-2022.json').read_text())
data['features'].sort(key=lambda feature: feature['properties']['CODE_IRIS'])
Path('public/data/iris-grenoble-2022.geojson').write_text(
    json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
)
PY
npm test
```

## Contrôle géographique

Le contour réel de l’empreinte BDNB doit tenir à l’intérieur d’un seul IRIS
historique, sans toucher la frontière ni recouvrir une enclave. Le code
trouvé doit correspondre à celui de la BDNB.
Le site omet les entrées Filosofi si le contrôle échoue, si un fichier ou
un indicateur manque, ou si le bâtiment est hors Grenoble. Une nouvelle
adresse ou un autre bâtiment efface les valeurs précédentes et invalide
les réponses en cours.

## Vérifications réalisées

- Les 70 codes IRIS de Grenoble concordent entre le CSV Filosofi, les contours
  IGN 2022 et 2026 et le référentiel administratif BDNB. La comparaison
  géométrique confirme que les tracés IGN 2022 et 2026 diffèrent. Une
  correspondance de codes seule ne valide donc pas l’affectation d’un bâtiment.
- Les tests de `tests/enrichment.test.mjs` simulent un bâtiment dont le code
  concorde, un code différent, une empreinte qui traverse une limite, une
  valeur masquée et une réponse tardive après un changement de sélection.
  La commande `npm test` exécute ces vérifications.
- Sur un tirage aléatoire reproductible de 150 groupes de bâtiments parmi
  1 260 groupes grenoblois du fichier de ventes historique (graine 38185,
  identifiants uniques triés), la BDNB a renvoyé les 150 empreintes. Sur le
  même échantillon, 103 bâtiments passaient le test du rectangle et 135
  passent le test du contour réel (90 %). Les quatre chiffres Filosofi
  sont disponibles pour les 135 bâtiments retenus. Le contrôle géographique
  n’a pas trouvé d’IRIS unique pour 11 bâtiments et a trouvé un code différent
  de la BDNB pour 4 bâtiments.
- Le parcours complet dans le navigateur, de la sélection d’une adresse
  à l’estimation, reste à vérifier. Le taux est celui de l’échantillon
  historique de bâtiments et ne mesure pas la couverture du formulaire.

### Les quatre désaccords de zonage

En superposant les mêmes empreintes aux contours IGN 2026, on retrouve
dans les quatre cas le code attribué par la BDNB. Le changement de tracé
explique la différence de code observée entre les deux éditions.

| IRIS IGN 2022 | IRIS IGN 2026 et BDNB |
| --- | --- |
| `381850401` | `381850214` |
| `381850206` | `381850205` |
| `381850209` | `381850210` |
| `381850102` | `381850105` |

### Comparaison à faire sur les prix de vente

La PR retient la concordance BDNB–IGN 2022. En cas de désaccord, le
modèle utilise son traitement habituel des valeurs manquantes. Une
variante utiliserait les chiffres de l’IRIS IGN 2022 dès que l’empreinte
tient dans une seule zone, même si la BDNB donne un autre code. Sur
l’échantillon géographique, cette variante retiendrait 139 bâtiments sur
150 au lieu de 135. Ce taux mesure le rattachement géographique.

Pour évaluer l’effet sur le prix, prendre les mêmes ventes hors
entraînement dont le prix réel est connu. Calculer deux estimations par
vente avec le même modèle et les mêmes autres entrées. Seule la règle
Filosofi change. Comparer l’erreur absolue en euros pour chaque vente,
l’erreur absolue médiane et moyenne, et le nombre de ventes pour lesquelles
chaque règle est la plus proche du prix réel. Présenter séparément les
cas de désaccord et la taille de ce sous-échantillon. Cette comparaison
des prix reste à faire.
