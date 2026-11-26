# Architecture de Valometra-web

État après la refonte du Worker, le socle du front, le découpage de l'estimation et la réorganisation de `public/` (voir [Évolutions prévues](#évolutions-prévues)).

## Vue d'ensemble

```
Navigateur                                   Worker (Cloudflare)               D1 (SQLite)
┌───────────────────────────────┐  HTTPS   ┌──────────────────────────┐      ┌───────────────┐
│ Pages statiques (public/)     │ ───────▶ │ worker/ : fichiers + API │ ───▶ │ leads         │
│ Moteur d'estimation (Pyodide) │          │ en-têtes de sécurité     │      │ feedback      │
│ Historique (localStorage)     │          └──────────────────────────┘      └───────────────┘
└──────┬────────────────────────┘
       │ directement depuis le navigateur : IGN (géocodage, fond de carte), BDNB, ADEME, jsDelivr (Pyodide)
```

Principes :

- **L'estimation n'utilise aucun serveur de prédiction.** Cinq modèles CatBoost exportés en Python tournent dans un Worker du navigateur via Pyodide.
- **Le serveur est mince** : il sert les fichiers, applique les en-têtes de sécurité et expose une petite API (retour anonyme, espaces privés). Il ne reçoit jamais d'adresse.
- **Un seul fichier déployé** : `scripts/build.py` embarque `public/` et les modules de `worker/` dans `dist/server/index.js`.

## Arborescence

| Chemin | Rôle |
| --- | --- |
| `public/` | Site statique (détail ci-dessous) |
| `worker/` | Code du Worker (modules ES, voir ci-dessous) |
| `drizzle/` | Migrations D1 (`0000_leads.sql`, `0001_feedback.sql`) |
| `scripts/build.py` | Assemble le Worker dans `dist/` (ignoré par git) |
| `scripts/chrome.py` | Génère l'en-tête et le pied de page communs aux 4 pages HTML (`--check` les vérifie) |
| `design/` | Source des jetons de charte → `public/brand/tokens.css` (voir `docs/08_design`) |
| `tests/` | Tests Node (`*.test.mjs`) et régression du modèle (`model_regression.py`) |

### Contenu de `public/`

| Chemin | Rôle |
| --- | --- |
| `*.html`, `style.css`, `manifest.json`, `icons.svg` | Pages, feuille de style unique, manifeste PWA, sprite de pictogrammes |
| `sw.js` | Service worker, **à la racine** : sa portée est celle de son dossier |
| `js/` | Tout le code JavaScript (modules de l'accueil, pages privées, scripts classiques, moteur) |
| `data/` | Données publiques chargées à la demande : `metadata.json` (communes), `market.json` (ventes) |
| `models/` | Artefacts générés du modèle : `model*.py`, `intervals*.json`, `preprocessing.json` |
| `brand/`, `fonts/`, `vendor/` | Charte (jetons CSS, logos), polices hébergées, Leaflet |

Les chemins sont relatifs à la page : `data/…` et `js/…` depuis l'HTML, `../models/…` depuis `js/inference-worker.js`. Un test vérifie que tout script, module, jeu de données et modèle référencé est bien publié.

## Worker (`worker/`)

Le Worker traite toute requête en deux branches : `/api/*` va au routeur, le reste aux fichiers statiques.

| Module | Responsabilité |
| --- | --- |
| `service.mjs` | Point d'entrée `handle(request, env, assets)`. Aiguille API / statique ; toute erreur d'API non prévue devient un 503 neutre |
| `router.mjs` | Table `ROUTES` (méthode, chemin, `open` ou non, gestionnaire) et contrôles d'accès communs |
| `auth.mjs` | `identity()` (en-têtes `oai-authenticated-user-*`) et `isAdmin()` (comparaison à `ADMIN_EMAIL`) |
| `http.mjs` | `json()`, `readBody()` (12 000 caractères max), `isSameOriginJson()`, `cleanText()`, motif `UUID` |
| `feedback.mjs` | Retour anonyme : validation stricte, arrondi au millier, plafond de 300 par heure, résumé gestionnaire |
| `leads.mjs` | Demandes : liste de l'utilisateur, liste/filtre/export/suivi/suppression du gestionnaire |
| `property.mjs` | Lecture tolérante de la colonne `property_json` |
| `csv.mjs` | Export CSV (BOM, séparateur `;`, neutralisation des formules) |
| `assets.mjs` | Fichiers statiques : routes des pages privées, cache, ETag, en-têtes de sécurité |
| `security.mjs` | Politique de sécurité du contenu (CSP) et autres en-têtes |

### Ordre des contrôles de l'API

Pour une requête `/api/*`, `router.mjs` applique dans cet ordre :

1. Route marquée `open` (`/api/session`, `/api/health`, `POST /api/feedback`) : exécutée directement.
2. Pas d'identité → **401**.
3. Pas de base D1 → **503**.
4. Chemin sous `/api/admin/` sans être gestionnaire → **403**.
5. Écriture sans origine identique et corps JSON → **403**.
6. Route inconnue → **404**, sinon exécution du gestionnaire.

Cet ordre est volontairement conservé tel quel et verrouillé par `tests/service.test.mjs`.

### Routes

| Méthode et chemin | Accès | Effet |
| --- | --- | --- |
| `GET /api/session` | ouvert | `{ signedIn, admin }` |
| `GET /api/health` | ouvert | état de la base |
| `POST /api/feedback` | ouvert | enregistre un retour anonyme (201) |
| `GET /api/admin/feedback` | gestionnaire | décomptes et 50 derniers retours |
| `POST /api/leads` | connecté | toujours 410 : création fermée |
| `GET /api/my-requests` | connecté | ses propres demandes |
| `DELETE /api/my-requests/:id` | connecté | supprime sa demande |
| `GET /api/admin/leads` | gestionnaire | liste paginée (30), filtres `status`, `q`, `offset` |
| `GET /api/admin/leads/export` | gestionnaire | CSV (10 000 lignes max) |
| `PATCH /api/admin/leads/:id` | gestionnaire | statut et notes |
| `DELETE /api/admin/leads/:id` | gestionnaire | suppression |

**Ajouter une route** : écrire le gestionnaire `({ request, env, url, user, params }) => Response` dans le module du domaine, puis ajouter une ligne à `ROUTES`. `:id` n'accepte qu'un UUID.

### Pages et fichiers statiques

`/gestion` → `admin.html` (connexion et gestionnaire requis), `/mes-demandes` → `my-requests.html` (connexion requise), `/` → `index.html`. Les pages privées sont en `Cache-Control: no-store`. Polices, Leaflet, charte et pictogrammes : un jour de cache avec revalidation ; le reste est revalidé à chaque visite (ETag, 304). Les fichiers binaires sont décodés une fois puis gardés en mémoire.

### Assemblage (`scripts/build.py`)

Les modules sont assemblés en un seul fichier plat :

- l'ordre est déduit des `import './x.mjs'` (tri topologique à partir de `service.mjs`) ;
- les imports sont retirés et les `export` supprimés ; seul `export default { fetch }` est ajouté ;
- le build **échoue** sur un import circulaire ou sur un nom déclaré dans deux modules, car le bundle n'a qu'un espace de noms.

Contraintes d'écriture pour les modules du Worker : imports relatifs sur une seule forme `import { a, b } from './x.mjs';`, déclarations de premier niveau avec `function`, `const` ou `let`, noms uniques dans tout le Worker.

Le build écrit aussi `dist/server/wrangler.json` (liaison D1 `DB`, migrations) et copie `drizzle/`.

## Front (`public/`)

### Pages

| Page | Scripts | Contenu |
| --- | --- | --- |
| `index.html` | `js/app.js` (module, point d'entrée unique), `js/shell.js`, `js/theme.js` | Application : 4 vues (Estimer, Marché, Statistiques, Méthode) |
| `credits.html` | `js/shell.js`, `js/theme.js` | Crédits des ressources tierces |
| `admin.html`, `my-requests.html` | `js/shell.js`, `js/admin.js` / `js/my-requests.js` (modules) | Espaces privés |

Le même en-tête et pied de page sont répétés dans chaque page ; ils sont générés par `scripts/chrome.py`.

### Accueil : modules ES (dans `public/js/`)

| Module | Rôle |
| --- | --- |
| `app.js` | Point d'entrée : registre `PAGES`, routage par ancre (`#estimate`, `#market`…), mémoire du défilement, préchargement au survol, constellation du hero, chargement de `metadata.json` |
| `store.js` | `$`, `state` (`metadata`, `market`), `readJson`, `loadMarket()` (`data/market.json` chargé au premier usage) |
| `estimate.js` | Orchestrateur de l'estimation : soumission, états du bouton, affichage, historique |
| `form.js` | Lecture et validation du formulaire (`collectInputs`), préremplissage (`fillForm`), contrôles de choix |
| `engine.js` | Moteur : Worker Pyodide derrière `predict(features)` (promesse) ; ignore tout du DOM |
| `result.js` | Rendu du résultat (`resultHtml`) : fonctions pures qui renvoient du HTML |
| `simulator.js` | Simulateur « et si ? » : rendu et relance du moteur avec une variante |
| `feedback.js` | Retour anonyme sur la justesse (`POST /api/feedback`) |
| `share.js` | Lien partageable (valeurs du formulaire dans l'URL) |
| `address.js` | Saisie d'adresse : suggestions IGN, sélection, requêtes annulables |
| `enrichment.js` | Rapprochement BDNB et ADEME par identifiant BAN exact, choix du bâtiment et du DPE |
| `form-flow.js` | Mode DPE du formulaire (sans / saisi / confirmé) |
| `market.js` | Filtres, statistiques, histogramme, courbe, classement, tableau, export CSV |
| `map.js` | Leaflet à la demande, échelle de couleurs, légende |
| `history.js` | Historique local sur consentement (`localStorage`) et comparaison de deux biens |
| `ui.js` | Contrôle segmenté et liste personnalisée (le `<select>` reste la source de vérité) |

Modules partagés, sans dépendance au reste de l'application :

| Module | Rôle |
| --- | --- |
| `config.js` | `config` : valeurs de référence (date, couvertures, nombre de communes, jours depuis 2025), vérifiées par `tests/config.test.mjs` |
| `format.js` | Fonctions pures sans DOM (formats, statistiques, échelle de couleurs, liens partagés, historique), testées dans `tests/format.test.mjs` ; importe seulement `config.js` |
| `dom.js` | `$(id)` : seul accès par identifiant au DOM |

Scripts classiques, chargés hors du graphe de modules : `shell.js` (lien d'évitement, lien « gestion »), `theme.js` (thème clair/sombre, chargé dans `<head>` pour éviter un flash), `sw.js` (service worker : réseau d'abord, jamais d'API ni de page privée).

**Graphe de dépendances.** Chaque module déclare ses dépendances par `import` ; il n'y a plus de globale `window`. `index.html` ne charge que `app.js`, qui importe tout le reste (dont `history.js` et `form-flow.js` pour leurs effets). L'état de la dernière estimation (`lastInputs`, `lastPrediction`) est dans `store.js`. Les modules d'interface communiquent par trois événements : `valometra:estimated`, `valometra:reopen`, `valometra:dpe-confirmed`. **Ajouter un module** : l'importer depuis `app.js` ou depuis le module qui l'utilise, sans toucher aux pages HTML.

### Parcours d'une estimation

1. `app.js` charge `data/metadata.json` (communes) et active le formulaire.
2. L'utilisateur choisit une adresse (`address.js`) ; `enrichment.js` interroge BDNB et ADEME et préremplit le bâtiment. Le DPE doit être confirmé par l'utilisateur.
3. À la soumission, `estimate.js` fait lire le formulaire par `form.js` (`collectInputs`), démarre le moteur (`engine.js` → `inference-worker.js`, Pyodide depuis jsDelivr) et charge `market.json`.
4. Le Worker du navigateur, appelé par `predict()`, charge `model.py` et les 4 modèles de bornes, applique `preprocessing.json` et les corrections `intervals*.json`, puis renvoie l'estimation et les fourchettes 80 % et 50 %.
5. `estimate.js` affiche le HTML de `result.js` (prix, fourchette, repères locaux, comparables, simulateur, retour) et enregistre l'historique si l'utilisateur y a consenti.

### Modèle et données

`model*.py`, `intervals*.json` et `preprocessing.json` sont des **artefacts générés** : ne pas les éditer. Le code Python embarqué dans `inference-worker.js` est extrait par `tests/model_regression.py` : les deux doivent rester synchronisés. `market.json` stocke les colonnes une fois puis une ligne par vente ; `decodeMarket` (`store.js`) l'accepte aussi dans l'ancien format.

## Tests et CI

`npm test` = `scripts/chrome.py` + `scripts/build.py`, puis `node --test` sur `tests/*.test.mjs` et `tests/model_regression.py`. Les tests du service importent le bundle `dist/server/index.js` : ils vérifient donc aussi l'assemblage. La CI (`.github/workflows/checks.yml`) lance la même commande.

## Pistes d'évolution

Aucun lot en cours. `enrichment.js` et `market.js` restent de longs modules à état global : candidats au même découpage.

### Zones de prix dans Marché

La carte applique le même découpage statistique à toutes les communes,
Grenoble comprise. Elle subdivise l’étendue des ventes filtrées en cellules
contiguës et ne subdivise que si chaque partie conserve au moins dix ventes.
Les cellules voisines par un côté qui appartiennent à la même tranche de
médiane sont fusionnées. La médiane de la zone finale est calculée sur
toutes ses ventes. Les cinq tranches de couleur sont recalculées avec les
filtres, et les effectifs inférieurs à dix ne donnent pas de médiane.
Les zones suivent l’étendue des observations et peuvent englober des espaces
sans mutation. Le zonage IRIS de l’estimateur garde sa propre source.
