import sys
import pytest
from freemocap_sdk import bundle


@pytest.mark.parametrize("resources", [[], [r"C:\source directory\worker.py:example/workers", "assets/models:example/models"]])
def test_bundle_passes_explicit_resources_as_separate_arguments(tmp_path, monkeypatch, resources):
    entry = tmp_path / "backend.py"
    entry.write_text("print('backend')", encoding="utf-8")
    output, work = tmp_path / "output", tmp_path / "work"
    argv = ["bundle", "--entrypoint", str(entry), "--name", "backend",
            "--output", str(output), "--work", str(work),
            "--collect-data", "example", "--collect-data", "example"]
    for resource in resources:
        argv.extend(("--add-data", resource))
    monkeypatch.setattr(sys, "argv", argv)
    calls = []
    monkeypatch.setattr(bundle.subprocess, "run", lambda command, **kwargs: calls.append((command, kwargs)))
    bundle.main()
    command, kwargs = calls[0]
    assert command[:3] == [sys.executable, "-m", "PyInstaller"]
    assert [command[i + 1] for i, value in enumerate(command) if value == "--add-data"] == resources
    assert [command[i + 1] for i, value in enumerate(command) if value == "--collect-data"] == ["freemocap_sdk", "example"]
    assert command[-1] == str(entry.resolve())
    assert kwargs == {"check": True}
    assert output.is_dir() and work.is_dir()
