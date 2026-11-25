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
from types import SimpleNamespace
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from build_dataviz import BDNB_COLUMNS, DVF_COLUMNS, build  # noqa: E402
from export_dataviz_sql import export  # noqa: E402


class DatavizDataTest(unittest.TestCase):
    def test_import_and_export(self):
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
            args = SimpleNamespace(
                start=date(2021, 7, 1),
                end=date(2026, 6, 30),
                dvf_dir=folder,
                bdnb_zip=bdnb,
                output=folder / "dataviz.sqlite",
            )
            build(args)
            build(args)
            seed = io.StringIO()
            with sqlite3.connect(args.output) as db:
                export(db, seed)
            with sqlite3.connect(":memory:") as imported:
                imported.execute("PRAGMA foreign_keys = ON")
                imported.executescript(seed.getvalue())
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
