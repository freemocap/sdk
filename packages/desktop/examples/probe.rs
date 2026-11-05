//! Run a frozen backend and verify its HTTP listener and graceful process cleanup.
use freemocap_desktop::BackendProcess;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let executable = args.first().ok_or("Expected executable path")?;
    let mut backend = BackendProcess::spawn(executable, &args[1..], Duration::from_secs(30))?;
    let address = backend
        .base_url()
        .strip_prefix("http://")
        .unwrap()
        .to_owned();
    let mut stream = TcpStream::connect(&address)?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.write_all(b"GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    if !response.starts_with("HTTP/1.1 200") {
        return Err(response.into());
    }
    let status = backend.shutdown()?;
    if !status.success() {
        return Err(format!("Backend exit: {status}").into());
    }
    if TcpStream::connect(&address).is_ok() {
        return Err("Backend listener remained open".into());
    }
    println!(
        "Frozen backend HTTP readiness, owned PID, graceful shutdown and port release verified"
    );
    Ok(())
}
