"""Application-supplied playback resources, with the established tall sample layout.

This is a derived display artifact, not Core's full processing descriptor. Its
embedded freemocap.playback metadata contains the complete manifest + provenance.
App authoritative numerical data stays app-owned. No Core import is needed.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from concurrent.futures import CancelledError
from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import tempfile
from typing import Any, Literal
from urllib.parse import quote

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class Descriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class RecordingTimeline(Descriptor):
    sensor_group: str
    source: str
    frame_numbers: tuple[int, ...]
    timestamps_s: tuple[float, ...]

    @model_validator(mode="after")
    def grid(self):
        if not self.frame_numbers or len(self.frame_numbers) != len(self.timestamps_s):
            raise ValueError("Matching nonempty frame/time arrays required")
        if any(x < 0 for x in self.frame_numbers) or any(not math.isfinite(x) for x in self.timestamps_s):
            raise ValueError("Invalid frame/time")
        if any(b <= a for a, b in zip(self.frame_numbers, self.frame_numbers[1:])) or any(
                b <= a for a, b in zip(self.timestamps_s, self.timestamps_s[1:])):
            raise ValueError("Frame/time grids must strictly increase")
        return self


class PlaybackMedia(Descriptor):
    video_source: Literal["synchronized", "annotated"] = "synchronized"
    video_filename: str
    nominal_fps: float = Field(gt=0)
    timeline: RecordingTimeline


class RecordingChannel(Descriptor):
    sensor_group: str
    source: str
    reference_frame: str | None
    kind: str
    names: tuple[str, ...]
    components: dict[str, str]
    stage: str = "display"

    @model_validator(mode="after")
    def axes(self):
        if not self.names or len(set(self.names)) != len(self.names) or not all(self.names):
            raise ValueError("Unique nonempty names required")
        if not self.components or any(not name or not unit for name, unit in self.components.items()):
            raise ValueError("Named components with explicit units required")
        return self


class PlaybackRun(Descriptor):
    run_id: int = Field(ge=0)
    model_sources: dict[str, str] = Field(default_factory=dict)
    models: tuple[dict[str, JsonValue], ...] = ()
    channels: tuple[RecordingChannel, ...] = ()
    static_channels: tuple[dict[str, JsonValue], ...] = ()
    timelines: tuple[RecordingTimeline, ...]
    media: tuple[PlaybackMedia, ...]
    camera_geometry: dict[str, tuple[dict[str, JsonValue], ...]] = Field(default_factory=dict)


class PlaybackManifest(Descriptor):
    recording_id: str = Field(min_length=1)
    revision: str = Field(min_length=1)
    selected_run_id: int = Field(ge=0)
    runs: tuple[PlaybackRun, ...]

    @model_validator(mode="after")
    def identities(self):
        ids = [run.run_id for run in self.runs]
        if len(set(ids)) != len(ids) or self.selected_run_id not in ids:
            raise ValueError("Selected run must exist and run IDs must be unique")
        for run in self.runs:
            timeline_keys = [(timeline.sensor_group, timeline.source) for timeline in run.timelines]
            if len(set(timeline_keys)) != len(timeline_keys):
                raise ValueError("Duplicate timeline identity")
            media_keys = [(media.video_source, media.video_filename) for media in run.media]
            if len(set(media_keys)) != len(media_keys):
                raise ValueError("Duplicate media identity")
            for source in {media.video_source for media in run.media}:
                media_group = [media for media in run.media if media.video_source == source]
                first = media_group[0]
                if any(media.timeline.frame_numbers != first.timeline.frame_numbers or
                       media.timeline.timestamps_s != first.timeline.timestamps_s or
                       media.nominal_fps != first.nominal_fps for media in media_group):
                    raise ValueError("Synchronized media must share frame/time grid and encoding rate")
            keys = [channel_key(channel) for channel in run.channels]
            if len(set(keys)) != len(keys):
                raise ValueError("Duplicate channel identity")
            clocks = {timeline.sensor_group for timeline in run.timelines
                      if timeline.source == f"timing:{timeline.sensor_group}"}
            if any(channel.sensor_group not in clocks for channel in run.channels):
                raise ValueError("Each channel group needs an explicit timing:<group> timeline")
        return self


def channel_key(channel: RecordingChannel) -> tuple:
    return channel.sensor_group, channel.source, channel.reference_frame, channel.kind


@dataclass(frozen=True)
class ChannelSamples:
    run_id: int
    channel: RecordingChannel
    frame_numbers: np.ndarray
    timestamps_s: np.ndarray
    values: np.ndarray  # [frames, names, components]; NaN means missing, never infinity


SAMPLE_SCHEMA = pa.schema([
    pa.field("timestamp_s", pa.float64(), nullable=False),
    pa.field("sensor_group", pa.string(), nullable=False),
    pa.field("frame_number", pa.int64(), nullable=False),
    pa.field("source", pa.string(), nullable=False),
    pa.field("reference_frame", pa.string()),
    pa.field("channel", pa.string(), nullable=False),
    pa.field("name", pa.string(), nullable=False),
    pa.field("component", pa.string(), nullable=False),
    pa.field("value", pa.float64()),
    pa.field("units", pa.string(), nullable=False),
    pa.field("run_id", pa.int64(), nullable=False),
])


def write_playback(*, path: Path, manifest: PlaybackManifest, samples: Sequence[ChannelSamples],
                   provenance: dict[str, JsonValue], cancelled: Callable[[], bool] = lambda: False) -> None:
    """Validate dense channels and atomically write a self-describing display materialization."""
    declared = {(run.run_id, channel_key(channel)): channel for run in manifest.runs for channel in run.channels}
    supplied = [(sample.run_id, channel_key(sample.channel)) for sample in samples]
    if len(set(supplied)) != len(supplied) or set(supplied) != set(declared):
        raise ValueError("Samples must cover each declared channel exactly once")
    payload = {"schema_version": 1, "manifest": manifest.model_dump(mode="json"), "provenance": provenance}
    schema = SAMPLE_SCHEMA.with_metadata({b"freemocap.playback": json.dumps(payload, allow_nan=False).encode()})
    path = Path(path)
    fd, name = tempfile.mkstemp(dir=path.parent, suffix=".parquet.tmp")
    os.close(fd)
    temporary = Path(name)
    try:
        with pq.ParquetWriter(temporary, schema, compression="zstd") as writer:
            for sample in samples:
                if cancelled():
                    raise CancelledError()
                channel = sample.channel
                if channel != declared[(sample.run_id, channel_key(channel))]:
                    raise ValueError("Sample definition differs from manifest")
                run = next(run for run in manifest.runs if run.run_id == sample.run_id)
                clock = next(t for t in run.timelines if t.sensor_group == channel.sensor_group
                             and t.source == f"timing:{channel.sensor_group}")
                frames, times, values = np.asarray(sample.frame_numbers), np.asarray(sample.timestamps_s), np.asarray(sample.values)
                if not np.array_equal(frames, clock.frame_numbers) or not np.array_equal(times, clock.timestamps_s):
                    raise ValueError("Channel grid differs from its declared clock")
                n, k, c = len(frames), len(channel.names), len(channel.components)
                if values.shape != (n, k, c) or np.isinf(values).any():
                    raise ValueError("Values must match [frames,names,components], finite or NaN")
                if channel.kind in ("ROTATIONS_LOCAL", "ROTATIONS_WORLD"):
                    if list(channel.components.items()) != [(key, "1") for key in ("w", "x", "y", "z")]:
                        raise ValueError("Rotations require dimensionless wxyz")
                    rows = values.reshape(-1, 4)
                    missing = np.isnan(rows)
                    if np.any(missing.any(axis=1) != missing.all(axis=1)) or np.any(
                            np.abs(np.sum(rows[~missing.all(axis=1)] ** 2, axis=1) - 1) > 1e-5):
                        raise ValueError("Rotations must be unit quaternions or entirely missing")
                # Bound conversion batches; never construct per-keypoint dicts.
                for start in range(0, n, max(1, 65536 // (k * c))):
                    if cancelled():
                        raise CancelledError()
                    end = min(n, start + max(1, 65536 // (k * c)))
                    count, width = end - start, k * c
                    flat = np.asarray(values[start:end], dtype=np.float64).ravel()
                    arrays = [pa.array(np.repeat(times[start:end], width)), pa.repeat(channel.sensor_group, count * width),
                              pa.array(np.repeat(frames[start:end], width), type=pa.int64()), pa.repeat(channel.source, count * width),
                              pa.repeat(pa.scalar(channel.reference_frame, type=pa.string()), count * width),
                              pa.repeat(channel.kind, count * width), pa.array(np.tile(np.repeat(channel.names, c), count)),
                              pa.array(np.tile(tuple(channel.components), count * k)), pa.array(flat, mask=np.isnan(flat)),
                              pa.array(np.tile(tuple(channel.components.values()), count * k)),
                              pa.repeat(pa.scalar(sample.run_id, type=pa.int64()), count * width)]
                    writer.write_batch(pa.RecordBatch.from_arrays(arrays, schema=schema))
        with temporary.open("rb+") as stream:
            os.fsync(stream.fileno())
        if cancelled():
            raise CancelledError()
        # Write inside application-owned staging, then publish an immutable revision.
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@dataclass(frozen=True)
class RecordingResources:
    manifest: PlaybackManifest
    parquet: Path
    videos: dict[str, Path]  # filename -> immutable browser-compatible proxy/media


def create_recording_router(resolve: Callable[[str], RecordingResources]) -> APIRouter:
    """Resolve app recording IDs; never accept arbitrary client filesystem paths."""
    router = APIRouter(prefix="/freemocap/recordings")

    def resource(recording_id: str) -> RecordingResources:
        try:
            result = resolve(recording_id)
        except (KeyError, FileNotFoundError) as error:
            raise HTTPException(404, "Recording unavailable") from error
        if result.manifest.recording_id != recording_id:
            raise HTTPException(409, "Recording identity mismatch")
        return result

    @router.get("/{recording_id}/playback/bundle")
    def bundle(recording_id: str):
        item = resource(recording_id)
        run = next(run for run in item.manifest.runs if run.run_id == item.manifest.selected_run_id)
        sources: dict[str, Any] = {}
        for media in run.media:
            if media.video_filename not in item.videos:
                raise HTTPException(409, f"Missing media: {media.video_filename}")
            path = item.videos[media.video_filename]
            source = sources.setdefault(media.video_source, {"available": True, "valid": True, "video_count": 0, "videos": []})
            source["videos"].append({"video_id": media.timeline.source, "filename": media.video_filename,
                                     "size_bytes": path.stat().st_size,
                                     "stream_url": f"/freemocap/recordings/{quote(recording_id, safe='')}/media/{quote(media.video_filename, safe='')}?revision={quote(item.manifest.revision, safe='')}"})
            source["video_count"] += 1
        return {"recording_id": recording_id, "recording_fps": run.media[0].nominal_fps if run.media else None,
                "manifest": item.manifest.model_dump(mode="json"), "media": [m.model_dump(mode="json") for m in run.media],
                "videos": {"preferred_source": next(iter(sources), "synchronized"), "sources": sources},
                "calibration": None, "errors": []}

    @router.get("/{recording_id}/parquet")
    def parquet(recording_id: str, revision: str):
        item = resource(recording_id)
        if item.manifest.revision != revision:
            raise HTTPException(409, "Recording revision changed; reload the bundle")
        return FileResponse(item.parquet, media_type="application/vnd.apache.parquet",
                            headers={"ETag": f'"{revision}"', "Cache-Control": "private, max-age=31536000, immutable"})

    @router.get("/{recording_id}/media/{filename}")
    def media(recording_id: str, filename: str, revision: str):
        item = resource(recording_id)
        if item.manifest.revision != revision:
            raise HTTPException(409, "Recording revision changed; reload the bundle")
        path = item.videos.get(filename)
        if path is None:
            raise HTTPException(404, "Unknown media")
        return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})

    return router
