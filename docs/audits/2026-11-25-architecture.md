# Audit d’architecture Valometra Web — 25 novembre 2026

**Note initiale de 71,25/100 (7,1/10). Objectif de 80/100.**
Le découpage actuel permet de poursuivre l’évolution du logiciel par petites PR.
Les priorités sont les tests par cible de déploiement, la reprise après incident,
le contrat des graphiques D1 et l’isolation de la logique d’enrichissement.

## Périmètre et méthode

La référence auditée est le commit [205e043](https://github.com/YacDataLab/valometra-web/commit/205e0433ae85befd9702e372089677462fa03c69)
de la [PR #13](https://github.com/YacDataLab/valometra-web/pull/13).
L’examen a porté sur le code, les tests et les configurations de build et de
déploiement. `npm test` a réussi avec 102 tests JavaScript et trois tests Python.
Les performances mobiles, le comportement des cibles distantes et la restauration
d’une base distante restent à démontrer.

Chaque note sur dix tient compte des responsabilités dans le code, des tests
qui démontrent les garanties et des preuves d’exécution représentatives.

| Note | Preuve attendue |
| --- | --- |
| 0–3 | Parcours essentiel absent, incohérent ou impossible à vérifier. |
| 4–6 | Mécanisme présent, avec des garanties manuelles ou des tests incomplets. |
| 7–8 | Responsabilités claires, parcours importants testés et limites documentées. |
| 9–10 | Garanties démontrées par des tests ciblés et des mesures ou exercices reproductibles lorsque le critère l’exige. |

Le total sur 100 est la somme des notes divisées par dix et multipliées par
leur poids. Les cibles sont des hypothèses à réévaluer avec les preuves
obtenues. Une faiblesse critique confirmée sur les accès ou les données
doit être traitée avant de considérer l’objectif atteint.

## Grille initiale

| Critère | Poids | Note | Cible | Constat |
| --- | ---: | ---: | ---: | --- |
| Découpage et responsabilités | 15 % | 8 | 8 | Le Worker distingue le routage, l’identité et les domaines fonctionnels. Le navigateur sépare formulaire, moteur et affichage. |
| Couplage et facilité de modification | 15 % | 7 | 8 | L’enrichissement rassemble les appels externes, la décision bâtiment et IRIS et la mise à jour du formulaire. L’assemblage du Worker partage un espace de noms. |
| Identité et accès aux données | 15 % | 7,5 | 7,5 | Le contrôle est centralisé et les opérations personnelles filtrent par utilisateur. L’identité du parcours privé dépend de la passerelle Sites. |
| Architecture des données | 15 % | 8 | 8,5 | DVF sépare mutations et lignes source. Les sources sont vérifiables. L’import D1 est testé localement et le graphique actuel lit encore `market.json`. |
| Performance et coûts | 10 % | 6 | 8 | L’inférence se fait dans un Worker du navigateur. Le coût de la première estimation et du chargement des données sur mobile reste à mesurer. |
| Build, déploiement et portabilité | 15 % | 6 | 8 | Docker et Cloudflare sont documentés. Les fonctions exposées diffèrent entre le build public et le build complet. |
| Exploitation et reprise | 5 % | 5 | 8 | Une route de santé existe. L’examen du dépôt n’a pas établi de procédure de restauration testée ou d’éléments de diagnostic suffisants en cas d’incident. |
| Tests et maintenabilité open source | 10 % | 8 | 8 | Licence AGPL, documentation et tests du code et du modèle. Les parcours navigateur complets par cible restent à démontrer. |
| **Total** | **100 %** | **71,25/100** | **80/100** | |

Les quatre seuils Python restent des contrôles distincts de cette notation.
Bandit exige zéro alerte moyenne ou élevée, `pip-audit` zéro vulnérabilité
connue, Pylint au moins 9,5/10 et `pytest-cov` au moins 80 % de couverture
combinée des instructions et des branches.

## Travaux et preuves de clôture

| Issue | Preuve attendue |
| --- | --- |
| [#15 — Cibles de déploiement](https://github.com/YacDataLab/valometra-web/issues/15) | Matrice des fonctions, de l’identité et des bases par cible. Build depuis un clone frais et tests des fonctions exposées et des accès privés. |
| [#16 — Premier graphique D1](https://github.com/YacDataLab/valometra-web/issues/16) | Contrat de la série mensuelle, chiffres de référence, cas vide et base indisponible, budget de lignes lues mesuré. |
| [#17 — Enrichissement bâtiment et IRIS](https://github.com/YacDataLab/valometra-web/issues/17) | Tests de décision indépendants du formulaire, puis vérification des changements rapides d’adresse et des parcours BDNB, ADEME et DPE. |
| [#18 — Performance mobile](https://github.com/YacDataLab/valometra-web/issues/18) | Mesures avant et après du formulaire, de la première estimation à froid et du graphique, selon le même profil mobile et réseau. |
| [#19 — Restauration et retour arrière](https://github.com/YacDataLab/valometra-web/issues/19) | Reconstruction vérifiée des données publiques et exercice de restauration et de retour arrière sur un environnement isolé. |

Le [ticket de suivi #14](https://github.com/YacDataLab/valometra-web/issues/14)
regroupe les PR, résultats et mesures. Au nouvel audit, reporter le commit
évalué, les preuves par critère et les risques résiduels, puis recalculer le
total avec les mêmes poids.

Pour une livraison open source, vérifier également les licences du code, des
données, des modèles et des ressources, ainsi que le canal de signalement de
sécurité. L’introduction d’espaces par organisation nécessiterait des tests
d’isolation des lectures, écritures et exports entre organisations.

## Références

- [Architecture du code](../architecture.md)
- [Pipeline de données et import D1](../dataviz-data.md)
- [Règles de qualité du dépôt](../../CLAUDE.md)
