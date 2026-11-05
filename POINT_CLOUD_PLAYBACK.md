# Recorded point clouds

`PlaybackWorkspace` accepts optional `pointCloud={{manifestUrl}}`. The producer
owns stereo reconstruction, filtering, coordinate conversion and file publication.
SDK owns loading, bounded storage, rendering and the shared presentation clock.
Cloud frames use the same exact `timestamp_s` values as the selected playback run.
Missing or loading frames are hidden; an older cloud is never held over a new time.

Manifest JSON:

```json
{
  "schema_version": 1,
  "revision": "immutable-output-id",
  "reference_frame": {
    "id": "scene-reference-id",
    "definition": {"name": "scene", "basis": "blender_x_right_y_forward_z_up", "units": "mm"}
  },
  "max_points": 25000,
  "frames": [{"frame_index": 0, "source_frame_index": 90, "timestamp_s": 0,
    "timestamp_ns": "1700000000000000001", "chunk_index": 0}],
  "chunks": [{"url": "chunk-0000.bin", "byte_length": 1024}]
}
```

The example byte length is illustrative; supply the actual complete file length.
Reference ID and full definition must match the selected run's
`scene_reference_frames[group]` and `reference_frames[id]`. Preserve all definition
fields, including alignment provenance. The renderer applies the same scene
reference transform as other world geometry; it performs no camera-basis conversion.

Each chunk starts with a four-byte little-endian unsigned JSON-header length,
followed by UTF-8 header bytes, then padding to the next four-byte boundary.
The remaining payload holds packed little-endian float32 XYZ positions in mm and
photo sRGB uint8 colors. Header JSON contains `schema_version`, `revision`, the full
`reference_frame`, and `frames`. Each frame repeats all four identity/timing fields
shown above, replacing `chunk_index` with `point_count`, `positions_offset`, and
`colors_offset`. Offsets are byte offsets relative to the payload. XYZ offsets
must be four-byte aligned. Each array contains `3 * point_count` values.
Only finite points are allowed; a valid empty frame uses zero points.

Files must be immutable within a revision. Chunk URLs resolve relative to the
manifest URL. Routes must permit fetching from the application's viewport worker.
The decoder checks declared size, frame identities, timestamps, reference and
revision before exposing typed views. Limits: 60,000 points/frame, 60 frames/chunk,
16 MiB/chunk, 128 KiB/header. Initial producer settings are 25,000 points/frame and
15 frames/chunk, subject to measured native performance and visual quality.

The viewport worker starts preloading as soon as the manifest is available, even
while paused. `pointCloud.loading` accepts `concurrency` (default 16, integer 1–64)
and `maxResidentBytes` (default 512 MiB). Clips whose declared payload fits that
budget are loaded completely before cloud presentation and retained for seeks,
replay and loops, with no further cloud requests after readiness. XYZ/RGB views
share each retained chunk allocation. The current 751-frame clip uses
281,769,588 declared bytes, plus metadata, browser networking overhead and the
fixed renderer buffers below; the byte budget is not a total-process memory cap.

Larger recordings use a forward window bounded by declared chunk bytes, wrapping
prefetch at the end. Seek changes cancel irrelevant window requests; obsolete
completions cannot publish. Source changes abort preload and release resident data.
A chunk larger than the configured budget is rejected explicitly.
The renderer reuses one point geometry and position/color attributes, uploading
only active ranges and changing draw count [@threeBufferAttribute2026;
@threeBufferGeometry2026]. No per-point scene objects are allocated.

The worker emits `pointCloudStats` every 500 ms with request count, resident bytes,
displayed-frame count, requested frames initially missing from cache, cumulative fetch/decode time,
current local/source frame, timestamp and point count. `pointCloudError` reports
loading or validation errors. These diagnostics supplement actual native render
timing and video/model synchronization measurements; they do not establish FPS.
The renderer converts sRGB bytes through a precomputed lookup table into reusable
linear float32 color attributes. Both position and color buffers have capacity for
60,000 points (1,440,000 bytes total on CPU and on GPU). The shared postprocessing
chain converts linear output for display once; only HDR/emissive values bloom
[@threeColorManagement2026]. Initial and explicit framing include current cloud
bounds; normal playback never refits the camera.

Stats also include resident chunk and in-flight request counts, rendered frame
identity, visibility, persistent geometry/attribute IDs, upload count and CPU
attribute-copy time (`uploadMs`, `maxUploadMs`). Copy time is not GPU execution time.

Loading diagnostics include `status` (idle/loading/ready/error), `mode` (clip/window),
`loadedBytes`, `totalBytes`, `totalChunks`, `readyMs`, configured `concurrency`, and
`maxResidentBytes`. `reservedBytes` includes retained and active chunk allocations,
not browser or GPU memory. In window mode readiness does not mean the entire clip
is resident. The viewport displays loading progress and readiness.
`hiddenReason` distinguishes `clip-loading`, `cache-miss`,
`presentation-clock-unavailable`, `timestamp-not-found`, and `no-source` from
`visible`. A ready clip can still be hidden when the actual video presentation
clock is unavailable; preloading does not bypass the shared-frame gate.

Local headless Edge comparison (2026-11-05, APP HTTP endpoint, existing 51 chunks)
loaded and validated the 281,769,588-byte clip in 831/867 ms at concurrency 4,
773/767 ms at 8, and 741/767 ms at 16. Each trial started with an empty loader
cache, not a flushed OS cache; browser networking may cap actual connections.
The default is 16, configurable for other machines. All six trials verified
1,503 forward/reverse/loop frame selections with no post-ready requests. These
loader results do not establish native rendering cadence or solve presentation
clock gaps. Existing 15-frame chunks already load in under one second here;
repacking the recording is not required for this preload correction.
