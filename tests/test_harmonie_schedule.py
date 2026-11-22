import io
import json
import os
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import harmonie_schedule


class ScheduleTests(unittest.TestCase):
    def test_expected_run_at_boundaries(self):
        cases = [
            ("2026-11-22T04:29:59+00:00", "2026112118"),
            ("2026-11-22T04:30:00+00:00", "2026112200"),
            ("2026-11-22T10:29:59+00:00", "2026112200"),
            ("2026-11-22T10:30:00+00:00", "2026112206"),
        ]
        for now, expected in cases:
            with self.subTest(now=now):
                self.assertEqual(harmonie_schedule.expected_run(datetime.fromisoformat(now)), expected)

    @patch("harmonie_schedule.urlopen")
    def test_published_run(self, urlopen):
        response = io.BytesIO(json.dumps({"model": "HARMONIE", "run": "2026112200"}).encode())
        urlopen.return_value.__enter__.return_value = response
        self.assertEqual(harmonie_schedule.published_run("https://example.test/index.json"), "2026112200")
        request = urlopen.call_args.args[0]
        self.assertIn("?check=", request.full_url)
        self.assertEqual(request.get_header("Cache-control"), "no-cache")

    @patch("harmonie_schedule.urlopen")
    def test_missing_index_and_network_errors(self, urlopen):
        urlopen.side_effect = HTTPError("https://example.test", 404, "missing", {}, None)
        self.assertIsNone(harmonie_schedule.published_run("https://example.test"))
        urlopen.side_effect = HTTPError("https://example.test", 500, "server error", {}, None)
        with self.assertRaises(HTTPError):
            harmonie_schedule.published_run("https://example.test")
        urlopen.side_effect = URLError("unavailable")
        with self.assertRaises(URLError):
            harmonie_schedule.published_run("https://example.test")

    @patch("harmonie_schedule.urlopen")
    def test_reject_invalid_index(self, urlopen):
        for manifest in (
            {"model": "other", "run": "2026112200"},
            {"model": "HARMONIE", "run": "2026112203"},
            {"model": "HARMONIE", "run": "2026023000"},
            {"model": "HARMONIE", "run": "20261122"},
            [],
        ):
            with self.subTest(manifest=manifest):
                urlopen.return_value.__enter__.return_value = io.BytesIO(json.dumps(manifest).encode())
                with self.assertRaises(ValueError):
                    harmonie_schedule.published_run("https://example.test")

    @patch("harmonie_schedule.published_run")
    @patch("harmonie_schedule.expected_run", return_value="2026112200")
    def test_preflight_output(self, expected, published):
        for run, needed in ((None, "true"), ("2026112118", "true"),
                            ("2026112200", "false"), ("2026112206", "false")):
            with self.subTest(run=run), tempfile.TemporaryDirectory() as directory:
                published.return_value = run
                output_path = os.path.join(directory, "output")
                with patch.dict(os.environ, {"GITHUB_OUTPUT": output_path, "HARMONIE_INDEX_URL": "https://example.test"}):
                    harmonie_schedule.main()
                with open(output_path, encoding="utf-8") as output:
                    self.assertEqual(output.read(), f"expected_run=2026112200\nneeded={needed}\n")


if __name__ == "__main__":
    unittest.main()
