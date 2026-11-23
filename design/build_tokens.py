"""Génère les livrables de la charte graphique depuis les design tokens.

Source unique : ``design/tokens/valometra.tokens.json`` (format W3C Design Tokens).
Sorties (à ne jamais modifier à la main) :

- ``docs/assets/stylesheets/valometra-tokens.css`` : variables CSS ``--vm-*`` ;
- ``docs/08_design/reference.md`` : page de référence (valeurs, contrastes) ;
- ``docs/assets/images/*.svg`` : copie des logos de ``design/logo/``.

Usage ::

    uv run python design/build_tokens.py          # régénère
    uv run python design/build_tokens.py --check  # échoue si les sorties sont périmées
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

DESIGN_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = DESIGN_DIR.parent
TOKENS_PATH = DESIGN_DIR / "tokens" / "valometra.tokens.json"
LOGO_DIR = DESIGN_DIR / "logo"
CSS_PATH = PROJECT_ROOT / "docs" / "assets" / "stylesheets" / "valometra-tokens.css"
IMAGES_DIR = PROJECT_ROOT / "docs" / "assets" / "images"
REFERENCE_PATH = PROJECT_ROOT / "docs" / "08_design" / "reference.md"

# Paires (texte, fond) de tokens sémantiques dont le contraste est garanti.
CONTRAST_PAIRS = [
    ("texte", "fond"),
    ("texte", "surface"),
    ("texte-secondaire", "fond"),
    ("texte-secondaire", "surface"),
    ("lien", "fond"),
    ("lien", "surface"),
    ("sur-action", "action"),
    ("sur-marque", "marque"),
    ("etat-info", "fond"),
    ("etat-succes", "fond"),
    ("etat-avertissement", "fond"),
    ("etat-erreur", "fond"),
]
MIN_CONTRAST = 4.5

# Thème sémantique -> sélecteurs CSS qui l'activent (Zensical/Material + usage générique).
THEME_SELECTORS = {
    "clair": ':root,\n[data-md-color-scheme="default"],\n[data-vm-theme="clair"]',
    "sombre": '[data-md-color-scheme="slate"],\n[data-vm-theme="sombre"]',
}

ALIAS = re.compile(r"^\{([^{}]+)\}$")


def load_tokens(path: Path = TOKENS_PATH) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_tokens(node: dict, path: tuple[str, ...] = (), inherited_type: str | None = None):
    """Parcourt l'arbre et produit (chemin, type, valeur) pour chaque token."""
    token_type = node.get("$type", inherited_type)
    if "$value" in node:
        yield path, token_type, node["$value"]
        return
    for key, child in node.items():
        if key.startswith("$") or not isinstance(child, dict):
            continue
        yield from iter_tokens(child, (*path, key), token_type)


def css_name(path: tuple[str, ...]) -> str:
    """('theme', 'clair', 'fond') -> --vm-fond ; ('color', 'x', '50') -> --vm-color-x-50."""
    if path[0] == "theme":
        path = path[2:]
    return "--vm-" + "-".join(path)


def _dimension(value: dict[str, Any]) -> str:
    return f"{value['value']}{value['unit']}"


def _alias(value: Any) -> re.Match[str] | None:
    """Référence `{a.b.c}` vers un autre token, sinon None."""
    return ALIAS.match(value) if isinstance(value, str) else None


def css_value(token_type: str | None, value: Any) -> str:
    if alias := _alias(value):
        return f"var({css_name(tuple(alias.group(1).split('.')))})"
    if token_type in {"dimension", "duration"}:
        return _dimension(value)
    if token_type == "fontFamily":
        return ", ".join(f'"{f}"' if " " in f else f for f in value)
    if token_type == "cubicBezier":
        return "cubic-bezier({})".format(", ".join(str(v) for v in value))
    if token_type == "shadow":
        parts = (_dimension(value[k]) for k in ("offsetX", "offsetY", "blur", "spread"))
        return " ".join(parts) + f" {value['color']}"
    return str(value)


def resolve(tokens: dict, reference: str) -> str:
    """Valeur finale d'un token (suit les alias), ex. resolve(t, 'theme.clair.texte')."""
    node = tokens
    for key in reference.split("."):
        node = node[key]
    value = node["$value"]
    if isinstance(value, str) and (match := ALIAS.match(value)):
        return resolve(tokens, match.group(1))
    return value


def build_css(tokens: dict) -> str:
    version = tokens["$extensions"]["valometra"]["version"]
    lines = [
        "/* Charte graphique Valometra v" + version + " — design tokens.",
        " * FICHIER GÉNÉRÉ par design/build_tokens.py depuis",
        " * design/tokens/valometra.tokens.json : ne pas modifier à la main. */",
        "",
        ":root {",
    ]
    for path, token_type, value in iter_tokens({k: v for k, v in tokens.items() if k != "theme"}):
        lines.append(f"  {css_name(path)}: {css_value(token_type, value)};")
    lines.append("}")

    theme_names = [k for k in tokens["theme"] if not k.startswith("$")]
    if set(theme_names) != set(THEME_SELECTORS):
        raise ValueError(f"Thèmes sans sélecteur CSS : {set(theme_names) ^ set(THEME_SELECTORS)}")
    for name in theme_names:
        lines += ["", THEME_SELECTORS[name] + " {"]
        for path, token_type, value in iter_tokens(tokens["theme"][name], ("theme", name)):
            lines.append(f"  {css_name(path)}: {css_value(token_type, value)};")
        lines.append("}")
    return "\n".join(lines) + "\n"


def relative_luminance(hex_color: str) -> float:
    channels = [int(hex_color.lstrip("#")[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    """Ratio de contraste WCAG 2.2 entre deux couleurs #RRGGBB."""
    high, low = sorted(
        (relative_luminance(foreground), relative_luminance(background)), reverse=True
    )
    return (high + 0.05) / (low + 0.05)


def contrast_report(tokens: dict) -> list[tuple[str, str, str, float]]:
    """(thème, texte, fond, ratio) pour chaque paire de CONTRAST_PAIRS."""
    rows = []
    for theme in (k for k in tokens["theme"] if not k.startswith("$")):
        for fg, bg in CONTRAST_PAIRS:
            fg_hex = resolve(tokens, f"theme.{theme}.{fg}")
            bg_hex = resolve(tokens, f"theme.{theme}.{bg}")
            rows.append((theme, fg, bg, contrast_ratio(fg_hex, bg_hex)))
    return rows


def _fr(number: float) -> str:
    return f"{number:.1f}".replace(".", ",")


def _swatch(hex_color: str) -> str:
    return f'<span class="vm-pastille" style="background:{hex_color}"></span>'


def build_reference(tokens: dict) -> str:
    """Page Markdown de référence : chaque token, sa valeur et les contrastes."""
    version = tokens["$extensions"]["valometra"]["version"]
    out = [
        "# Référence des tokens",
        "",
        "<!-- FICHIER GÉNÉRÉ par design/build_tokens.py : ne pas modifier à la main. -->",
        "",
        f"Charte **v{version}**. Page générée depuis "
        "`design/tokens/valometra.tokens.json` : elle est toujours exacte. "
        "Contraste calculé selon WCAG 2.2 sur blanc (#FFFFFF).",
        "",
        "## Couleurs primitives",
    ]
    for group, node in tokens["color"].items():
        if group.startswith("$"):
            continue
        out += ["", f"### {group.capitalize()}", ""]
        if "$description" in node:
            out += [node["$description"], ""]
        out += ["| Token | Valeur | | Contraste sur blanc |", "|---|---|---|---|"]
        for path, _, _ in iter_tokens(node, ("color", group)):
            hex_color = resolve(tokens, ".".join(path))
            ratio = contrast_ratio(hex_color, "#FFFFFF")
            out.append(
                f"| `{css_name(path)}` | `{hex_color}` | {_swatch(hex_color)} | {_fr(ratio)}:1 |"
            )

    themes = [k for k in tokens["theme"] if not k.startswith("$")]
    out += [
        "",
        "## Tokens sémantiques",
        "",
        "À utiliser en priorité dans les interfaces : ils changent de valeur selon le thème.",
        "",
        "| Token | " + " | ".join(t.capitalize() for t in themes) + " |",
        "|---|" + "---|" * len(themes),
    ]
    for path, _, _ in iter_tokens(tokens["theme"][themes[0]], ("theme", themes[0])):
        cells = []
        for theme in themes:
            ref = f"theme.{theme}.{path[-1]}"
            hex_color = resolve(tokens, ref)
            alias = tokens["theme"][theme][path[-1]]["$value"].strip("{}")
            cells.append(f"{_swatch(hex_color)} `{alias}`")
        out.append(f"| `{css_name(path)}` | " + " | ".join(cells) + " |")

    out += [
        "",
        "## Contrastes contrôlés",
        "",
        f"Seuil exigé : **{_fr(MIN_CONTRAST)}:1** (WCAG AA, texte courant). "
        "Le test `tests/unit/test_design_tokens.py` échoue sous ce seuil.",
        "",
        "| Thème | Texte | Fond | Ratio |",
        "|---|---|---|---|",
    ]
    for theme, fg, bg, ratio in contrast_report(tokens):
        out.append(f"| {theme} | `--vm-{fg}` | `--vm-{bg}` | {_fr(ratio)}:1 |")

    out += ["", "## Autres tokens", "", "| Token | Valeur CSS |", "|---|---|"]
    for path, token_type, value in iter_tokens(
        {k: v for k, v in tokens.items() if k not in {"color", "theme"}}
    ):
        out.append(f"| `{css_name(path)}` | `{css_value(token_type, value)}` |")
    return "\n".join(out) + "\n"


def expected_outputs(tokens: dict) -> dict[Path, str]:
    outputs = {CSS_PATH: build_css(tokens), REFERENCE_PATH: build_reference(tokens)}
    for svg in sorted(LOGO_DIR.glob("*.svg")):
        outputs[IMAGES_DIR / svg.name] = svg.read_text(encoding="utf-8")
    return outputs


def stale_outputs(tokens: dict) -> list[Path]:
    return [
        path
        for path, content in expected_outputs(tokens).items()
        if not path.is_file() or path.read_text(encoding="utf-8") != content
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "Charte").splitlines()[0])
    parser.add_argument("--check", action="store_true", help="vérifie sans écrire")
    args = parser.parse_args(argv)

    tokens = load_tokens()
    stale = stale_outputs(tokens)
    if args.check:
        for path in stale:
            print(f"périmé : {path.relative_to(PROJECT_ROOT)}")
        return 1 if stale else 0

    for path, content in expected_outputs(tokens).items():
        if path in stale:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"écrit : {path.relative_to(PROJECT_ROOT)}")
    if not stale:
        print("À jour.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
