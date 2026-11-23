# Charte graphique Valometra

Source unique de l'identité visuelle. Documentation complète :
`docs/08_design/` (section « Charte graphique » du site).

| Fichier | Rôle |
|---|---|
| `tokens/valometra.tokens.json` | Design tokens (format W3C) : **seul fichier à modifier** pour changer une couleur, une police, un espacement |
| `logo/*.svg` | Fichiers maîtres du logo |
| `build_tokens.py` | Génère `docs/assets/stylesheets/valometra-tokens.css`, `docs/08_design/reference.md` et copie les logos dans `docs/assets/images/` |
| `CHANGELOG.md` | Historique des versions de la charte |

```bash
uv run python design/build_tokens.py          # régénérer après modification
uv run python design/build_tokens.py --check  # vérifier (utilisé par les tests)
```

Procédure d'évolution et versionnement : `docs/08_design/evolution.md`.
