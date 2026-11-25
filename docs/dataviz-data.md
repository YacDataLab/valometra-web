# Données de visualisation Valometra

## Prompt d’implémentation

> Agis comme développeur Python senior et spécialiste Cloudflare D1. Dans
> `YacDataLab/valometra-web`, versionne le schéma, l’import Python, les sources
> officielles et les tests sur une branche dédiée. Prépare en local une base
> publique indépendante de celle des demandes utilisateurs.
>
> Pour DVF, couvre les 39 communes du site et cinq années de données publiées.
> Conserve tous les types de biens et toutes les lignes des mutations du
> périmètre. Garde les archives source intactes et trace leur empreinte.
> Sépare une mutation de ses parcelles et locaux pour éviter de compter
> plusieurs fois son prix. Conserve les valeurs manquantes et documente la
> fin réelle de couverture.
>
> Pour la BDNB, conserve uniquement l’identifiant du groupe de bâtiments, le
> code commune et le code IRIS disponible. Pour Filosofi, utilise les quatre
> indicateurs INSEE 2021 de Grenoble, sur les contours IGN 2022, en conservant
> les valeurs masquées. Tout futur croisement au bâtiment doit confirmer le
> rattachement géographique avant d’utiliser ces chiffres.
>
> Produis un import reproductible, économe en mémoire, avec validation et
> remplacement atomique de la base locale. Vérifie l’intégrité et les volumes
> sur les sources réelles, teste la compatibilité avec D1 en local, lance le
> lint et `npm test`. Prépare un export SQL et documente la procédure de revue.
> Attends l’accord avant le commit, le push, la PR et le déploiement.

## Périmètre et sources

| Source | Version | Contenu |
| --- | --- | --- |
| [DVF géolocalisées](https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/) | Publication d’octobre 2026 | Du 1er juillet 2021 au 30 juin 2026 inclus dans les 39 communes de `public/data/metadata.json`. Le dernier semestre publié borne cette fenêtre. |
| [BDNB Open, Isère](https://www.bdnb.io/archives_data/bdnb_millesime_2026_02_b/) | 2026-02-b, CSV | Identifiant du groupe de bâtiments, commune et code IRIS. Le code peut être absent. |
| [INSEE Filosofi](https://www.insee.fr/fr/statistiques/8229323) | Revenus 2021, géographie 2022 | Les quatre indicateurs du fichier validé dans [la documentation Filosofi](filosofi.md). Les valeurs masquées restent SQL `NULL`. |

Les archives DVF conservent chaque colonne disponible. La base garde les
champs utiles aux visualisations ainsi que l’année et le numéro
d’enregistrement dans le CSV pour retrouver la ligne source. Une mutation
peut couvrir plusieurs parcelles, locaux ou communes. Son montant est associé
à la mutation entière. Les requêtes d’exemple dédupliquent ces lignes pour
les volumes. L’attribution du prix à un bien ou le calcul d’un prix au m²
exigent d’abord de vérifier le contenu complet de la mutation. Des coordonnées
absentes ou une absence de type de local restent des valeurs inconnues.

## Reproduire

Python 3.12 et les utilitaires `curl` et `sha256sum` suffisent.
Depuis la racine du dépôt, télécharger les archives hors de `public/`.

```sh
set -eu
input=dist/dataviz-sources
mkdir -p "$input"
while read -r year url; do
  curl --fail --location --retry 2 "$url" -o "$input/$year.csv.gz"
done < data-platform/dvf-2026-10.urls
curl --fail --location --retry 2 "$(cat data-platform/bdnb-2026-02-b.url)" \
  -o "$input/bdnb-dep38.zip"
(cd "$input" && sha256sum -c ../../data-platform/source.sha256)
python3 scripts/build_dataviz.py --end 2026-06-30 \
  --dvf-dir "$input" --bdnb-zip "$input/bdnb-dep38.zip" \
  --output dist/dataviz.sqlite
python3 scripts/export_dataviz_sql.py --database dist/dataviz.sqlite \
  --output dist/dataviz.sql
npm test
```

L’export SQL cible une base D1 dédiée et vide. Il inclut le schéma, les
index et des insertions par lots. Les données privées restent dans leur
base existante. Les archives brutes peuvent être conservées hors Git et
hors du site public. La base locale et l’export SQL restent dans `dist/`.
Un futur chargement dans Cloudflare doit vérifier les quotas de stockage
et d’écriture sur le compte. [Limites D1](https://developers.cloudflare.com/d1/platform/limits/)

Pour vérifier l’import avec Wrangler, créer `dist/wrangler-dataviz.json`
avec une base locale dédiée.

```json
{
  "name": "valometra-dataviz-local",
  "compatibility_date": "2026-01-01",
  "d1_databases": [
    {
      "binding": "DATAVIZ_DB",
      "database_name": "valometra-dataviz-local",
      "database_id": "11111111-1111-4111-8111-111111111111"
    }
  ]
}
```

Exécuter la commande dans un répertoire de persistance vide.

```sh
npx --yes wrangler@4.166.0 d1 execute valometra-dataviz-local \
  --config dist/wrangler-dataviz.json --local \
  --persist-to dist/dataviz-d1-local --file dist/dataviz.sql
```

Le site actuel n’est pas relié à ces tables. `data-platform/queries.sql`
contient les premières requêtes de référence pour les visualisations.

## Vérification sur les sources réelles

L’import du millésime décrit ci-dessus donne 46 164 mutations DVF pour
105 557 lignes source, 78 850 groupes de bâtiments BDNB et 70 IRIS
Filosofi. Les deux premières sources couvrent les 39 communes. La requête
de volumes donne 3 643 mutations à Grenoble pour 2025, toutes natures
confondues.

L’export a été importé avec Wrangler 4.166.0 en mode local. Les deux bases
donnent les mêmes comptes, les mêmes dates de couverture et le même volume
pour Grenoble. Les contrôles SQLite d’intégrité et de clés étrangères
passent, ainsi que le lint Python et `npm test` (102 tests JavaScript et deux
tests Python).
