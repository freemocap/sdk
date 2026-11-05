//! Own a backend sidecar from Tauri setup through application exit.
//! Packaging preserves a frozen backend directory in Tauri resources [@tauriResources2026].
use serde::Deserialize;
use std::ffi::OsStr;
use std::io::{self, BufRead, BufReader, Write};
use std::net::SocketAddr;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Deserialize)]
struct Ready {
    event: String,
    url: String,
    pid: u32,
}

pub struct BackendProcess {
    child: Child,
    base_url: String,
}

impl BackendProcess {
    pub fn spawn(
        executable: impl AsRef<OsStr>,
        args: &[String],
        timeout: Duration,
    ) -> io::Result<Self> {
        let mut command = Command::new(executable);
        command.args(args);
        Self::spawn_command(command, timeout)
    }

    pub fn spawn_command(mut command: Command, timeout: Duration) -> io::Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW: sidecar console stays hidden.
        }
        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("Missing backend stdout"))?;
        // A GUI application may have no stderr handle. Give Python a real pipe
        // and drain it so logging works without a console or a full pipe stall.
        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let _ = writeln!(io::stderr(), "{line}");
                }
            });
        }
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => {
                        if let Ok(ready) = serde_json::from_str::<Ready>(&line) {
                            if ready.event == "freemocap_ready" {
                                let _ = sender.send(ready);
                            }
                        } else {
                            let _ = writeln!(io::stderr(), "{line}");
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        let mut process = Self {
            child,
            base_url: String::new(),
        };
        let ready = receiver
            .recv_timeout(timeout)
            .map_err(|error| io::Error::other(format!("Backend did not become ready: {error}")))?;
        let address = ready
            .url
            .strip_prefix("http://")
            .and_then(|value| value.parse::<SocketAddr>().ok())
            .filter(|address| address.ip().is_loopback() && address.port() != 0)
            .ok_or_else(|| {
                io::Error::other("Backend readiness did not declare a loopback HTTP address")
            })?;
        if ready.pid != process.child.id() {
            return Err(io::Error::other(
                "Backend readiness process identity does not match owned child",
            ));
        }
        process.base_url = format!("http://{address}");
        Ok(process)
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }
    pub fn id(&self) -> u32 {
        self.child.id()
    }

    /// Ask the owned process to stop, close its stdin, and reap it; kill only this child on timeout.
    pub fn shutdown(&mut self) -> io::Result<ExitStatus> {
        if let Some(status) = self.child.try_wait()? {
            return Ok(status);
        }
        if let Some(mut stdin) = self.child.stdin.take() {
            let _ = stdin.write_all(b"{\"command\":\"shutdown\"}\n");
            let _ = stdin.flush();
        }
        let deadline = Instant::now() + Duration::from_secs(8);
        loop {
            if let Some(status) = self.child.try_wait()? {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                self.child.kill()?;
                return self.child.wait();
            }
            thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}
