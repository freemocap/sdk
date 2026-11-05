# Application storage primitives

Import from `freemocap_sdk.storage`. Project schemas, filenames, approval states and retention belong to the consuming application.

Canonical recording paths and processing-input publication are shared separately
through `freemocap_sdk.recording_structure` and `freemocap_sdk.recording_inputs`;
see the root `RECORDING_CONTRACT.md`. Application extensions and source-specific
stereo manifests remain application-owned.

| Interface | Contract |
| --- | --- |
| `file_digest(path)` | Streaming SHA256 of file bytes. |
| `atomic_json(path, value)` | Serialize finite JSON, fsync a same-directory temporary file, replace destination. Parent must exist. Serialize Pydantic models before calling. |
| `resolve_relative(root, relative)` | Resolve portable slash-separated path inside root, rejecting traversal and resolved symlink escape. Does not create anything. |
| `inventory(root)` | Read-only map of relative paths to `ArtifactIdentity(sha256, bytes)`. Missing root and symlinks are errors. Caller chooses the artifact root; no application filenames are silently excluded. |
| `project_lock(root)` | OS-owned nonblocking writer lock at `.project.lock`. Root must exist. Lock-file existence is not liveness. |
| `publish_directory(staging=..., destination=...)` | Rename a fully validated staged directory on the same filesystem. Caller holds project lock and has validated complete files/manifest. Existing revisions cannot be replaced. Parent must exist. |

Opening a project does not need a writer lock or directory creation. Writers use the lock around allocation through publication. A selection-pointer update is separate from immutable revision publication; readers must distinguish complete unselected revisions from incomplete staging. These primitives do not claim a multi-file filesystem transaction or defend against a separate malicious process racing filesystem changes.

Source provenance: `provenance/storage-seed.json`. Source tests run inside the SDK environment; they do not substitute for application review.
