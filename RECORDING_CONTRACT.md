# SDK recording contract

The shared path authority is packaged as
`packages/server/freemocap_sdk/recording_paths.json`. Python producers use
`freemocap_sdk.recording_structure.RecordingStructure` (also `RecordingPaths`).
Construction and inspection create no files. Application code must not maintain
a competing set of canonical path constants.

`RecordingStructure(base_directory=..., recording_name=...)` uses the same named
path properties as Core, adding `videos_stereo_dir` and `stereo_manifest_path`.
`application_dir("skellyclicker")` gives the recording-local extension. `relative`
creates recording-relative associations; `from_root` constructs the descriptor
from an existing root. A staging tree must retain the final recording basename.

```text
<recording-id>/
  <recording-id>_recording_info.json
  <recording-id>_calibration.toml
  <recording-id>_data.parquet              # only a genuine compatible saved result
  videos/
    synchronized/                        # decoded synchronized processing inputs
      timestamps/camera_timestamps/
    annotated/                           # derived annotated media
    stereo/
      <recording-id>_stereo_sources.json  # explicit source links and support provenance
  <application-id>/                      # additive results, depth, poses, reviews, caches
  exports/                               # optional
  logs/                                  # optional
```

The stereo directory represents source recordings that require stereo-specific
handling. Under linked-source operation its producer-owned manifest resolves
original source and calibration-support files with identities; it does not imply
that a source was copied. Keep original external recordings untouched. No implicit
junctions, symlinks or hardlinks. A future contained-source mode must state its copy
semantics explicitly. Stereo-derived depth, poses and training data belong in the
application extension, not beside source media. The root calibration describes the
exact synchronized images, separately from factory configuration linked under stereo.

The recording ID is the folder name; source/capture identities remain separate.
Record actual coverage: a sample clip gets its own recording identity and parent
frame span, or remains an explicitly bounded application result. Never present a
30-frame result as a complete source recording.

Shared info retains explicit camera/video and timing associations. Video filenames
are relative to the synchronized video directory; timing paths are recording-root
relative, matching existing readers. Keep exact source clocks in producer provenance.
Root Parquet is optional for unprocessed inputs. The SDK display adapter's
`freemocap.playback` file must remain application data; it is not a substitute for
the Core `freemocap.recording` descriptor.

This extends the inspected Core maintained contract with `videos/stereo`. Current
Core discovery and fresh posthoc consumers still use legacy video paths. SDK layout
conformance alone does not establish direct-open compatibility. The owner explicitly
prohibits Core changes in this work. Do not add a hidden second layout to compensate.

## Publishing processing inputs

`freemocap_sdk.recording_inputs.write_recording_inputs` writes into fresh staging
after the application has decoded and verified the videos. Supply `structure`,
`videos` (camera ID to basename), `cameras` (the existing SDK calibration shape),
`rotation_vectors` (camera ID to world-to-optical Rodrigues vector), integer
`timestamps_ns`, `source_frame_indices`, a shared `source_clock_origin_ns`,
`provenance`, and optional `recording_uuid`. The geometry owner supplies rotation
vectors; for Forge use `RotationQuaternion.to_rotation_vector()`. No coordinate
conversion, stereo decoding or solver is implemented by this serializer.

The writer emits canonical info JSON, camera TOML, measured camera and multiframe
CSV sidecars, and exact source timing JSON. Integer clock-origin subtraction occurs
before conversion to seconds. CSV indices are local video indices; source indices
and exact nanoseconds stay explicit. The application verifies actual encoded frame
counts and publishes the complete staging tree and updated pointers under its lock.
The helper rejects existing output files and does not create root Parquet or exports.

TOML records supplied intrinsics, world-to-camera rotation/translation in mm, and
camera world poses. It omits unavailable solver metadata. Current Core supplies
historical metadata defaults when loading such a file; those defaults are not a
factory camera's measured board-solve statistics. Actual import/factory provenance
belongs in `input_provenance` and the stereo source manifest.

The SDK backend bundler includes `freemocap_sdk` package data automatically, so the
path contract travels with the frozen application. Other producer package data
still requires the bundler's explicit `--collect-data` arguments.
