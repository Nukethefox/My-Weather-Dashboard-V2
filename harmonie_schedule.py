import json
import os
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def expected_run(now):
    reference = now.astimezone(timezone.utc) - timedelta(hours=4, minutes=30)
    return reference.replace(
        hour=(reference.hour // 6) * 6, minute=0, second=0, microsecond=0
    ).strftime("%Y%m%d%H")


def published_run(url):
    separator = "&" if "?" in url else "?"
    request = Request(
        f"{url}{separator}{urlencode({'check': datetime.now(timezone.utc).isoformat()})}",
        headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            manifest = json.load(response)
    except HTTPError as error:
        if error.code == 404:
            return None
        raise

    if not isinstance(manifest, dict) or manifest.get("model") != "HARMONIE":
        raise ValueError("El índice publicado no es un manifiesto HARMONIE válido.")
    run = manifest.get("run")
    if not isinstance(run, str) or len(run) != 10 or not run.isascii() or not run.isdigit():
        raise ValueError("La salida del índice publicado no tiene el formato esperado.")
    try:
        parsed = datetime.strptime(run, "%Y%m%d%H")
    except ValueError as error:
        raise ValueError("La fecha de salida del índice publicado no es válida.") from error
    if parsed.hour not in (0, 6, 12, 18):
        raise ValueError("La hora de salida del índice publicado no es válida.")
    return run


def main():
    expected = expected_run(datetime.now(timezone.utc))
    published = published_run(os.environ["HARMONIE_INDEX_URL"])
    print(f"Salida teórica: {expected}; salida publicada: {published or 'ninguna'}.")
    needed = published is None or published < expected
    if published is not None and published > expected:
        print("La salida publicada es más reciente; se conserva para evitar un retroceso.")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        print(f"expected_run={expected}", file=output)
        print(f"needed={'true' if needed else 'false'}", file=output)


if __name__ == "__main__":
    main()
