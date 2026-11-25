#!/usr/bin/env python3
"""Génère l'en-tête et le pied de page communs aux quatre pages HTML.

Une seule source : ce script. Il réécrit les blocs <header> et <footer> de chaque page.
`python3 scripts/chrome.py --check` échoue si une page n'est pas à jour (utilisé par les tests).
"""

import re
import sys
from pathlib import Path

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# Racine des liens : vide sur l'accueil (navigation par ancre), « / » sur les autres pages.
PAGES = {
    "index": {"root": "", "current": None, "admin_link_hidden": True},
    "credits": {"root": "/", "current": "credits", "admin_link_hidden": True},
    "admin": {"root": "/", "current": "admin", "admin_link_hidden": False},
    "my-requests": {"root": "/", "current": "my-requests", "admin_link_hidden": True},
}

GITHUB = "https://github.com/YacDataLab/valometra-web"
LICENSE = GITHUB + "/blob/main/LICENSE"
VIEWS = [("estimate", "Estimer"), ("market", "Marché"), ("statistiques", "Statistiques"), ("method", "Méthode")]


def header(root):
    links = "\n".join(f'<a href="{root}#{view}">{label}</a>' for view, label in VIEWS)
    return f"""<header class="site-header" id="header">
<div class="bar">
<a class="brand" href="{root}#estimate"><img src="brand/valometra-logo.svg" alt="Valometra, accueil"></a>
<nav class="site-nav" aria-label="Navigation principale">
{links}
</nav>
<div class="header-tools">
<a class="tool" href="{GITHUB}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-brand-github"/></svg><span>Code source</span><span class="sr-only"> (nouvel onglet)</span></a>
<button type="button" class="tool" id="theme-toggle"><svg class="icon" aria-hidden="true" focusable="false"><use href="icons.svg#i-moon"/></svg><span>Mode sombre</span></button>
</div>
</div>
</header>"""


def footer(root, current, admin_link_hidden):
    def aria(key):
        return ' aria-current="page"' if key == current else ""

    hidden = " hidden" if admin_link_hidden else ""
    return f"""<footer class="site-footer" id="footer">
<div class="footer-main">
<div class="footer-brand">
<a class="brand" href="{root}#estimate"><img src="brand/valometra-logo.svg" alt="Valometra, accueil"></a>
<p>L’immobilier, en perspective.</p>
</div>
<nav class="footer-links" aria-label="Liens de bas de page">
<a href="{LICENSE}" target="_blank" rel="noopener">Licence AGPL-3.0</a>
<a href="/mes-demandes"{aria("my-requests")}>Mes demandes</a>
<a id="admin-link" href="/gestion"{hidden}{aria("admin")}>Espace privé</a>
<a href="/credits.html"{aria("credits")}>Crédits</a>
</nav>
</div>
<p class="version-line">Prix au 30 juin 2026 · ventes de juillet 2025 à juin 2026 · modèle évalué sur 556 ventes de mai et juin 2026 · <a href="{root}#method">Méthode et limites</a></p>
</footer>"""


def render(name):
    """Renvoie le HTML de la page avec en-tête et pied de page régénérés."""
    config = PAGES[name]
    html = (PUBLIC / f"{name}.html").read_text(encoding="utf-8")
    head = header(config["root"])
    foot = footer(config["root"], config["current"], config["admin_link_hidden"])
    html, n_head = re.subn(r'<header class="site-header" id="header">.*?</header>', lambda _: head, html, flags=re.S)
    html, n_foot = re.subn(r'<footer class="site-footer" id="footer">.*?</footer>', lambda _: foot, html, flags=re.S)
    if n_head != 1 or n_foot != 1:
        raise SystemExit(f"{name}.html : en-tête ou pied de page introuvable")
    return html


def main():
    check = "--check" in sys.argv[1:]
    stale = []
    for name in PAGES:
        path = PUBLIC / f"{name}.html"
        generated = render(name)
        if check:
            if path.read_text(encoding="utf-8") != generated:
                stale.append(path.name)
        else:
            path.write_text(generated, encoding="utf-8")
    if stale:
        raise SystemExit("En-tête ou pied de page à régénérer (python3 scripts/chrome.py) : " + ", ".join(stale))


if __name__ == "__main__":
    main()
