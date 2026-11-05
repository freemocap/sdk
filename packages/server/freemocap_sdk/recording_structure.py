"""Shared recording paths; construction and inventory never create directories.

Derived from Core RecordingStructure and its maintained recording contract.
recording_paths.json is packaged with this module and is the path authority.
Stereo decoding and application extension contents remain producer-owned.
"""
from dataclasses import dataclass
from importlib.resources import files
import json
from pathlib import Path
import re

from .storage import resolve_relative

_CONTRACT = json.loads(files("freemocap_sdk").joinpath("recording_paths.json").read_text(encoding="utf-8"))
RECORDING_CONTRACT_VERSION: int = _CONTRACT["contract_version"]


def path_component(value: str) -> str:
    """A portable single component, never an embedded or absolute path."""
    reserved = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
    if (not value or value in {".", ".."} or value[-1] in " ."
            or re.search(r'[<>:"/\\|?*\x00-\x1f]', value)
            or value.split(".")[0].upper() in reserved):
        raise ValueError(f"Expected a portable path component: {value!r}")
    return value


@dataclass(frozen=True)
class RecordingStructure:
    base_directory: Path
    recording_name: str

    def __post_init__(self):
        path_component(self.recording_name)
        object.__setattr__(self, "base_directory", Path(self.base_directory).resolve())

    @classmethod
    def from_root(cls, root: Path) -> "RecordingStructure":
        root = Path(root).resolve()
        return cls(base_directory=root.parent, recording_name=root.name)

    @property
    def full_path(self) -> Path:
        return resolve_relative(self.base_directory, self.recording_name)

    def _path(self, key: str) -> Path:
        return resolve_relative(self.full_path, _CONTRACT["paths"][key].format(recording_name=self.recording_name))

    @property
    def videos_synchronized_dir(self) -> Path:
        return self._path("videos_synchronized_dir")

    @property
    def videos_annotated_dir(self) -> Path:
        return self._path("videos_annotated_dir")

    @property
    def videos_stereo_dir(self) -> Path:
        return self._path("videos_stereo_dir")

    @property
    def stereo_manifest_path(self) -> Path:
        return self._path("stereo_manifest_path")

    @property
    def camera_timestamps_dir(self) -> Path:
        return self._path("camera_timestamps_dir")

    def camera_timing_path(self, camera_id: str) -> Path:
        return self.camera_timestamps_dir / f"{self.recording_name}.camera{path_component(camera_id)}.timestamps.csv"

    @property
    def multiframe_timing_path(self) -> Path:
        return self._path("multiframe_timing_path")

    @property
    def source_timing_path(self) -> Path:
        return self._path("source_timing_path")

    @property
    def calibration_toml_path(self) -> Path:
        return self._path("calibration_toml_path")

    @property
    def recording_info_path(self) -> Path:
        return self._path("recording_info_path")

    @property
    def data_parquet_path(self) -> Path:
        return self._path("data_parquet_path")

    @property
    def exports_dir(self) -> Path:
        return self._path("exports_dir")

    @property
    def logs_dir(self) -> Path:
        return self._path("logs_dir")

    def application_dir(self, application_id: str) -> Path:
        return resolve_relative(self.full_path, path_component(application_id))

    def relative(self, path: Path) -> str:
        """Return portable recording-relative metadata, rejecting escaped references."""
        return Path(path).resolve().relative_to(self.full_path).as_posix()


RecordingPaths = RecordingStructure
