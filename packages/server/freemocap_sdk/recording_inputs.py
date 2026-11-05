"""Publish shared input metadata into an application-owned staging recording.

Media decoding and geometry conversion are supplied by the producer. This module
serializes Core camera TOML tables and SkellyCam file/timing associations; it does
not invent capture/solver history or turn display Parquet into a recording result.
"""
from collections.abc import Mapping, Sequence
import csv
import io
import json
import os
from pathlib import Path
import tempfile
from typing import Any

import numpy as np

from .recording_structure import RECORDING_CONTRACT_VERSION, RecordingStructure, path_component
from .storage import atomic_json, resolve_relative


def _array(value: Any, shape: tuple[int, ...], name: str) -> np.ndarray:
    array = np.asarray(value, dtype=np.float64)
    if array.shape != shape or not np.isfinite(array).all():
        raise ValueError(f"{name} requires finite values with shape {shape}")
    return array


def calibration_toml(*, cameras: Sequence[Mapping[str, Any]],
                     rotation_vectors: Mapping[str, Sequence[float]]) -> str:
    """Serialize already-converted cameras; rotations come from the geometry owner.

    Rodrigues vectors and translations are world-to-optical; lengths are mm.
    Omit unavailable solver metadata instead of claiming a fabricated board solve.
    """
    ids = [camera['id'] for camera in cameras]
    if not ids or len(set(ids)) != len(ids) or set(rotation_vectors) != set(ids) or 'metadata' in ids:
        raise ValueError("Unique camera IDs and matching rotation vectors required")
    indices = [camera['index'] for camera in cameras]
    if len(set(indices)) != len(indices) or any(not isinstance(index, int) or index < 0 for index in indices):
        raise ValueError("Camera indices must be unique nonnegative integers")
    tables = []
    for camera in cameras:
        camera_id = path_component(camera['id'])
        size = camera['image_size']
        if len(size) != 2 or any(not isinstance(value, int) or value <= 0 for value in size):
            raise ValueError("Camera image size requires positive integer width and height")
        intrinsics, extrinsics = camera['intrinsics'], camera['extrinsics']
        rotation = _array(rotation_vectors[camera_id], (3,), 'Rodrigues rotation')
        translation = _array(extrinsics['translation'], (3,), 'Camera translation')
        orientation = _array(camera['world_orientation'], (3, 3), 'Camera world orientation')
        position = _array(camera['world_position'], (3,), 'Camera world position')
        if not np.allclose(orientation.T @ orientation, np.eye(3), atol=1e-7) or not np.isclose(np.linalg.det(orientation), 1, atol=1e-7):
            raise ValueError("Camera orientation must be a proper rotation")
        if not np.allclose(position, -orientation @ translation, atol=1e-6):
            raise ValueError("Camera center and inverse extrinsic translation disagree")
        focal = _array([intrinsics['fx'], intrinsics['fy']], (2,), 'Focal length')
        if np.any(focal <= 0):
            raise ValueError("Focal lengths must be positive")
        principal = _array([intrinsics['cx'], intrinsics['cy']], (2,), 'Principal point')
        distortion = _array([intrinsics[key] for key in ('k1', 'k2', 'p1', 'p2')] + [intrinsics.get('k3', 0.)], (5,), 'Distortion')
        table = dict(name=camera_id, id=camera_id, index=camera['index'], size=list(size),
            matrix=[[float(focal[0]), 0., float(principal[0])], [0., float(focal[1]), float(principal[1])], [0., 0., 1.]],
            distortions=distortion.tolist(), rotation=rotation.tolist(), translation=translation.tolist(),
            world_orientation=orientation.tolist(), world_position=position.tolist())
        # JSON strings/numerical arrays are valid values in this bounded TOML subset.
        tables.append('[' + json.dumps(camera_id) + ']\n' + '\n'.join(
            f'{key} = {json.dumps(value, allow_nan=False)}' for key, value in table.items()))
    return '\n\n'.join(tables) + '\n'


def _atomic_text(path: Path, text: str) -> None:
    descriptor, temporary_name = tempfile.mkstemp(dir=path.parent, suffix='.input.tmp')
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def write_recording_inputs(*, structure: RecordingStructure, videos: Mapping[str, str],
        cameras: Sequence[Mapping[str, Any]], rotation_vectors: Mapping[str, Sequence[float]],
        timestamps_ns: Sequence[int], source_frame_indices: Sequence[int], source_clock_origin_ns: int,
        provenance: Mapping[str, Any], recording_uuid: str | None = None) -> dict[str, Any]:
    """Write into staging after decoded media exists; never replace existing outputs.

    The caller verifies actual video counts/decoding, holds its publication lock,
    and publishes the complete staged folder plus selection pointers afterward.
    One shared source clock describes paired synchronized frames, with exact
    nanoseconds retained alongside the existing reader's seconds CSV format.
    """
    if not structure.full_path.is_dir():
        raise NotADirectoryError(structure.full_path)
    ids = [camera['id'] for camera in cameras]
    if set(ids) != set(videos):
        raise ValueError("Video and calibration camera identities must agree")
    resolved = [resolve_relative(structure.videos_synchronized_dir, path_component(filename)) for filename in videos.values()]
    if len(set(resolved)) != len(resolved) or any(not path.is_file() or path.is_symlink() for path in resolved):
        raise ValueError("Each camera requires its own existing synchronized video")
    times, frames = np.asarray(timestamps_ns), np.asarray(source_frame_indices)
    if (times.ndim != 1 or frames.shape != times.shape or len(times) == 0
            or times.dtype.kind not in 'iu' or frames.dtype.kind not in 'iu'
            or not isinstance(source_clock_origin_ns, (int, np.integer))):
        raise ValueError("Matching nonempty integer timestamps and source frame indices required")
    exact_times, source_frames = [int(value) for value in times], [int(value) for value in frames]
    origin = int(source_clock_origin_ns)
    if (source_frames[0] < 0 or exact_times[0] < origin
            or any(b <= a for a, b in zip(source_frames, source_frames[1:]))
            or any(b <= a for a, b in zip(exact_times, exact_times[1:]))):
        raise ValueError("Source frame indices and timestamps must strictly increase after their origin")
    seconds = [(value - origin) / 1_000_000_000 for value in exact_times]
    if any(b <= a for a, b in zip(seconds, seconds[1:])):
        raise ValueError("Relative seconds cannot represent the source timing distinctly")
    toml = calibration_toml(cameras=cameras, rotation_vectors=rotation_vectors)
    timing_paths = {camera: structure.camera_timing_path(camera) for camera in ids}
    output_paths = [*timing_paths.values(), structure.multiframe_timing_path, structure.source_timing_path,
                    structure.calibration_toml_path, structure.recording_info_path]
    if any(path.exists() for path in output_paths):
        raise FileExistsError("Shared input publication requires fresh staging outputs")
    info: dict[str, Any] = dict(recording_id=structure.recording_name, recording_name=structure.recording_name,
        recording_contract_version=RECORDING_CONTRACT_VERSION, videos=dict(videos),
        camera_timing={camera: structure.relative(path) for camera, path in timing_paths.items()},
        multiframe_timing=structure.relative(structure.multiframe_timing_path),
        source_timing=structure.relative(structure.source_timing_path),
        frame_count=len(exact_times), input_provenance=dict(provenance))
    if recording_uuid is not None:
        info['recording_uuid'] = recording_uuid
    json.dumps(info, allow_nan=False)  # validate metadata before any writes

    def csv_text(frame_column: str) -> str:
        buffer = io.StringIO(newline='')
        writer = csv.writer(buffer)
        writer.writerow([frame_column, 'timestamp.from_recording_start.sec'])
        writer.writerows(enumerate(seconds))
        return buffer.getvalue()

    structure.camera_timestamps_dir.mkdir(parents=True, exist_ok=True)
    for path in timing_paths.values():
        _atomic_text(path, csv_text('recording_frame_number'))
    _atomic_text(structure.multiframe_timing_path, csv_text('multiframe_number'))
    atomic_json(structure.source_timing_path, dict(schema_version=1, source_clock_origin_ns=origin,
        timestamps_ns=exact_times, source_frame_indices=source_frames, local_frame_indices=list(range(len(exact_times)))))
    _atomic_text(structure.calibration_toml_path, toml)
    atomic_json(structure.recording_info_path, info)
    return info
