use freemocap_desktop::BackendProcess;
use std::io::{self, BufRead, Write};
use std::process::Command;
use std::time::Duration;

#[test]
fn child_fixture() {
    let Ok(mode) = std::env::var("FREEMOCAP_DESKTOP_FIXTURE") else {
        return;
    };
    if mode == "early_exit" {
        std::process::exit(2);
    }
    let pid = if mode == "wrong_pid" {
        0
    } else {
        std::process::id()
    };
    if mode != "no_ready" {
        println!(
            "{{\"event\":\"freemocap_ready\",\"url\":\"http://127.0.0.1:9876\",\"pid\":{pid}}}"
        );
    }
    io::stdout().flush().unwrap();
    for line in io::stdin().lock().lines() {
        if line.unwrap().contains("shutdown") {
            std::process::exit(0);
        }
    }
    std::process::exit(0);
}

fn command(mode: &str) -> Command {
    let mut command = Command::new(std::env::current_exe().unwrap());
    command.args(["--exact", "child_fixture", "--nocapture"]);
    command.env("FREEMOCAP_DESKTOP_FIXTURE", mode);
    command
}

#[test]
fn readiness_and_graceful_shutdown() {
    let mut process =
        BackendProcess::spawn_command(command("ready"), Duration::from_secs(5)).unwrap();
    assert_eq!(process.base_url(), "http://127.0.0.1:9876");
    assert!(process.shutdown().unwrap().success());
    assert!(process.shutdown().unwrap().success());
}

#[test]
fn rejects_other_process_identity_and_early_exit() {
    assert!(BackendProcess::spawn_command(command("wrong_pid"), Duration::from_secs(5)).is_err());
    assert!(BackendProcess::spawn_command(command("early_exit"), Duration::from_secs(5)).is_err());
}

#[test]
fn startup_timeout_still_shuts_down_owned_process() {
    let started = std::time::Instant::now();
    assert!(
        BackendProcess::spawn_command(command("no_ready"), Duration::from_millis(100)).is_err()
    );
    assert!(started.elapsed() < Duration::from_secs(3));
}
