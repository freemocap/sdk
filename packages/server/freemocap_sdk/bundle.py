"""Freeze a backend directory for Tauri resources [@tauriResources2026; @pyinstallerModes2026]."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entrypoint", type=Path, required=True)
    parser.add_argument("--name", required=True, help="Backend directory and executable name")
    parser.add_argument("--output", type=Path, required=True, help="Ignored Tauri binaries directory")
    parser.add_argument("--work", type=Path, required=True, help="Ignored build scratch directory")
    parser.add_argument("--collect-data", action="append", default=[], metavar="PACKAGE",
                        help="Include package data files; repeat for multiple packages")
    args = parser.parse_args()
    if not args.entrypoint.is_file():
        parser.error("Entrypoint does not exist")
    if Path(args.name).name != args.name or not args.name.strip():
        parser.error("Name must be a plain filename")
    args.output.mkdir(parents=True, exist_ok=True)
    args.work.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--onedir", "--console",
                    "--name", args.name, "--distpath", str(args.output.resolve()),
                    "--workpath", str((args.work / "work").resolve()),
                    "--specpath", str(args.work.resolve()),
                    "--collect-submodules", "uvicorn", "--collect-submodules", "websockets",
                    # Preserve package-relative resources [@pyinstallerData2026].
                    *[arg for package in dict.fromkeys(["freemocap_sdk", *args.collect_data])
                      for arg in ("--collect-data", package)],
                    str(args.entrypoint.resolve())], check=True)


if __name__ == "__main__":
    main()
