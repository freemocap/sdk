import json
from pathlib import Path

import pytest

from freemocap_sdk.storage import atomic_json, file_digest, inventory, project_lock, publish_directory, resolve_relative


def test_atomic_json_invalid_value_preserves_previous(tmp_path):
    path = tmp_path / "sample_project.json"
    atomic_json(path, {"value": 1})
    with pytest.raises(ValueError):
        atomic_json(path, {"value": float("nan")})
    assert json.loads(path.read_text()) == {"value": 1}
    assert list(tmp_path.glob(".pending-*")) == []


@pytest.mark.parametrize("relative", ["../outside", "/absolute", "a/../b", "a\\b", "C:/outside", "a//b", ""])
def test_relative_escape_rejected(tmp_path, relative):
    with pytest.raises(ValueError):
        resolve_relative(tmp_path, relative)


def test_read_only_resolution_and_inventory(tmp_path):
    missing = tmp_path / "missing"
    assert resolve_relative(missing, "nested/file") == missing / "nested/file"
    with pytest.raises(NotADirectoryError):
        inventory(missing)
    assert not missing.exists()
    path = tmp_path / "data"
    path.write_bytes(b"abc")
    assert inventory(tmp_path)["data"].sha256 == file_digest(path)
    assert inventory(tmp_path)["data"].bytes == 3


def test_revision_publication_never_overwrites(tmp_path):
    staging = tmp_path / "staging"
    staging.mkdir()
    atomic_json(staging / "result_manifest.json", {"complete": True})
    destination = tmp_path / "revision"
    with project_lock(tmp_path):
        publish_directory(staging=staging, destination=destination)
    assert (destination / "result_manifest.json").is_file()
    staging.mkdir()
    with pytest.raises(FileExistsError):
        publish_directory(staging=staging, destination=destination)
    assert staging.exists()
