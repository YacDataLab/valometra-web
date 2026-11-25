"""Export an initial Cloudflare D1 seed from a Valometra dataviz database."""

import argparse
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

from build_dataviz import SCHEMA

# Parents precede their dependent tables.
EXPORTS = (
    ("SELECT quote(code), quote(name) FROM commune", "INSERT INTO commune VALUES"),
    (
        "SELECT quote(id), quote(date), quote(nature), quote(amount_cents) FROM mutation",
        "INSERT INTO mutation VALUES",
    ),
    (
        "SELECT quote(source_year), quote(source_line), quote(mutation_id), "
        "quote(commune_code), quote(disposition), quote(parcel_id), quote(property_type), "
        "quote(built_area), quote(land_area), quote(rooms), quote(longitude), "
        "quote(latitude) FROM dvf_row",
        "INSERT INTO dvf_row VALUES",
    ),
    (
        "SELECT quote(iris), quote(commune_code), quote(median_income), "
        "quote(poverty_rate), quote(income_d9), quote(interdecile_ratio) FROM filosofi",
        "INSERT INTO filosofi VALUES",
    ),
    (
        "SELECT quote(id), quote(commune_code), quote(iris) FROM bdnb_building",
        "INSERT INTO bdnb_building VALUES",
    ),
    (
        "SELECT quote(dataset), quote(name), quote(sha256), quote(rows_loaded) FROM source",
        "INSERT INTO source VALUES",
    ),
    (
        "SELECT quote(start_date), quote(end_date) FROM coverage",
        "INSERT INTO coverage VALUES",
    ),
)


def export(db, stream):
    """Write the schema and data as D1-compatible SQL statements."""
    stream.write(SCHEMA.read_text(encoding="utf-8"))
    for select_sql, insert_prefix in EXPORTS:
        cursor = db.execute(select_sql)
        # SQLite quote() serializes each value before it is added to the export.
        while rows := cursor.fetchmany(100):
            values = ",\n".join("(" + ", ".join(row) + ")" for row in rows)
            statement = f"{insert_prefix}\n{values};\n"
            if len(statement.encode("utf-8")) >= 100_000:
                raise ValueError(f"D1 statement exceeds the size limit: {insert_prefix}")
            stream.write(statement)


def main():
    """Export a SQLite snapshot to the requested path."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.database.resolve() == args.output.resolve():
        parser.error("--output must differ from --database")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=args.output.parent) as temporary:
        staged = Path(temporary) / "dataviz.sql"
        db = sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True)
        try:
            with staged.open("w", encoding="utf-8") as stream:
                export(db, stream)
        finally:
            db.close()
        staged.replace(args.output)


if __name__ == "__main__":
    main()
