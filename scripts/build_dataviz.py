"""Build a local, public-data-only SQLite database for Valometra's dataviz."""

import argparse
import csv
import gzip
import hashlib
import json
import sqlite3
from datetime import date, timedelta
from decimal import Decimal
from io import TextIOWrapper
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "data-platform/schema.sql"
PUBLIC = ROOT / "public/data"
DVF_COLUMNS = (
    "id_mutation",
    "date_mutation",
    "nature_mutation",
    "valeur_fonciere",
    "code_commune",
    "numero_disposition",
    "id_parcelle",
    "type_local",
    "surface_reelle_bati",
    "surface_terrain",
    "nombre_pieces_principales",
    "longitude",
    "latitude",
)
FILOSOFI_FIELDS = (
    "insee_niveau_vie_median",
    "insee_taux_pauvrete",
    "insee_niveau_vie_d9",
    "insee_rapport_interdecile",
)
BDNB_COLUMNS = ("batiment_groupe_id", "code_commune_insee", "code_iris")


def read_csv(stream, name, columns, *, delimiter=","):
    """Validate the CSV header and yield numbered records."""
    reader = csv.DictReader(stream, delimiter=delimiter)
    missing = set(columns).difference(reader.fieldnames or ())
    if missing:
        raise ValueError(f"{name}: missing columns {sorted(missing)}")
    for line, row in enumerate(reader, 2):
        if None in row or None in row.values():
            raise ValueError(f"{name}:{line}: invalid CSV record")
        yield line, row


def record_source(db, dataset, path, rows):
    """Record the input checksum and the number of rows loaded."""
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    db.execute(
        "INSERT INTO source VALUES (?, ?, ?, ?)", (dataset, path.name, digest, rows)
    )


def cents(raw):
    """Convert a source amount to integer cents, preserving missing values."""
    if not raw:
        return None
    scaled = Decimal(raw.replace(",", ".")) * 100
    if not scaled.is_finite() or scaled != scaled.to_integral_value() or scaled < 0:
        raise ValueError(f"Invalid mutation amount {raw!r}")
    return int(scaled)


def dvf_rows(stream, path, year, period, towns):
    """Yield mutations and their source observations for the selected territory."""
    start, end = period
    for line, row in read_csv(stream, path.name, DVF_COLUMNS):
        if row["code_commune"] not in towns or not start <= row["date_mutation"] <= end:
            continue
        observed = date.fromisoformat(row["date_mutation"])
        if (
            observed.year != year
            or not row["id_mutation"]
            or not row["numero_disposition"]
        ):
            raise ValueError(f"{path.name}:{line}: invalid mutation identity")
        mutation_id = f"{year}:{row['id_mutation']}"
        mutation = (
            mutation_id,
            observed.isoformat(),
            row["nature_mutation"],
            cents(row["valeur_fonciere"]),
        )
        observation = (
            year,
            line,
            mutation_id,
            row["code_commune"],
            row["numero_disposition"],
            row["id_parcelle"] or None,
            row["type_local"] or None,
            float(row["surface_reelle_bati"]) if row["surface_reelle_bati"] else None,
            float(row["surface_terrain"]) if row["surface_terrain"] else None,
            int(row["nombre_pieces_principales"])
            if row["nombre_pieces_principales"]
            else None,
            float(row["longitude"]) if row["longitude"] else None,
            float(row["latitude"]) if row["latitude"] else None,
        )
        yield mutation, observation


def load_dvf(db, year, path, period, towns):
    """Load one DVF archive in bounded batches."""
    mutations = {}
    observations = []
    total = 0
    with gzip.open(path, "rt", encoding="utf-8-sig", newline="") as stream:
        for mutation, observation in dvf_rows(stream, path, year, period, towns):
            previous = mutations.setdefault(mutation[0], mutation)
            if previous != mutation:
                raise ValueError(f"{path.name}: conflicting mutation {mutation[0]}")
            observations.append(observation)
            total += 1
            if len(observations) >= 1000:
                write_dvf_batch(db, mutations, observations)
    write_dvf_batch(db, mutations, observations)
    if not total:
        raise ValueError(f"{path.name}: no rows in the requested territory and period")
    record_source(db, "dvf", path, total)


def write_dvf_batch(db, mutations, observations):
    """Store a batch and reject conflicts with previously imported mutations."""
    db.executemany(
        """INSERT INTO mutation VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET date = NULL
           WHERE (mutation.date, mutation.nature, mutation.amount_cents)
                 IS NOT (excluded.date, excluded.nature, excluded.amount_cents)""",
        mutations.values(),
    )
    db.executemany(
        "INSERT INTO dvf_row VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", observations
    )
    mutations.clear()
    observations.clear()


def load_filosofi(db):
    """Load the published Filosofi indicators for Grenoble."""
    path = PUBLIC / "filosofi.json"
    source = json.loads(path.read_text(encoding="utf-8"))
    commune = source["commune"]
    rows = []
    for iris, values in sorted(source["iris"].items()):
        if (
            len(iris) != 9
            or not iris.isascii()
            or not iris.isdigit()
            or not iris.startswith(commune)
        ):
            raise ValueError(f"Invalid Filosofi IRIS {iris!r}")
        rows.append((iris, commune, *(values[field] for field in FILOSOFI_FIELDS)))
    db.executemany("INSERT INTO filosofi VALUES (?, ?, ?, ?, ?, ?)", rows)
    record_source(db, "filosofi", path, len(rows))


def load_bdnb(db, path, towns):
    """Load the building identifiers and IRIS codes for the selected towns."""

    def buildings(stream):
        for line, row in read_csv(stream, path.name, BDNB_COLUMNS, delimiter=";"):
            commune = row["code_commune_insee"]
            if commune not in towns:
                continue
            iris = row["code_iris"] or None
            if not row["batiment_groupe_id"] or (
                iris and (len(iris) != 9 or not iris.isascii() or not iris.isdigit())
            ):
                raise ValueError(f"{path.name}:{line}: invalid building identity")
            yield row["batiment_groupe_id"], commune, iris

    # The departmental CSV also contains geometries, which we discard.
    previous_limit = csv.field_size_limit(8 * 1024 * 1024)
    try:
        with (
            ZipFile(path) as archive,
            archive.open("csv/batiment_groupe.csv") as entry,
            TextIOWrapper(entry, encoding="utf-8-sig", newline="") as stream,
        ):
            result = db.executemany(
                "INSERT INTO bdnb_building VALUES (?, ?, ?)", buildings(stream)
            )
    finally:
        csv.field_size_limit(previous_limit)
    if not result.rowcount:
        raise ValueError(f"{path.name}: no buildings in the requested territory")
    record_source(db, "bdnb", path, result.rowcount)


def parse_args():
    """Read command-line options and calculate the five-year window."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument(
        "--dvf-dir", type=Path, required=True, help="Directory of YYYY.csv.gz files"
    )
    parser.add_argument("--bdnb-zip", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        args.start = args.end.replace(year=args.end.year - 5) + timedelta(days=1)
    except ValueError:
        parser.error("--end must have a corresponding date five years earlier")
    return args


def build(args):
    """Build and atomically replace the destination SQLite database."""
    towns = {
        town["code"]: town["name"]
        for town in json.loads((PUBLIC / "metadata.json").read_text(encoding="utf-8"))[
            "towns"
        ]
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.output.parent) as temporary:
        staged = Path(temporary) / "dataviz.sqlite"
        db = sqlite3.connect(staged)
        try:
            db.execute("PRAGMA foreign_keys = ON")
            db.executescript(SCHEMA.read_text(encoding="utf-8"))
            with db:
                db.executemany(
                    "INSERT INTO commune VALUES (?, ?)", sorted(towns.items())
                )
                start, end = args.start.isoformat(), args.end.isoformat()
                db.execute("INSERT INTO coverage VALUES (?, ?)", (start, end))
                for year in range(args.start.year, args.end.year + 1):
                    load_dvf(
                        db, year, args.dvf_dir / f"{year}.csv.gz", (start, end), towns
                    )
                load_filosofi(db)
                load_bdnb(db, args.bdnb_zip, towns)
        finally:
            db.close()
        staged.replace(args.output)


if __name__ == "__main__":
    build(parse_args())
