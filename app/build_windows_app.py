"""Build the standalone Windows companion application with PyInstaller."""

from __future__ import annotations

from pathlib import Path

from PyInstaller.__main__ import run


APP = Path(__file__).resolve().parent
ROOT = APP.parent
DIST = APP / "dist" / "windows"
WORK = APP / "build"


if __name__ == "__main__":
    run([
        str(APP / "server.py"),
        "--name=TapoDeck",
        "--onefile",
        "--windowed",
        "--clean",
        "--noconfirm",
        f"--distpath={DIST}",
        f"--workpath={WORK}",
        f"--specpath={APP}",
        f"--paths={APP}",
        f"--add-data={APP / 'web'};app/web",
        "--collect-all=kasa",
        "--collect-all=aiohttp",
    ])
    print(f"Built {DIST / 'TapoDeck.exe'}")
