use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::process::Command;
use std::time::Duration;

#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Dispatches an HTTP POST request with a JSON payload to the specified URL.
/// Uses a direct, zero-dependency TCP stream for HTTP endpoints, with graceful
/// fallback to system curl for HTTPS or complex network configurations.
pub fn post_json(url_str: &str, json_payload: &str, auth_token: Option<&str>) -> Result<HttpResponse, String> {
    if url_str.starts_with("https://") {
        return post_https_curl(url_str, json_payload, auth_token);
    }

    if url_str.starts_with("http://") {
        return post_http_tcp(url_str, json_payload, auth_token);
    }

    Err(format!("Unsupported protocol in URL '{}'. Expected http:// or https://", url_str))
}

fn post_http_tcp(url_str: &str, json_payload: &str, auth_token: Option<&str>) -> Result<HttpResponse, String> {
    let without_scheme = url_str.trim_start_matches("http://");
    let (host_port, path) = match without_scheme.find('/') {
        Some(idx) => (&without_scheme[..idx], &without_scheme[idx..]),
        None => (without_scheme, "/"),
    };

    let (host, port) = if let Some(idx) = host_port.find(':') {
        let h = &host_port[..idx];
        let p: u16 = host_port[idx + 1..].parse().map_err(|e| format!("Invalid port in '{}': {}", host_port, e))?;
        (h, p)
    } else {
        (host_port, 80)
    };

    let socket_addr = format!("{}:{}", host, port)
        .to_socket_addrs()
        .map_err(|e| format!("Cannot resolve host '{}:{}': {}", host, port, e))?
        .next()
        .ok_or_else(|| format!("Could not resolve socket address for '{}:{}'", host, port))?;

    let timeout = Duration::from_secs(5);
    let mut stream = TcpStream::connect_timeout(&socket_addr, timeout)
        .map_err(|e| format!("Cannot connect to ColtaneDB at '{}:{}': {}", host, port, e))?;

    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    let mut request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
        path,
        host,
        json_payload.len()
    );

    if let Some(token) = auth_token {
        request.push_str(&format!("Authorization: Bearer {}\r\n", token));
    }
    request.push_str("\r\n");
    request.push_str(json_payload);

    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("Failed to send query to ColtaneDB: {}", e))?;

    let mut response_bytes = Vec::new();
    stream
        .read_to_end(&mut response_bytes)
        .map_err(|e| format!("Failed to read response from ColtaneDB: {}", e))?;

    let response_str = String::from_utf8_lossy(&response_bytes);
    let mut parts = response_str.splitn(2, "\r\n\r\n");
    let header_part = parts.next().unwrap_or("");
    let body_part = parts.next().unwrap_or("").to_string();

    let status = header_part
        .lines()
        .next()
        .and_then(|line| {
            let mut words = line.split_whitespace();
            words.next(); // skip HTTP/1.1
            words.next().and_then(|s| s.parse::<u16>().ok())
        })
        .unwrap_or(500);

    Ok(HttpResponse {
        status,
        body: body_part,
    })
}

fn post_https_curl(url_str: &str, json_payload: &str, auth_token: Option<&str>) -> Result<HttpResponse, String> {
    let mut cmd = Command::new("curl");
    cmd.arg("-s").arg("-i").arg("-X").arg("POST");
    cmd.arg("-H").arg("Content-Type: application/json");
    if let Some(token) = auth_token {
        cmd.arg("-H").arg(format!("Authorization: Bearer {}", token));
    }
    cmd.arg("--data-raw").arg(json_payload);
    cmd.arg(url_str);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to invoke system curl for HTTPS connection: {}", e))?;

    if !output.status.success() && output.stdout.is_empty() {
        return Err(format!(
            "HTTPS request failed via curl: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let response_str = String::from_utf8_lossy(&output.stdout);
    let mut parts = response_str.splitn(2, "\r\n\r\n");
    let header_part = parts.next().unwrap_or("");
    let body_part = parts.next().unwrap_or("").to_string();

    let status = header_part
        .lines()
        .next()
        .and_then(|line| {
            let mut words = line.split_whitespace();
            words.next();
            words.next().and_then(|s| s.parse::<u16>().ok())
        })
        .unwrap_or(200);

    Ok(HttpResponse {
        status,
        body: body_part,
    })
}
