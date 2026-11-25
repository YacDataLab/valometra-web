"""Export an initial Cloudflare D1 seed from a Valometra dataviz database."""

import argparse
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

from build_dataviz import SCHEMA

# Parents precede their dependent tables.
TABLES = (
    "commune",
    "mutation",
    "dvf_row",
    "filosofi",
    "bdnb_building",
    "source",
    "coverage",
)


def export(db, stream):
    stream.write(SCHEMA.read_text(encoding="utf-8"))
    for table in TABLES:
        columns = [
            row[0]
            for row in db.execute("SELECT name FROM pragma_table_info(?)", (table,))
        ]
        # SQLite's quote() handles NULL, numbers and quotes in untrusted data.
        expressions = ", ".join(
            'quote("' + column.replace('"', '""') + '")' for column in columns
        )
        # The table is allowlisted and every column identifier is escaped above.
        cursor = db.execute(f"SELECT {expressions} FROM {table}")  # noqa: S608
        while rows := cursor.fetchmany(100):
            values = ",\n".join("(" + ", ".join(row) + ")" for row in rows)
            statement = f"INSERT INTO {table} VALUES\n{values};\n"
            if len(statement.encode("utf-8")) >= 100_000:
                raise ValueError(f"SQL statement exceeds the D1 limit for {table}")
            stream.write(statement)


def main():
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
