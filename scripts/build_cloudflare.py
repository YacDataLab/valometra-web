import argparse
import json
from pathlib import Path
from shutil import copyfile, copytree, ignore_patterns, rmtree

parser = argparse.ArgumentParser()
parser.add_argument("--test", action="store_true", help="Build the protected test Worker")
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
target = root / "dist" / "cloudflare"
assets = target / "assets"

if assets.exists():
    rmtree(assets)

copytree(
    root / "public",
    assets,
    ignore=ignore_patterns(
        "admin.html", "admin.js", "my-requests.html", "my-requests.js",
        "__pycache__", "*.pyc",
    ),
)

index = assets / "index.html"
html = index.read_text(encoding="utf-8")
for link in (
    '<a href="/mes-demandes">Mes demandes</a>',
    '<a id="admin-link" href="/gestion" hidden>Espace privé</a>',
):
    html = html.replace(link, "")
index.write_text(html, encoding="utf-8")

config = {
    "name": "valometra-estimation",
    "compatibility_date": "2025-09-15",
    "preview_urls": False,
    "assets": {"directory": "./assets"},
}
if args.test:
    copyfile(root / "worker" / "test-access.mjs", target / "test-access.mjs")
    config.update(
        name="valometra-test",
        main="test-access.mjs",
        compatibility_flags=["nodejs_compat"],
        assets={"directory": "./assets", "binding": "ASSETS", "run_worker_first": True},
    )

(target / "wrangler.json").write_text(
    json.dumps(config, indent=2) + "\n", encoding="utf-8",
)
