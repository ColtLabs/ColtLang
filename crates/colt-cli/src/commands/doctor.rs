use crate::args::CliOptions;
use crate::exit_code::ExitCode;
use crate::execution::http;
use std::env;

/// Redacts sensitive credentials (user, password, token) from connection URLs.
fn redact_url(url_str: &str) -> String {
    if let Some(at_idx) = url_str.find('@') {
        if let Some(proto_end) = url_str.find("://") {
            let proto = &url_str[..proto_end + 3];
            let after_at = &url_str[at_idx + 1..];
            return format!("{}***:***@{}", proto, after_at);
        }
    }
    if url_str.len() > 12 {
        format!("{}...{}", &url_str[..6], &url_str[url_str.len() - 4..])
    } else {
        "***".to_string()
    }
}

pub fn run_doctor(options: &CliOptions) -> i32 {
    let colt_version = "0.2.0";
    let os = env::consts::OS;
    let arch = env::consts::ARCH;
    let exe_path = env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "colt".to_string());

    let db_url = env::var("DATABASE_URL").ok();
    let redis_url = env::var("REDIS_URL").ok();
    let mongo_url = env::var("MONGODB_URL").ok();
    let coltane_url = env::var("COLTANE_URL").unwrap_or_else(|_| "http://127.0.0.1:3000".to_string());

    // Probe ColtaneDB status
    let ping_endpoint = format!("{}/api/capabilities", coltane_url.trim_end_matches('/'));
    let runtime_reachable = match http::post_json(&ping_endpoint, "{}", None) {
        Ok(res) => res.status == 200,
        Err(_) => false,
    };

    if options.json {
        let json_report = serde_json::json!({
            "product": "ColtLang",
            "version": colt_version,
            "platform": format!("{}-{}", os, arch),
            "executable": exe_path,
            "environment": {
                "databaseConfigured": db_url.is_some(),
                "databaseUrlRedacted": db_url.as_ref().map(|u| redact_url(u)),
                "redisConfigured": redis_url.is_some(),
                "redisUrlRedacted": redis_url.as_ref().map(|u| redact_url(u)),
                "mongoConfigured": mongo_url.is_some(),
                "coltaneUrl": coltane_url,
            },
            "runtime": {
                "coltaneConnected": runtime_reachable,
                "status": if runtime_reachable { "healthy" } else { "offline" }
            }
        });
        println!("{}", serde_json::to_string_pretty(&json_report).unwrap_or_default());
        return ExitCode::SUCCESS;
    }

    println!("\x1b[38;2;224;122;95m╔═ Colt Doctor Diagnostic Report ══════════════════════════════════════════════╗\x1b[0m");
    println!(
        "\x1b[38;2;224;122;95m║\x1b[0m Toolchain: \x1b[1mcolt v{}\x1b[0m ({}-{})",
        colt_version, os, arch
    );
    println!("\x1b[38;2;224;122;95m║\x1b[0m Executable: \x1b[90m{}\x1b[0m", exe_path);
    println!("\x1b[38;2;224;122;95m╟──────────────────────────────────────────────────────────────────────────────╢\x1b[0m");

    println!("\x1b[38;2;224;122;95m║\x1b[0m \x1b[1mEnvironment Configuration (Secrets Redacted):\x1b[0m");
    if let Some(ref db) = db_url {
        println!("  \x1b[32m✔\x1b[0m DATABASE_URL: {}", redact_url(db));
    } else {
        println!("  \x1b[33m⚠\x1b[0m DATABASE_URL: not set (add to .colt.env or shell)");
    }

    if let Some(ref r) = redis_url {
        println!("  \x1b[32m✔\x1b[0m REDIS_URL:    {}", redact_url(r));
    } else {
        println!("  \x1b[90m○\x1b[0m REDIS_URL:    not set (optional KV cache)");
    }

    if let Some(ref m) = mongo_url {
        println!("  \x1b[32m✔\x1b[0m MONGODB_URL:  {}", redact_url(m));
    } else {
        println!("  \x1b[90m○\x1b[0m MONGODB_URL:  not set (optional doc store)");
    }

    println!("\x1b[38;2;224;122;95m╟──────────────────────────────────────────────────────────────────────────────╢\x1b[0m");
    println!("\x1b[38;2;224;122;95m║\x1b[0m \x1b[1mRuntime Service Status:\x1b[0m");
    println!("  Target Endpoint: {}", coltane_url);
    if runtime_reachable {
        println!("  \x1b[32m✔\x1b[0m ColtaneDB Engine: \x1b[32mONLINE\x1b[0m (Live execution ready)");
    } else {
        println!("  \x1b[33m⚠\x1b[0m ColtaneDB Engine: \x1b[33mOFFLINE\x1b[0m");
        println!("    \x1b[90mHint: Run 'pnpm dev' in ColtaneDB to enable live execution,\x1b[0m");
        println!("    \x1b[90mor use 'colt run <file> --dry-run' for offline execution planning.\x1b[0m");
    }

    println!("\x1b[38;2;224;122;95m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m");

    ExitCode::SUCCESS
}
