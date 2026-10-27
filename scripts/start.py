"""Create Atlas's isolated environment, install dependencies, and run locally."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import venv
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
ENVIRONMENT = ROOT / ".venv"


def load_local_environment() -> None:
    """Read simple KEY=value lines without executing or interpolating text."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not key or not key.replace("_", "").isalnum() or key[0].isdigit():
            raise ValueError(f"Invalid .env entry on line {line_number}; use KEY=value.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def open_when_ready(url: str, process: subprocess.Popen) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(60):
        if process.poll() is not None:
            return
        try:
            with opener.open(f"{url}/api/health", timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(url)
                    return
        except (urllib.error.URLError, TimeoutError, OSError):
            pass
        time.sleep(0.5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    arguments = parser.parse_args()
    if sys.version_info < (3, 11):
        print("Atlas needs Python 3.11 or newer. Install it from https://www.python.org/downloads/.")
        return 1
    if not 1024 <= arguments.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    os.chdir(ROOT)
    load_local_environment()
    python = ENVIRONMENT / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Creating an isolated Python environment in .venv …", flush=True)
        venv.EnvBuilder(with_pip=True).create(ENVIRONMENT)
    requirements = ROOT / "requirements.txt"
    fingerprint = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = ENVIRONMENT / ".atlas-requirements-sha256"
    if not stamp.exists() or stamp.read_text(encoding="utf-8").strip() != fingerprint:
        print("Installing Atlas dependencies. First launch may take a few minutes …", flush=True)
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)], cwd=ROOT, check=True)
        stamp.write_text(fingerprint, encoding="utf-8")
    url = f"http://127.0.0.1:{arguments.port}"
    print(f"\nAtlas opens at {url}\nKeep this window open. Press Ctrl+C to stop.\n", flush=True)
    process = subprocess.Popen(
        [str(python), "-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", str(arguments.port)],
        cwd=ROOT,
    )
    if not arguments.no_browser:
        threading.Thread(target=open_when_ready, args=(url, process), daemon=True).start()
    try:
        return process.wait()
    except KeyboardInterrupt:
        if process.poll() is None:
            process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"\nAtlas could not start: {error}\nSee docs/SETUP.md for help.", file=sys.stderr)
        raise SystemExit(1)
