import json
import math
import re
import unittest
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"


def load_json(name):
    return json.loads((PUBLIC / name).read_text())


def load_estimator():
    models = {}
    for name in ("point", "lower", "upper", "lower50", "upper50"):
        path = PUBLIC / ("model.py" if name == "point" else f"model-{name}.py")
        namespace = {}
        exec(compile(path.read_bytes(), str(path), "exec"), namespace)
        models[name] = namespace["apply_catboost_model"]

    source = (PUBLIC / "inference-worker.js").read_text()
    code = re.search(r"py\.runPython\(`(.*?)`\);return py", source, re.S)[1]
    context = dict(
        models=models,
        config_json=json.dumps(load_json("preprocessing.json")),
        interval_json=json.dumps(load_json("intervals.json")),
        interval50_json=json.dumps(load_json("intervals50.json")),
    )
    exec(code, context)
    return lambda features: json.loads(context["estimate_payload"](json.dumps(features)))


CASES = [
    dict(code_commune="38185", code_postal="38000", surface_habitable=65,
         nb_pieces=3, latitude=45.19, longitude=5.73, est_vefa="false",
         jours_depuis_2025=545, coordonnees_disponibles=1),
    dict(code_commune="38185", code_postal="38100", surface_habitable=42,
         nb_pieces=2, latitude=45.17, longitude=5.73, est_vefa="false",
         jours_depuis_2025=545, coordonnees_disponibles=1,
         dpe_etiquette_energie="D", dpe_type="existant", dpe_disponible=1),
]


class ModelRegression(unittest.TestCase):
    def test_reference_estimates(self):
        estimate = load_estimator()
        for case, reference in zip(CASES, EXPECTED, strict=True):
            with self.subTest(surface=case["surface_habitable"]):
                result = estimate(case)
                actual = [result["value"], *result["intervals"]["50"], *result["intervals"]["80"]]
                for value, expected in zip(actual, reference, strict=True):
                    self.assertTrue(math.isclose(value, expected, rel_tol=1e-8), (value, expected))


EXPECTED = [
    [154751.86066572845, 125331.51227356284, 199876.91109525092, 102860.95538927944, 230167.53075187697],
    [94016.89055512975, 80915.51671216558, 119157.8777993561, 65506.289770836214, 141645.81115033073],
]


if __name__ == "__main__":
    unittest.main()
