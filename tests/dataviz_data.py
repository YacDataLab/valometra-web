"""Verify the public data pipeline independently of the network."""

import csv
import gzip
import io
import sqlite3
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

# The scripts are imported after adding their directory to the module path.
# pylint: disable=wrong-import-position
from build_dataviz import (  # noqa: E402
    BDNB_COLUMNS,
    DVF_COLUMNS,
    build,
    parse_args,
    read_csv,
)
from export_dataviz_sql import main as export_sql  # noqa: E402

# pylint: enable=wrong-import-position


class DatavizDataTest(unittest.TestCase):
    """Exercise the build and export with synthetic source files."""

    def test_invalid_csv(self):
        """Reject a CSV that omits a required column or has a truncated row."""
        for contents in ("id\n1\n", "id,date\n1\n"):
            with self.subTest(contents=contents), self.assertRaises(ValueError):
                list(read_csv(io.StringIO(contents), "dvf.csv", ("id", "date")))

    def test_import_and_export(self):
        """Preserve sale totals and missing values across imports and SQL export."""
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for year in range(2021, 2027):
                with gzip.open(folder / f"{year}.csv.gz", "wt", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=DVF_COLUMNS)
                    writer.writeheader()
                    sale = {
                        "id_mutation": "1",
                        "date_mutation": f"{year}-06-30"
                        if year == 2026
                        else f"{year}-07-01",
                        "nature_mutation": "Vente",
                        "valeur_fonciere": "12345.67",
                        "code_commune": "38185",
                        "numero_disposition": "000001",
                        "id_parcelle": "38185000AB0001",
                    }
                    writer.writerow(sale)
                    writer.writerow(sale | {"type_local": "Appartement"})
                    writer.writerow(
                        sale | {"id_mutation": "2", "code_commune": "38027"}
                    )
                    if year == 2021:
                        writer.writerow(
                            sale | {"id_mutation": "3", "date_mutation": "2021-06-30"}
                        )
            bdnb = folder / "bdnb.zip"
            stream = io.StringIO()
            writer = csv.writer(stream, delimiter=";")
            writer.writerow(BDNB_COLUMNS)
            writer.writerow(("bdnb-'a", "38185", ""))
            with ZipFile(bdnb, "w") as archive:
                archive.writestr("csv/batiment_groupe.csv", stream.getvalue())
            output = folder / "dataviz.sqlite"
            with patch.object(
                sys,
                "argv",
                [
                    "build_dataviz.py",
                    "--end",
                    "2026-06-30",
                    "--dvf-dir",
                    str(folder),
                    "--bdnb-zip",
                    str(bdnb),
                    "--output",
                    str(output),
                ],
            ):
                args = parse_args()
            self.assertEqual(args.start, date(2021, 7, 1))
            build(args)
            build(args)
            seed = folder / "dataviz.sql"
            with patch.object(
                sys,
                "argv",
                [
                    "export_dataviz_sql.py",
                    "--database",
                    str(output),
                    "--output",
                    str(seed),
                ],
            ):
                export_sql()
            with sqlite3.connect(":memory:") as imported:
                imported.execute("PRAGMA foreign_keys = ON")
                imported.executescript(seed.read_text(encoding="utf-8"))
                self.assertEqual(
                    imported.execute("PRAGMA foreign_key_check").fetchall(), []
                )
                self.assertEqual(
                    imported.execute(
                        "SELECT count(*), sum(amount_cents) FROM mutation"
                    ).fetchone(),
                    (6, 6 * 1234567),
                )
                self.assertEqual(
                    imported.execute("SELECT count(*) FROM dvf_row").fetchone(), (12,)
                )
                self.assertEqual(
                    imported.execute("SELECT id, iris FROM bdnb_building").fetchone(),
                    ("bdnb-'a", None),
                )
                self.assertEqual(
                    imported.execute(
                        "SELECT median_income FROM filosofi WHERE iris = '381850101'"
                    ).fetchone(),
                    (None,),
                )


if __name__ == "__main__":
    unittest.main()
