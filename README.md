# Valometra-web

Valometra-web est l'application web open source de l'estimateur immobilier Valometra. Elle permet aux développeurs de contribuer à l'évolution de ses fonctionnalités et à l'amélioration de l'expérience utilisateur, tout en renforçant ses capacités d'aide à la décision.

L'application s'appuie sur un modèle d'estimation entraîné sur le jeu de données Valometra. Son périmètre géographique couvre actuellement **Grenoble et sa métropole** (39 communes), avec pour ambition de proposer des estimations tenant compte des spécificités immobilières, économiques et territoriales propres à chaque commune.

L'objectif est de développer un outil d'estimation toujours plus précis, transparent et adapté aux réalités locales.

## Fonctionnalités

- Estimation locale avec le modèle CatBoost sauvegardé : l'inférence s'exécute dans le navigateur, sans serveur de prédiction.
- Fourchettes de prix personnalisées (objectifs 80 % et 50 %).
- Rapprochement d'adresse avec les bases BDNB et ADEME (DPE).
- Explorateur du marché : carte, filtres, statistiques et export CSV.
- Espaces privés pour les demandes d'accompagnement déjà enregistrées.

## Démarrage rapide

Prérequis : Node.js 24 et Python 3.12.

```bash
npm test
```

Cette commande reconstruit le Worker (`python3 scripts/build.py`), puis exécute les tests. Le site statique est dans `public/`, le Worker dans `worker/`. Le workflow GitHub exécute la même commande.

## Docker (optionnel)

Docker n'est pas nécessaire pour contribuer : `npm test` reste la vérification de référence.

Pour lancer le site localement dans un conteneur :

```bash
docker compose up --build
```

Le site est servi sur http://localhost:8787. La base D1 locale (SQLite) est conservée dans le volume `web-data` ; `docker compose down -v` la supprime. Le conteneur exécute `wrangler dev --local`, destiné au développement : l'identité injectée par la passerelle Sites n'existe pas ici, donc `/gestion` et `/mes-demandes` ne sont pas utilisables. Après une modification de `public/` ou `worker/`, relancer avec `--build`.

## Contribuer

1. Créez une branche à partir de `main`.
2. Modifiez `public/` (interface, modèles, données) ou `worker/` (service).
3. Formatez le code avec `npm run format` (Prettier, configuré dans `.prettierrc.json`), puis vérifiez que `npm test` passe.
4. Ouvrez une pull request en décrivant le changement et son effet sur les estimations.

Les pistes les plus utiles : couverture d'autres communes, amélioration du formulaire et de l'expérience utilisateur, transparence des estimations et des bornes, tests. Les règles de travail détaillées sont dans [CLAUDE.md](CLAUDE.md).

## Licence

Code sous licence GNU AGPL v3, voir [LICENSE](LICENSE). Le thème Lens (HTML5 UP / AJ, CC BY 3.0) est crédité dans la page `credits.html`.

---

# Documentation technique

## Inférence

Modèle ponctuel initial inchangé, 77 variables. Jusqu'à 40 variables sont alimentées par le formulaire et le rapprochement d'adresse ; les autres restent manquantes et suivent les règles de préparation de `preprocessing.json`.

Cinq exports Python autonomes (point, bornes 80 % et 50 %) sont exécutés via Pyodide dans un Worker du navigateur, dans des espaces de noms séparés. Les chaînes catégorielles sont encodées en UTF-8/Latin-1 selon le dictionnaire de hash exporté.

## Adresse et rapprochement

- Géocodage IGN, puis recherche BDNB par clé d'interopérabilité BAN exacte et ADEME par `identifiant_ban` exact. Aucun rattachement par proximité.
- Fiche bâtiment unique préremplie ; choix explicite s'il y en a plusieurs. Seuls les champs bâtiment sont importés ; le DPE synthétique d'une fiche BDNB n'est jamais utilisé comme diagnostic de l'appartement.
- DPE : type appartement, surface renseignée, établi au plus tard le 30 juin 2026 et valide à cette date. Confirmation de l'utilisateur systématique ; choix par numéro, surface, étage et date, car une adresse n'identifie pas un appartement. Pas de DPE estimé. Les surfaces DVF/Carrez ne sont jamais remplacées par la surface DPE.
- Changement d'adresse : requêtes annulées, réponses périmées rejetées, valeurs préremplies effacées. Les saisies manuelles restent prioritaires ; confirmer un DPE applique ses valeurs explicites.
- Délais bornés, erreurs partielles gérées indépendamment, saisie manuelle toujours possible.
- BDNB : jusqu'à 10 fiches. ADEME : jusqu'à 100 diagnostics, troncature signalée. Requêtes directes depuis le navigateur (CORS vérifié avec l'origine du site), sans clé API ni persistance des adresses.

## Bornes personnalisées

- Deux paires de régressions quantiles sur log(prix), q10/q90 et q25/q75, chacune entraînée sur les 4 069 ventes antérieures à mai 2026.
- Calibration CQR distincte sur 317 ventes de mai : score `max(borne_basse - log_réel, log_réel - borne_haute)`, rang `ceil((n+1) × couverture)`, correction positive ou nulle. Les croisements de bornes sont réordonnés.
- Évaluation historique sur 239 ventes de juin : 84,94 % couvertes pour l'objectif 80 ; 48,54 % pour l'objectif 50. Le défaut reste 80.
- Les modèles ne garantissent pas une couverture conditionnelle à chaque bien. Ces couvertures ont été mesurées sur les données enrichies d'origine : elles ne valident ni les champs incomplets du formulaire ni les changements de millésime des API.
- Prix de référence au 30 juin 2026, sans ajustement de marché au-delà. Vigilance : les API renvoient leur millésime courant pour le bâtiment, sans historique daté garanti.

## Espace de suivi

- Les demandes d'accompagnement sont distinctes de l'estimation. La création de nouvelles demandes est désactivée ; les demandes existantes restent stockées en D1 (migration `drizzle/0000_leads.sql`).
- `/gestion` et `/api/admin/*` : identité authentifiée et e-mail du gestionnaire vérifiés côté serveur contre le secret `ADMIN_EMAIL`, jamais présent dans le code. Lecture, filtre, export CSV, notes privées, statut et suppression.
- `/mes-demandes` : chaque visiteur ne voit et ne supprime que ses propres demandes.
- Écritures protégées par vérification de l'origine, paramètres SQL liés et validation. Les pages privées et leurs données ne sont jamais mises en cache.
- Le Worker publié utilise l'identité injectée par la passerelle Sites. Avant un déploiement autonome, il faut raccorder une authentification serveur vérifiée et empêcher les clients d'envoyer ces en-têtes.

## Interface et thème

Thème Lens (HTML5 UP / AJ, CC BY 3.0), base CSS conservée dans `public/theme/lens/css/main.css` et adaptation applicative dans `public/style.css`. Les jetons de la charte graphique sont dans `public/brand/tokens.css`, généré depuis `design/` (voir [docs/08_design](docs/08_design/index.md)). Les originaux du thème sont conservés dans `design-reference/lens/`.

## Vérifications

`npm test` reconstruit le Worker, puis vérifie les droits sur les demandes, la page du formulaire et des estimations de référence (le code Python embarqué du Worker est exécuté tel quel).

Contrôle de performance manuel, sur un profil mobile avec cache désactivé : relever les entrées Performance `valometra-formulaire` au chargement et `valometra-estimation` à la première estimation valide. Dans l'onglet Réseau, vérifier que Pyodide et les modèles attendent une estimation, que Leaflet attend l'onglet marché, et que `market.json` n'est chargé qu'au premier usage du marché ou de l'estimation.
