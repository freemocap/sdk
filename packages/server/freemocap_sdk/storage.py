"""Small filesystem primitives; application manifests and approval policy stay outside SDK.

Adapted from Tracker's project_store and Core's publication pattern. Opening and
inventorying are read-only. Writers require explicit existing parent directories.
"""
from __future__ import annotations

from contextlib import contextmanager
from collections.abc import Iterator
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ArtifactIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    bytes: int = Field(ge=0)


def file_digest(path: Path) -> str:
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def resolve_relative(root: Path, relative: str) -> Path:
    """Resolve a portable relative path, including existing symlinks, inside root."""
    parts = relative.split("/")
    if (not relative or "\\" in relative or ":" in relative
            or PurePosixPath(relative).is_absolute()
            or any(part in ("", ".", "..") for part in parts)):
        raise ValueError(f"Unsafe relative path: {relative!r}")
    resolved_root = Path(root).resolve()
    result = resolved_root.joinpath(*parts).resolve()
    if not result.is_relative_to(resolved_root):
        raise ValueError(f"Path escapes root: {relative!r}")
    return result


def atomic_json(path: Path, value: Any) -> None:
    """Publish finite JSON via same-directory fsync + replace; not a multi-file transaction."""
    path = Path(path)
    payload = (json.dumps(value, indent=2, allow_nan=False, ensure_ascii=False) + "\n").encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(prefix=".pending-", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def inventory(root: Path) -> dict[str, ArtifactIdentity]:
    """Hash regular files without creating a root or silently following symlinks."""
    root = Path(root)
    if not root.is_dir():
        raise NotADirectoryError(root)
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Inventory contains a symlink: {path}")
        if path.is_file():
            before = path.stat()
            digest = file_digest(path)
            after = path.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError(f"File changed during inventory: {path}")
            result[path.relative_to(root).as_posix()] = ArtifactIdentity(sha256=digest, bytes=after.st_size)
    return result


@contextmanager
def project_lock(root: Path) -> Iterator[None]:
    """Fail promptly on competing writer; OS releases the lock when owner exits."""
    with (Path(root) / ".project.lock").open("a+b") as stream:
        stream.seek(0, 2)
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def publish_directory(*, staging: Path, destination: Path) -> None:
    """Publish an app-validated revision; caller holds the destination's project lock.

    Staging must contain the complete validated manifest and all immutable files.
    Selection-pointer publication is a separate operation. Never replaces revisions.
    """
    staging, destination = Path(staging), Path(destination)
    if not staging.is_dir() or staging.is_symlink():
        raise ValueError("Expected a regular staging directory")
    if destination.exists():
        raise FileExistsError(destination)
    if staging.stat().st_dev != destination.parent.stat().st_dev:
        raise ValueError("Publication must stay on the same filesystem")
    # Cooperating publishers hold project_lock; rename never copies a partial tree.
    staging.rename(destination)
