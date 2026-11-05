# Consuming the SDK during SFN development

The SDK is an independent repository. Consumers import built packages through public exports, never private source paths. Core's current copies remain in place during this transition.

## Available client package

`packages/client` contains `@freemocap/client` at development version `0.1.0-dev.0`. Public entry points are `@freemocap/client`, `@freemocap/client/http`, `@freemocap/client/images`, and `@freemocap/client/recording`. The package exports compiled JavaScript and TypeScript declarations from `dist/`.

From `packages/client`, install with `npm ci --ignore-scripts`, then run `npm run build` (or `npm test` for validation). The committed lockfile defines the dependency set. The package declares Node >=22; current local evidence uses Node24.21.0.

For local application development, declare a `file:` dependency on this package directory in the application's package.json. Its relative path depends on the eventual frontend directory. Run the application's installation once to establish the dependency. Rebuild the SDK package after SDK source changes; consumers then read the rebuilt public exports through the local link. Restart the consumer dev server when its dependency cache requires it. Do not point application aliases at SDK src or Core private folders.

## Reproducible handoff to another machine

Check out the recorded SDK commit, install its lockfile, build and test the client, then create a tarball with `npm pack --pack-destination <ignored-artifact-directory>`. Install that exact tarball into the consumer and commit its dependency/lockfile changes in the consumer repository. Record the SDK commit and tarball SHA256 with the handoff; the repeated development version alone does not identify the source. A release asset or explicit build-from-commit instructions can distribute it before registry publication. A bare Git dependency on the repository root is not an installable package: this repository contains multiple package directories.

The local file dependency is the fast development path; installation from a tarball is the packaging acceptance check. Verify that declarations, assets and any workers required by a package are included, without depending on a sibling checkout.

## Playback UI and server

`packages/ui` exposes `PlaybackWorkspace({baseUrl, recording})` and `@freemocap/ui/styles.css`. The recording selection is null or `{id, parentDirectory?, displayName?}`. It packages Core's playback layout, synchronized video controls, recording provider and original offscreen 3D/Parquet workers. React, React DOM and the client are peer dependencies. Install the client artifact alongside the UI artifact; no sibling source path is required in a packed consumer. See its README for worker asset handling, global styles and the single-active-viewport limit.

`packages/server` is the Python distribution `freemocap-sdk-server`. Install with `uv sync --frozen --group dev` in that package, or declare it as a local editable dependency in an application environment. Its public imports are `freemocap_sdk.server` and `freemocap_sdk.stream`. The server factory accepts routers, lifespan and WebSocket handler; it does not provide Core domain routes. The committed lockfile pins its isolated validation environment.

The initial acceptance target is an honest empty playback shell in a standalone Tauri desktop application, with HTTP/WebSocket/image transport and owned backend startup/shutdown. Browser checks support that validation but cannot substitute for a built desktop launch. Loading real recordings additionally requires application recording resource endpoints and dataset validation; an empty shell is not evidence that recording playback works.

## Desktop packaging

`packages/desktop` is the Rust crate `freemocap-desktop`. Tauri consumers use its `BackendProcess` to start the packaged backend, obtain its ready endpoint and stop it on application exit. The Python server's `bundle` extra supplies PyInstaller. `python -m freemocap_sdk.bundle` freezes an application entry point into a complete backend directory, which the application includes in Tauri resources. See the desktop package README for the exact contract and resource mapping. No Python or npm command is required from the packaged application's user.

Windows is the immediate build target. Other platforms, signing and public releases require separate validation and are not claimed by local package checks.

## Future distribution

Once the package boundaries and release process are established, publish independently versioned registry artifacts with explicit dependency ranges and lockfiles. Applications will replace `file:`/tarball dependencies with package versions without changing their public imports. Registry publication, final package naming and UI architecture are not prerequisites for current client verification and application workflow definition.
