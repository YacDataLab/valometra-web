"""Build the static Grenoble IRIS lookup from a verified INSEE vintage."""
import argparse
import csv
import json
import math
import re
from pathlib import Path
from urllib.parse import urlparse

COMMUNE = "38185"
INDICATORS = (
    "insee_niveau_vie_median",
    "insee_taux_pauvrete",
    "insee_niveau_vie_d9",
    "insee_rapport_interdecile",
)
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "filosofi.json"


def as_number(value):
    try:
        number = float((value or "").strip().replace(",", "."))
    except ValueError:
        return None
    return number if math.isfinite(number) and number >= 0 else None


def read_iris(path, columns):
    rows = {}
    with path.open(encoding="utf-8-sig", newline="") as source:
        dialect = csv.Sniffer().sniff(source.readline(), delimiters=";,\t")
        source.seek(0)
        reader = csv.DictReader(source, dialect=dialect)
        missing = set(columns.values()) - set(reader.fieldnames or ())
        if missing:
            raise ValueError(f"Colonnes absentes du CSV : {', '.join(sorted(missing))}")
        for record in reader:
            iris = (record[columns["iris"]] or "").strip()
            if not iris.startswith(COMMUNE):
                continue
            if not re.fullmatch(r"38185[0-9]{4}", iris) or iris in rows:
                raise ValueError(f"Code IRIS invalide ou dupliqué : {iris!r}")
            rows[iris] = {
                feature: as_number(record[columns[feature]])
                for feature in INDICATORS
            }
    if not rows:
        raise ValueError("Aucun IRIS de Grenoble dans le CSV.")
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--unverified", action="store_true")
    mode.add_argument("--csv", type=Path)
    parser.add_argument("--provenance", type=Path)
    args = parser.parse_args()
    payload = {"commune": COMMUNE, "provenance": None, "iris": {}}
    if args.csv:
        if not args.provenance:
            parser.error("--csv exige --provenance.")
        provenance = json.loads(args.provenance.read_text(encoding="utf-8"))
        columns = provenance["columns"]
        if (
            set(columns) != {"iris", *INDICATORS}
            or len(set(columns.values())) != len(columns)
            or not all(value.strip() for value in columns.values())
            or not all(provenance.get(key) for key in (
                "vintage", "iris_geography", "training_reference", "bdnb_iris_reference"
            ))
            or set(provenance.get("definitions", {})) != set(INDICATORS)
            or not all(provenance["definitions"].values())
            or urlparse(provenance.get("source", "")).hostname not in {"www.insee.fr", "insee.fr"}
        ):
            parser.error("Provenance INSEE, compatibilité BDNB et mapping d’entraînement incomplets.")
        payload["provenance"] = provenance
        payload["iris"] = read_iris(args.csv, columns)
    elif args.provenance:
        parser.error("--provenance s’utilise avec --csv.")
    args.output.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
