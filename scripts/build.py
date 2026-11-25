"""Construit le Worker autonome dans dist/ : embarque public/ dans dist/server/index.js."""

import base64
import hashlib
import json
import mimetypes
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DIST = ROOT / "dist"
BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".zip", ".pdf"}


def collect_assets():
    """Associe chaque fichier de public/ à son type, son contenu et son ETag."""
    assets = {}
    for path in sorted(PUBLIC.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        raw = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".py":
            mime = "text/plain"
        binary = path.suffix.lower() in BINARY_SUFFIXES
        assets["/" + str(path.relative_to(PUBLIC))] = {
            "type": mime + ("" if binary else "; charset=utf-8"),
            "binary": binary,
            "data": base64.b64encode(raw).decode() if binary else raw.decode(),
            "etag": '"' + hashlib.sha256(raw).hexdigest()[:24] + '"',
        }
    return assets


IMPORT = re.compile(r"^import\s+\{[^}]*\}\s+from\s+'\./([\w-]+\.mjs)';\n", re.M)
EXPORT = re.compile(r"^export\s+(?=(?:async\s+)?(?:function|const|let)\b)", re.M)
DECLARATION = re.compile(r"^(?:async\s+)?(?:function|const|let)\s+(\w+)", re.M)


def worker_modules(entry="service.mjs"):
    """Modules du Worker dans l'ordre des dépendances (un module après ceux qu'il importe)."""
    ordered, visiting = [], set()

    def visit(name):
        if name in ordered:
            return
        if name in visiting:
            raise SystemExit(f"Import circulaire dans worker/{name}")
        visiting.add(name)
        for dependency in IMPORT.findall((ROOT / "worker" / name).read_text()):
            visit(dependency)
        visiting.discard(name)
        ordered.append(name)

    visit(entry)
    return ordered


def build_worker(assets):
    """Assemble les modules de worker/, les assets et le point d'entrée en un seul fichier."""
    parts, declared = [], {}
    for name in worker_modules():
        source = (ROOT / "worker" / name).read_text()
        # Un bundle plat n'a qu'un espace de noms : deux déclarations identiques le casseraient.
        for symbol in DECLARATION.findall(source):
            if symbol in declared:
                raise SystemExit(f"« {symbol} » est déclaré dans {declared[symbol]} et {name}")
            declared[symbol] = name
        parts.append(EXPORT.sub("", IMPORT.sub("", source)))
    payload = json.dumps(assets, ensure_ascii=False, separators=(",", ":"))
    return (
        "\n".join(parts)
        + "\nconst assets="
        + payload
        + ";\nexport default {fetch(request,env){return handle(request,env,assets)}};\n"
    )


def main():
    (DIST / "server").mkdir(parents=True, exist_ok=True)
    assets = collect_assets()
    entry = build_worker(assets)
    (DIST / "server/index.js").write_text(entry)
    shutil.copytree(ROOT / "drizzle", DIST / "drizzle", dirs_exist_ok=True)
    if (ROOT / ".openai" / "hosting.json").is_file():
        shutil.copytree(ROOT / ".openai", DIST / ".openai", dirs_exist_ok=True)
    wrangler = {
        "name": "valometra-estimation",
        "main": "index.js",
        "compatibility_date": "2025-09-15",
        "d1_databases": [
            {"binding": "DB", "database_name": "valometra-leads", "migrations_dir": "../drizzle"}
        ],
    }
    (DIST / "server/wrangler.json").write_text(json.dumps(wrangler, indent=2))
    print("Build :", len(assets), "assets,", len(entry.encode()), "octets Worker")


if __name__ == "__main__":
    main()
