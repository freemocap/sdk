# Desktop backend lifecycle

This Rust crate owns a packaged loopback backend for a Tauri application. The existing client, server and UI packages remain independently usable. The application owns its native window, logo, commands, permissions and installer configuration.

SkellySpeak supplies the local reference pattern: `native/tauri.conf.json` declares `create:false`, and `native/src/application/startup.rs` registers application state before opening the main WebView. Its domain runtime is Rust, with a separately hosted Python server. This crate adds the owned local Python process needed by SDK consumers; it does not copy SkellySpeak's product runtime. [@skellyspeakStartup2026]

## Prepare the backend

In the application's isolated Python environment install `freemocap-sdk-server[bundle]`. The entry script directly imports the application's factory:

```python
from freemocap_sdk.desktop import run_desktop_server
from your_application import build_app

if __name__ == '__main__':
    run_desktop_server(build_app(), port=0)
```

Run the SDK packaging command with ignored output/scratch directories:

```text
python -m freemocap_sdk.bundle --entrypoint desktop_entry.py --name application-backend --output <backend-dist> --work <build-scratch>
```

The output is `<backend-dist>/application-backend/`, containing the executable and its runtime dependencies. PyInstaller's one-folder distribution includes the interpreter; the end user does not install Python. Builds target the OS and architecture used to build them. Console mode preserves the control pipes; the Rust launcher hides the console on Windows. [@pyinstallerModes2026]

Include that **whole directory** in Tauri `bundle.resources`, mapping it to `backend/`. Resolve it through `app.path().resource_dir()`, not the current working directory. A resource mapping preserves the runtime directory structure. We use this instead of the single-binary `externalBin` option. [@tauriResources2026; @tauriSidecar2026]

## Native integration

Add `freemocap-desktop` as a Cargo path dependency during local development. In Tauri setup:

```rust,ignore
let executable = app.path().resource_dir()?.join("backend/application-backend.exe");
let backend = freemocap_desktop::BackendProcess::spawn(
    executable, &[], std::time::Duration::from_secs(30),
)?;
let backend_url = backend.base_url().to_owned();
app.manage(std::sync::Mutex::new(backend));
// Register/read backend_url through an application Tauri command.
// Open the configured main window only after this state exists.
```

On application exit, lock the managed process and call `shutdown()`. Drop is also a cleanup backstop. The supervisor validates the ready message's loopback endpoint and direct child PID; launch the frozen executable directly, not a shell or virtualenv launcher. Startup failure closes stdin and reaps the child. Shutdown sends the SDK control command, closes stdin, waits up to eight seconds, and kills only the owned child if it fails to exit. The backend stops gracefully on parent pipe closure as well.

The application must allow its Tauri WebView origin in backend CORS/WebSocket configuration and permit its loopback HTTP, WebSocket, media and worker connections in CSP. The WebView obtains the endpoint from the native command and uses the existing SDK HTTP/WS interfaces. This crate does not replace transport with native commands.

## Verification

`cargo test --locked` checks native process readiness, identity rejection and shutdown. Python package desktop tests check real HTTP readiness, lifespan cleanup and port release on explicit shutdown and parent EOF. The consumer must additionally verify the complete built native application and distribution; a passing browser harness does not establish desktop acceptance. Windows is the initial validation target; signing and other platforms require separate validation.
