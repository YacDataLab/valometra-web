"""Construit le Worker autonome dans dist/ : embarque public/ dans dist/server/index.js."""

import base64
import hashlib
import json
import mimetypes
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


def build_worker(assets):
    """Concatène le service, les assets et le point d'entrée du Worker."""
    service = (ROOT / "worker/service.mjs").read_text()
    # Le service est exporté pour les tests ; dans le bundle, un seul export par défaut.
    service = service.replace("export const isAdmin", "const isAdmin")
    service = service.replace("export async function", "async function")
    payload = json.dumps(assets, ensure_ascii=False, separators=(",", ":"))
    return (
        service
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
