# Valometra-web : règles de travail pour les agents

Application web open source d'estimation immobilière (Grenoble et métropole). Voir [README.md](README.md) pour le fonctionnement technique.

## Commandes

- `npm test` : build puis tests (Node 24, Python 3.12). Doit passer avant tout commit.
- `npm run format` / `npm run format:check` : Prettier. Ne pas reformater à la main.
- `python3 scripts/build.py` : génère `dist/` (ignoré par git, ne jamais le commiter).

## Collaboration

- Ne jamais travailler directement sur `main` : une branche par sujet (`feature/…`, `fix/…`, `refactor/…`), puis une pull request.
- Un changement = un objectif. Ne pas mélanger reformatage, refactorisation et changement de comportement dans le même commit.
- Commits petits, message à l'impératif en français, expliquant le pourquoi.
- Ne commiter, pousser ou ouvrir une PR que sur demande explicite. Ne jamais forcer un push ni réécrire l'historique partagé.
- Ne pas modifier la config git (identité, hooks) sans accord.
- Décrire dans la PR ce qui change, comment c'est vérifié et son effet éventuel sur les estimations.

## Qualité

- Lire le code concerné avant de le modifier ; respecter les conventions existantes.
- Corriger la cause, pas le symptôme. Pas de code mort, de commentaire obsolète ni de TODO sans suite.
- Tout changement de comportement s'accompagne d'un test. Un bug corrigé reçoit un test de non-régression.
- Ne jamais affaiblir ou supprimer un test pour le faire passer.
- Signaler honnêtement ce qui n'a pas été vérifié (tests non lancés, navigateur non testé).
- Garder le diff minimal : pas de dépendance ni de fichier ajouté sans nécessité.

## Spécifique au projet

- Les modèles (`public/model*.py`, `intervals*.json`, `preprocessing.json`) sont des artefacts générés : ne pas les éditer à la main. Tout changement de modèle ou de bornes doit mettre à jour `tests/model_regression.py` et être justifié dans la PR.
- Le code Python embarqué dans `public/inference-worker.js` est extrait par `tests/model_regression.py` : garder les deux synchronisés.
- Vie privée : aucun stockage d'adresse ou de coordonnées au-delà de l'existant, aucune clé API ni secret dans le code (`ADMIN_EMAIL` reste un secret de plateforme), aucun suivi publicitaire.
- Sécurité du Worker : conserver la vérification de l'origine sur les écritures, les requêtes SQL paramétrées et `Cache-Control: no-store` sur les pages privées.
- Les en-têtes `oai-authenticated-user-*` ne sont fiables que derrière la passerelle Sites : ne pas s'appuyer dessus pour un déploiement autonome.
- Les textes affichés (couverture, date de référence, nombre de communes) sont des chiffres vérifiés : ne les changer qu'avec la source qui les justifie.
- Interface et messages en français ; accessibilité et usage mobile à préserver.
