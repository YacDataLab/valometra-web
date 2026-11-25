# Valometra-web

Valometra-web est l'application web open source de l'estimateur immobilier Valometra. Elle permet aux développeurs de contribuer à l'évolution de ses fonctionnalités et à l'amélioration de l'expérience utilisateur, tout en renforçant ses capacités d'aide à la décision.

L'application s'appuie sur un modèle d'estimation entraîné sur le jeu de données Valometra. Son périmètre géographique couvre actuellement **Grenoble et sa métropole** (39 communes), avec pour ambition de proposer des estimations tenant compte des spécificités immobilières, économiques et territoriales propres à chaque commune.

L'objectif est de développer un outil d'estimation toujours plus précis, transparent et adapté aux réalités locales.

## Fonctionnalités

- Estimation locale avec le modèle CatBoost sauvegardé : l'inférence s'exécute dans le navigateur, sans serveur de prédiction.
- Fourchette de prix personnalisée (objectif de couverture 80 %).
- Rapprochement d'adresse avec les bases BDNB et ADEME (DPE).
- Résultat détaillé : jauge de la fourchette, prix au m² situé par rapport à la médiane locale, indicateur de précision, ventes comparables les plus proches, simulateur « et si ? » (surface, pièces, dépendances, DPE), impression, lien partageable.
- Explorateur du marché : carte, filtres partageables par l'URL, statistiques, courbe mensuelle du prix médian, classement des communes et export CSV.
- Historique local des estimations (facultatif, dans le navigateur) avec comparaison de deux biens.
- Retour anonyme sur la justesse d'une estimation.
- Mode clair et sombre, installation en application et usage hors connexion.
- Espaces privés pour les demandes d'accompagnement déjà enregistrées.

## Principes clés

Ce qui guide chaque choix du projet (le détail est dans la [documentation technique](#documentation-technique)) :

- **Modèle inchangé, 77 variables.** Le formulaire en renseigne jusqu'à 40 ; les autres restent manquantes et suivent les règles de `preprocessing.json`.
- **Aucun serveur de prédiction.** Cinq exports Python (estimation, bornes 80 % et 50 %) tournent via Pyodide dans le navigateur.
- **Une adresse, des sources officielles.** Géocodage IGN, puis BDNB (bâtiment) et ADEME (DPE) par identifiant BAN exact, jamais par proximité.
- **Le DPE est toujours confirmé par l'utilisateur.** Une adresse n'identifie pas un appartement : pas de DPE estimé, et la surface DPE ne remplace jamais la surface DVF/Carrez.
- **Des fourchettes honnêtes.** Régressions quantiles calibrées (CQR) : 84,9 % de couverture mesurée pour l'objectif 80 %, sans garantie pour un bien précis.
- **Un prix de référence daté.** Valeur au 30 juin 2026, sans ajustement de marché ultérieur ; les API renvoient leur millésime courant, sans historique garanti.
- **Vie privée.** Pas de clé API, pas de stockage des adresses côté serveur, pas de suivi publicitaire ; les pages privées et les API ne sont jamais mises en cache. L'historique des estimations reste dans le navigateur, sur consentement ; le retour sur une estimation est anonyme (voir Espace de suivi).
- **Transparence.** Les limites du modèle sont affichées dans l'application (page « Méthode ») et les chiffres affichés sont ceux de l'évaluation historique.

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
2. Modifiez `public/` (`js/` interface, `models/` modèles, `data/` données) ou `worker/` (service).
3. Formatez le code avec `npm run format` (Prettier, configuré dans `.prettierrc.json`), puis vérifiez que `npm test` passe.
4. Ouvrez une pull request en décrivant le changement et son effet sur les estimations.

Les pistes les plus utiles : couverture d'autres communes, amélioration du formulaire et de l'expérience utilisateur, transparence des estimations et des bornes, tests. Les règles de travail détaillées sont dans [CLAUDE.md](CLAUDE.md).

## Licence

Code sous licence GNU AGPL v3, voir [LICENSE](LICENSE). Les ressources tierces (polices, pictogrammes, cartographie) sont créditées dans la page `credits.html`.

---

## Documentation technique

L'organisation du code (Worker, front, assemblage) est détaillée dans [docs/architecture.md](docs/architecture.md).
Les sources et l’import de la base de visualisation sont décrits dans [docs/dataviz-data.md](docs/dataviz-data.md).

### Inférence

Modèle ponctuel initial inchangé, 77 variables. Jusqu'à 40 variables sont alimentées par le formulaire et le rapprochement d'adresse ; les autres restent manquantes et suivent les règles de préparation de `preprocessing.json`.

Cinq exports Python autonomes (point, bornes 80 % et 50 %) sont exécutés via Pyodide dans un Worker du navigateur, dans des espaces de noms séparés. Les chaînes catégorielles sont encodées en UTF-8/Latin-1 selon le dictionnaire de hash exporté.

### Adresse et rapprochement

- Géocodage IGN, puis recherche BDNB par clé d'interopérabilité BAN exacte et ADEME par `identifiant_ban` exact. Aucun rattachement par proximité.
- Fiche bâtiment unique préremplie ; choix explicite s'il y en a plusieurs. Seuls les champs bâtiment sont importés ; le DPE synthétique d'une fiche BDNB n'est jamais utilisé comme diagnostic de l'appartement.
- DPE : type appartement, surface renseignée, établi au plus tard le 30 juin 2026 et valide à cette date. Confirmation de l'utilisateur systématique ; choix par numéro, surface, étage et date, car une adresse n'identifie pas un appartement. Pas de DPE estimé. Les surfaces DVF/Carrez ne sont jamais remplacées par la surface DPE.
- Changement d'adresse : requêtes annulées, réponses périmées rejetées, valeurs préremplies effacées. Les saisies manuelles restent prioritaires ; confirmer un DPE applique ses valeurs explicites.
- Délais bornés, erreurs partielles gérées indépendamment, saisie manuelle toujours possible.
- BDNB : jusqu'à 10 fiches. ADEME : jusqu'à 100 diagnostics, troncature signalée. Requêtes directes depuis le navigateur (CORS vérifié avec l'origine du site), sans clé API ni persistance des adresses.

### Bornes personnalisées

- Deux paires de régressions quantiles sur log(prix), q10/q90 et q25/q75, chacune entraînée sur les 4 069 ventes antérieures à mai 2026.
- Calibration CQR distincte sur 317 ventes de mai : score `max(borne_basse - log_réel, log_réel - borne_haute)`, rang `ceil((n+1) × couverture)`, correction positive ou nulle. Les croisements de bornes sont réordonnés.
- Évaluation historique sur 239 ventes de juin : 84,94 % couvertes pour l'objectif 80 ; 48,54 % pour l'objectif 50. Le défaut reste 80.
- Les modèles ne garantissent pas une couverture conditionnelle à chaque bien. Ces couvertures ont été mesurées sur les données enrichies d'origine : elles ne valident ni les champs incomplets du formulaire ni les changements de millésime des API.
- Prix de référence au 30 juin 2026, sans ajustement de marché au-delà. Vigilance : les API renvoient leur millésime courant pour le bâtiment, sans historique daté garanti.

### Espace de suivi

- Les demandes d'accompagnement sont distinctes de l'estimation. La création de nouvelles demandes est désactivée ; les demandes existantes restent stockées en D1 (migration `drizzle/0000_leads.sql`).
- `/gestion` et `/api/admin/*` : identité authentifiée et e-mail du gestionnaire vérifiés côté serveur contre le secret `ADMIN_EMAIL`, jamais présent dans le code. Lecture, filtre, export CSV, notes privées, statut et suppression.
- `/mes-demandes` : chaque visiteur ne voit et ne supprime que ses propres demandes.
- Écritures protégées par vérification de l'origine, paramètres SQL liés et validation. Les pages privées et leurs données ne sont jamais mises en cache.
- Le Worker publié utilise l'identité injectée par la passerelle Sites. Avant un déploiement autonome, il faut raccorder une authentification serveur vérifiée et empêcher les clients d'envoyer ces en-têtes.

### Retour anonyme

`POST /api/feedback` (sans connexion) enregistre dans la table D1 `feedback` (migration `drizzle/0001_feedback.sql`) : l'avis (trop basse, juste, trop haute), le code commune, la surface et le nombre de pièces, le prix estimé arrondi au millier et, si l'utilisateur le connaît, le prix réel. Aucune adresse, coordonnée ni identifiant n'est reçue ni stockée. Le Worker vérifie l'origine, valide strictement les champs et plafonne le total à 300 retours par heure (aucune donnée personnelle ne permet de limiter par visiteur). `/gestion` affiche un résumé réservé au gestionnaire (`GET /api/admin/feedback`).

### Sécurité et hors connexion

- Le Worker ajoute à chaque page une politique de sécurité du contenu (`script-src` sans script en ligne, sources limitées à jsDelivr pour Pyodide, IGN pour le géocodage et le Plan IGN, BDNB, ADEME), `X-Frame-Options: DENY` et une `Permissions-Policy` restrictive. Toute nouvelle source externe doit être ajoutée à `contentSecurityPolicy` dans `worker/security.mjs`, avec son test.
- Limite connue : Pyodide est chargé depuis jsDelivr sans contrôle d'intégrité (le chargeur ne le permet pas). L'auto-hébergement du moteur supprimerait cette dépendance, mais alourdirait le Worker de plusieurs mégaoctets.
- `public/sw.js` garde une copie locale des pages publiques (réseau d'abord, copie en secours). Il n'intercepte jamais `/api/`, `/gestion` ni `/mes-demandes`. Modifier `CACHE` pour forcer le renouvellement.
- Les valeurs de référence (date, couvertures, nombre de communes, jours depuis 2025) sont dans `public/js/config.js` ; `tests/config.test.mjs` vérifie leur cohérence avec les pages et les métadonnées.

### Interface et thème

Deux polices, Plus Jakarta Sans (titres) et Inter (texte), sont hébergées dans `public/fonts/` (sous-ensemble latin, licence OFL) : aucun service de polices externe. L'application n'utilise pas IBM Plex Mono, que la charte réserve à la documentation. Les pictogrammes sont un sprite SVG (jeu Tabler, MIT) dans `public/icons.svg`, et la constellation des communes du hero est dessinée par `renderConstellation` à partir de `metadata.json`. Le thème clair ou sombre suit le choix mémorisé dans le navigateur, sinon le réglage du système (`public/js/theme.js`). Une seule feuille de style, `public/style.css`, couvre les quatre pages ; le même en-tête et le même pied de page sont repris sur chacune. Ils sont générés par `scripts/chrome.py` (lancé par `npm run build`) à partir d’une source unique, et `--check` vérifie qu’ils sont à jour. Le fond de carte est le Plan IGN en couleur ; les ventes y sont dessinées sur une échelle de cuivres continue (du 5e au 95e centile), avec sa légende. Le code JavaScript est dans `public/js/`, les données dans `public/data/` et les modèles dans `public/models/`. Le code de l'accueil est découpé en modules ES : `app.js` (navigation et démarrage), `estimate.js` (formulaire, moteur, résultat), `market.js` (filtres, graphiques, tableau), `map.js` (carte et légende), `store.js` (état et données partagés) et `ui.js` (contrôle segmenté pour 2 ou 3 choix, liste personnalisée pour les autres listes déroulantes, avec champ filtrable pour les communes). Pour ajouter une vue à l'accueil : créer sa `<section class="page">` dans `index.html`, ajouter son lien dans `<nav class="site-nav">`, puis une entrée dans `PAGES` (`public/js/app.js`) ; `tests/accessibility.test.mjs` vérifie que les trois sont cohérents. Les fonctions pures partagées par toutes les pages (échappement, formats, échelle de couleurs) sont dans `public/js/format.js`. L'échelle typographique (6 corps de texte, 4 de titres, aucun texte sous 13 px) est définie en tête de `style.css`. Les jetons de la charte graphique sont dans `public/brand/tokens.css`, généré depuis `design/` (voir [docs/08_design](docs/08_design/index.md)).

### Vérifications

`npm test` reconstruit le Worker, puis vérifie les droits sur les demandes, le retour anonyme, les en-têtes de sécurité, les fonctions d'affichage (`public/js/format.js`), la cohérence des constantes, les contrastes WCAG des deux thèmes, l'accessibilité statique des pages, le manifeste et des estimations de référence (le code Python embarqué du Worker est exécuté tel quel). Les contrôles d'accessibilité sont statiques : ils ne remplacent pas un essai au lecteur d'écran.

Contrôle de performance manuel, sur un profil mobile avec cache désactivé : relever les entrées Performance `valometra-formulaire` au chargement et `valometra-estimation` à la première estimation valide. Dans l'onglet Réseau, vérifier que Pyodide et les modèles attendent une estimation, que Leaflet attend l'onglet marché, et que `market.json` n'est chargé qu'au premier usage du marché ou de l'estimation.
