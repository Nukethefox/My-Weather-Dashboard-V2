import json
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from harmonie_schedule import expected_run


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "publicar-harmonie.yml"


class PublicationTests(unittest.TestCase):
    def test_scheduled_run_must_not_be_older_than_expected(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        script = workflow.split("          python - <<'PY'\n", 1)[1].split(
            "\n          PY", 1
        )[0]
        script = textwrap.dedent(script)
        expected = datetime.strptime(
            expected_run(datetime.now(timezone.utc)), "%Y%m%d%H"
        )
        for offset, should_publish in ((-6, False), (0, True), (6, True)):
            run = (expected + timedelta(hours=offset)).strftime("%Y%m%d%H")
            with self.subTest(run=run), tempfile.TemporaryDirectory() as directory:
                images = Path(directory) / "HARMONIE"
                images.mkdir()
                for region in ("iberia", "mediterraneo"):
                    for product in ("PRECIP", "PRECIP_ACC", "TEMP2m", "VIENTO10"):
                        for hour in range(1, 49):
                            (images / f"HARMONIE-{region}-{product}-{run}-{hour:03d}.png").write_bytes(b"x")
                env = os.environ.copy()
                env["EVENT_NAME"] = "schedule"
                env["PYTHONPATH"] = str(ROOT)
                result = subprocess.run(
                    [sys.executable, "-c", script], cwd=directory, env=env,
                    capture_output=True, text=True, timeout=30,
                )
                self.assertEqual(result.returncode == 0, should_publish, result.stderr)
                if should_publish:
                    manifest = json.loads((Path(directory) / "harmonie-index.json").read_text())
                    self.assertEqual(manifest["run"], run)
                else:
                    self.assertIn("se conserva la publicación anterior", result.stderr)


if __name__ == "__main__":
    unittest.main()
