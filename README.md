# FreeMoCap SDK

Reusable client, server and playback UI packages for applications built with FreeMoCap's machinery. These are parallel extractions; Core's existing copies remain in place during development.

| Package | Directory | Public interface |
| --- | --- | --- |
| `@freemocap/client` | `packages/client` | HTTP client, self-describing WebSocket transport, image and recording decoding |
| `freemocap-sdk-server` | `packages/server` | `freemocap_sdk.server` application composition and `freemocap_sdk.stream` encoding |
| `@freemocap/ui` | `packages/ui` | `PlaybackWorkspace` and `@freemocap/ui/styles.css` |
| `freemocap-desktop` | `packages/desktop` | Rust owned-backend startup, readiness and shutdown for Tauri |

The initial consumer is SkellyClicker's Tauri desktop playback shell. Application branding, navigation, domain routes and lifecycle resources remain application-supplied. The Python server package also supplies a desktop runner and a bundler that includes the Python runtime in the app's resources. The SDK makes the existing machinery usable through public packages; it does not redefine the component domains.

See [package consumption](PACKAGES.md) and each package's README for setup and contracts. Source extraction hashes are recorded in `provenance/`. These development packages are not registry releases.
