import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


GENERATOR = Path(__file__).resolve().parents[1] / "harmonie_generator.py"


class GeneratorScheduleTests(unittest.TestCase):
    def run_generator(self, expected):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            source.mkdir()
            (source / "down_2026-11-22T01_00_00+00_00_11.tif").touch()
            env = os.environ.copy()
            env["MPLBACKEND"] = "Agg"
            env.pop("HARMONIE_EXPECTED_RUN", None)
            if expected is not None:
                env["HARMONIE_EXPECTED_RUN"] = expected
            return subprocess.run(
                [sys.executable, str(GENERATOR), str(source)],
                cwd=directory, env=env, capture_output=True, text=True, timeout=30,
            )

    def test_outdated_run_stops_before_reading_tiff(self):
        result = self.run_generator("2026112206")
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertIn("AEMET ofrece 2026112200, pero se esperaba 2026112206", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_matching_newer_or_manual_run_proceeds_to_tiff(self):
        for expected in ("2026112200", "2026112118", None):
            with self.subTest(expected=expected):
                result = self.run_generator(expected)
                self.assertNotEqual(result.returncode, 75)
                self.assertIn("sample_tif", result.stderr)


if __name__ == "__main__":
    unittest.main()
