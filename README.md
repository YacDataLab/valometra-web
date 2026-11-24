# Valometra Estimation

Site statique : estimation locale avec le modèle CatBoost sauvegardé, bornes de prix conditionnelles, rapprochement adresse/BDNB/ADEME, explorateur SIG.

## Inférence
Point : modèle initial inchangé, 77 variables. Jusqu’à 40 variables alimentées par le formulaire et le rapprochement adresse. Les autres restent manquantes et suivent les règles de préparation documentées dans preprocessing.json.
5 exports Python autonomes exécutés via Pyodide dans un Worker du navigateur, namespaces séparés. Chaînes catégorielles UTF-8/Latin-1 selon le dictionnaire de hash exporté. Aucun serveur de prédiction.

## Adresse et rapprochement
Géocodage IGN puis recherche BDNB par clé d’interopérabilité BAN exacte et ADEME par identifiant_ban exact. Aucun rattachement par proximité. Fiche bâtiment unique préremplie ; choix explicite si plusieurs. DPE de type appartement, surface renseignée, date antérieure ou égale au 30 juin 2026 et valide à cette date. Confirmation utilisateur systématique avant application du DPE. Les surfaces DVF/Carrez ne sont jamais remplacées par la surface DPE. Choix par numéro, surface, étage et date ; une adresse n’identifie pas un appartement. Pas de DPE estimé.
Le DPE synthétique exposé dans une fiche BDNB n’est jamais utilisé comme diagnostic de l’appartement. Seuls les champs bâtiment sont importés de cette fiche.
Changement d’adresse : requêtes annulées, réponses périmées rejetées, valeurs précédemment préremplies effacées. Les saisies manuelles restent prioritaires ; confirmer un DPE applique les valeurs explicites de ce diagnostic. Délais de recherche bornés, erreurs partielles gérées indépendamment et saisie manuelle disponible.
BDNB : jusqu’à 10 fiches. ADEME : jusqu’à 100 diagnostics, troncature signalée. Requêtes directes depuis le navigateur, CORS vérifié avec l’origine du site. Pas de clé API ni de persistance des adresses.

## Bornes personnalisées
Deux paires de régressions quantiles sur log(prix), q10/q90 et q25/q75, chacune entraînée sur les 4069 ventes antérieures à mai 2026. Calibration CQR distincte sur 317 ventes de mai : score max(borne_basse - log_réel, log_réel - borne_haute), rang ceil((n+1)*couverture), correction positive ou nulle. Croisements de bornes réordonnés. Évaluation historique sur 239 ventes de juin : 84,94 % couverts pour l’objectif80 ; 48,54 % pour l’objectif50.
Aucun coefficient de l’ancienne fourchette multiplicative n’est utilisé. L’onglet Estimer affiche la fourchette dont l’objectif de couverture est de 80 %. Les modèles ne garantissent pas une couverture conditionnelle à chaque bien. Le jeu historique a déjà été exploré lors du diagnostic antérieur du modèle. Ces couvertures ont été mesurées sur les données enrichies d’origine et ne constituent pas une validation des champs incomplets du formulaire ou des changements de millésime des API.
Prix de référence au 30 juin2026. Aucun ajustement du marché au-delà. Point de vigilance : les API retournent leur millésime courant pour le bâtiment, sans historique as-of garanti.

## Vérification
Contrôles fonctionnels offline : check-address.cjs, check-enrichment.cjs et check-estimation-enriched.cjs dans /workspace/work. APIs BDNB/ADEME vérifiées sur le 25 rue Charrel Grenoble : bâtiment unique et16 DPE. Compatibilité de chaque export quantile vérifiée contre le modèle natif sur239 ventes et exécution du code Python du Worker testée.
Aperçu navigateur indisponible dans cet environnement (relay preview).


## Formulaire simplifié et espace de suivi
Source des fichiers statiques : public/. Build Worker autonome : python3 scripts/build.py. Le build embarque les assets pour préserver l’inférence Python dans le navigateur, les API adresse et la carte. Le modèle central et les modèles de bornes sont inchangés. Modifications de saisie : surface et pièces non préremplies, définition de surface et type visibles ; dépendances inconnues laissées vides ; DPE retrouvé/manuel/absent ; détails avancés repliés.

Les demandes d’accompagnement sont distinctes de l’estimation et nécessitent une action explicite et une case de contact non précochée. Aucun e-mail ni SMS automatique. Enregistrement D1 DB, schema-only migration drizzle/0000_leads.sql. Coordonnées, projet, instantané essentiel de l’estimation, date/version de consentement. Pas de stockage des77variables ni de suivi publicitaire des clics. Authentification ChatGPT de la plateforme conservée. L’accès au site reste privé selon son audience existante.

Gestion /gestion et /api/admin/* : identité authentifiée et e-mail du gestionnaire vérifiés côté serveur contre le secret ADMIN_EMAIL. Aucun bootstrap « premier utilisateur devient admin ». Le secret est configuré par l’outil Sites, jamais dans le code. Lecture des demandes, filtre, export CSV, notes privées, changement de statut et suppression. Les visiteurs ne peuvent consulter et supprimer que leurs propres demandes sur /mes-demandes. Protection même origine des écritures, paramètres SQL liés, validation et idempotence. Les pages privées et les données ne sont pas mises en cache.

Tests : /workspace/work/check-leads.mjs (SQLite de test), check-form-flow.cjs, check-enrichment-form.cjs, check-address-form.cjs, check-estimation-form.cjs. Aucun contact réel n’est créé pendant les tests.


## Thème Lens appliqué le23novembre2026
Archive html5up-lens.zip fournie par l’utilisateur. Base CSS Lens conservée sous public/theme/lens/css/main.css, adaptation applicative dans public/style.css. Police Roboto, accent turquoise, panneau blanc à droite et visionneuse panoramique à gauche ; galerie de3vues. Carte et méthode en pleine largeur ; mobile empilé. La visionneuse adaptée est pilotée par lens-adapter.js, sans raccourcis globaux du script de galerie original qui interféreraient avec le formulaire. Identifiants fonctionnels, modèles, règles d’inférence, base D1 et protection de l’espace privé conservés.
Lens : HTML5 UP / AJ, CC BY3.0. Attribution visible en pied de page, licence fournie et page crédits. Import Font Awesome inutilisé retiré de la CSS du thème pour éviter les polices non utilisées dans le Worker ; originaux conservés dans design-reference/lens/.
Aperçu navigateur indisponible : la CLI de preview n’a pas de script dev pour ce Worker autonome. Contrôles fonctionnels et de ressources maintenus.

## Vérifications avant export

Exécuter `npm test` avec Node.js 24 et Python 3.12. La commande reconstruit
le Worker puis vérifie les droits sur les demandes, la page du formulaire
et deux estimations de référence. Le workflow GitHub exécute la même commande.

Sur un profil mobile avec cache désactivé, relever les entrées Performance
`valometra-formulaire` au chargement et `valometra-estimation` à la première
estimation valide. Dans Réseau, vérifier que Pyodide et les modèles attendent
une estimation, que Leaflet attend l’onglet marché et que `market.json` est
chargé au premier usage du marché ou de l’estimation.

Le Worker publié dans ChatGPT utilise l’identité injectée par la passerelle
Sites. Avant un déploiement autonome, raccorder une authentification serveur
vérifiée et empêcher la transmission de ces en-têtes depuis les clients.
Le stockage des demandes existantes reste privé. La création de nouvelles
demandes est désactivée.

## Docker (optionnel)

Docker n'est pas nécessaire pour contribuer : `npm test` (Node.js 24 et Python 3.12) reste la vérification de référence, exécutée par le workflow GitHub.

Pour lancer le site localement dans un conteneur :

```bash
docker compose up --build
```

Le site est servi sur http://localhost:8787. La base D1 locale (SQLite) est conservée dans le volume `web-data` ; `docker compose down -v` la supprime. Le conteneur exécute `wrangler dev --local`, destiné au développement : l'identité injectée par la passerelle Sites n'existe pas ici, donc `/gestion` et `/mes-demandes` ne sont pas utilisables. Après une modification de `public/` ou `worker/`, relancer avec `--build`.
