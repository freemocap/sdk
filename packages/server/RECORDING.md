# Application recording playback

`freemocap_sdk.recording` connects application-owned immutable results to the
existing SDK `PlaybackWorkspace`. The application owns its source artifacts,
pose policy and conversion into display channels. This does not replace its
authoritative result schema or import a Core recording directory.

Build `PlaybackManifest` with `PlaybackRun` entries containing model definitions,
channels, static channels, camera geometry, media and timelines. Each channel group
must have a `RecordingTimeline` whose source is `timing:<sensor_group>`.
`ChannelSamples.values` is a dense `[frame, name, component]` array. Missing values
are NaN, serialized as null; rotations use unit `w,x,y,z` quaternions or all NaN.
The UI model schema remains the authority for renderable model definitions.

Each run retains `reference_frames`, keyed by the exact channel reference IDs,
and `scene_reference_frames`, mapping each displayed sensor group to its shared
world frame. A display reference uses the maintained Core spatial definition:
`{name: "blender_world", basis: "blender_x_right_y_forward_z_up", units: "mm"}`.
The ID is application-chosen; its meaning comes from the definition. Alignment
and additional-transform provenance can be retained alongside these fields.
Convert source measurements once at publication. Saved world coordinates already
include that conversion; the viewer must not apply provenance transforms again.

Camera `world_position` is the optical center in that frame, in millimeters;
`world_orientation` maps optical camera coordinates into that world frame.
Extrinsics describe the inverse world-to-camera transform. Cameras and rendered
world position/rotation channels must share the group's declared scene frame.
The renderer applies those poses directly, without a camera-only axis offset.
These fields are required: regenerate derived playback from source data when
updating the producer, rather than inferring a missing convention.

Call `write_playback(path=..., manifest=..., samples=..., provenance=...)` in a
staging directory. It writes the established tall display columns in bounded
batches and embeds the manifest and provenance under `freemocap.playback`.
Publish that directory as an immutable revision using the storage primitives.
Keep original int64 timestamps in the application's source data; display seconds
and encoded video time are distinct from original source frame identity.

Mount `create_recording_router(resolve)` where `resolve(recording_id)` returns
`RecordingResources(manifest, parquet, videos)`; `videos` maps exact filenames to
immutable, browser-compatible video paths. The resolver owns identity and access;
client requests never choose arbitrary filesystem paths. The bundle endpoint feeds
`PlaybackWorkspace`; Parquet and media endpoints check the requested revision.
Video `FileResponse` supports byte ranges; revision-bearing URLs permit immutable
caching. Parquet ETag is the quoted manifest revision. SDK `create_app` exposes
these response headers to permitted cross-origin clients.

Each media entry supplies the encoded nominal FPS plus an explicit source frame
and time grid. Cameras in one source must share that grid and rate. The encoded
sample index maps into the source grid; it must not be represented as the original
frame number. Use playable MP4/WebM proxies, not one HTTP image request per frame.
No browser transcoder route is provided by this adapter.
