use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeMode {
    Dark,
    Copper,
    Light,
    Mono,
}

pub struct Theme {
    pub mode: ThemeMode,
    pub border: &'static str,
    pub accent: &'static str,
    pub accent_alt: &'static str,
    pub text: &'static str,
    pub muted: &'static str,
    pub success: &'static str,
    pub warning: &'static str,
    pub error: &'static str,
    pub reset: &'static str,
}

impl Theme {
    pub fn new(mode: ThemeMode) -> Self {
        let no_color = env::var("NO_COLOR").is_ok() || env::var("TERM").map(|t| t == "dumb").unwrap_or(false);
        if no_color || mode == ThemeMode::Mono {
            return Self {
                mode: ThemeMode::Mono,
                border: "",
                accent: "",
                accent_alt: "",
                text: "",
                muted: "",
                success: "",
                warning: "",
                error: "",
                reset: "",
            };
        }

        match mode {
            ThemeMode::Dark => Self {
                mode,
                border: "\x1b[38;2;60;64;72m",
                accent: "\x1b[38;2;224;122;95m",     // Colt Copper #E07A5F
                accent_alt: "\x1b[38;2;221;161;94m", // Amber #DDA15E
                text: "\x1b[38;2;244;241;222m",       // Cream white
                muted: "\x1b[38;2;141;153;174m",      // Slate gray
                success: "\x1b[38;2;129;178;154m",    // Sage green
                warning: "\x1b[38;2;244;162;97m",     // Sandy gold
                error: "\x1b[38;2;230;57;70m",        // Crisp red
                reset: "\x1b[0m",
            },
            ThemeMode::Copper => Self {
                mode,
                border: "\x1b[38;2;180;100;70m",
                accent: "\x1b[38;2;235;130;90m",
                accent_alt: "\x1b[38;2;245;180;110m",
                text: "\x1b[38;2;255;245;235m",
                muted: "\x1b[38;2;180;160;150m",
                success: "\x1b[38;2;140;190;160m",
                warning: "\x1b[38;2;250;180;100m",
                error: "\x1b[38;2;240;70;80m",
                reset: "\x1b[0m",
            },
            ThemeMode::Light => Self {
                mode,
                border: "\x1b[38;2;180;185;195m",
                accent: "\x1b[38;2;190;80;50m",
                accent_alt: "\x1b[38;2;180;120;60m",
                text: "\x1b[38;2;25;30;40m",
                muted: "\x1b[38;2;110;115;125m",
                success: "\x1b[38;2;40;140;90m",
                warning: "\x1b[38;2;190;110;20m",
                error: "\x1b[38;2;200;40;50m",
                reset: "\x1b[0m",
            },
            ThemeMode::Mono => unreachable!(),
        }
    }
}

pub fn is_interactive_terminal() -> bool {
    #[cfg(windows)]
    {
        enable_windows_vt();
    }

    use std::io::IsTerminal;
    std::io::stdin().is_terminal() && std::io::stdout().is_terminal()
}

#[cfg(windows)]
fn enable_windows_vt() {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetStdHandle(nStdHandle: u32) -> *mut std::ffi::c_void;
        fn GetConsoleMode(hConsoleHandle: *mut std::ffi::c_void, lpMode: *mut u32) -> i32;
        fn SetConsoleMode(hConsoleHandle: *mut std::ffi::c_void, dwMode: u32) -> i32;
    }
    const STD_OUTPUT_HANDLE: u32 = 0xFFFFFFF5;
    const ENABLE_VIRTUAL_TERMINAL_PROCESSING: u32 = 0x0004;

    unsafe {
        let handle = GetStdHandle(STD_OUTPUT_HANDLE);
        let mut mode: u32 = 0;
        if GetConsoleMode(handle, &mut mode) != 0 {
            SetConsoleMode(handle, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
        }
    }
}

pub fn start_tui() -> i32 {
    let mut theme = Theme::new(ThemeMode::Dark);
    let mut history: Vec<String> = Vec::new();

    print_welcome_screen(&theme);

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    loop {
        print!("{}colt{} {}❯{} ", theme.accent, theme.reset, theme.accent_alt, theme.reset);
        stdout.flush().ok();

        let mut line = String::new();
        if stdin.lock().read_line(&mut line).is_err() {
            break;
        }

        let input = line.trim();
        if input.is_empty() {
            continue;
        }

        history.push(input.to_string());

        let parts: Vec<&str> = input.split_whitespace().collect();
        let cmd = parts[0].to_lowercase();

        match cmd.as_str() {
            "/exit" | "exit" | "/quit" | "quit" => {
                println!("{}Exiting Colt terminal. Goodbye!{}", theme.muted, theme.reset);
                break;
            }
            "/clear" | "clear" => {
                print!("\x1b[2J\x1b[H");
                print_welcome_screen(&theme);
            }
            "/help" | "help" | "/commands" => {
                print_tui_help(&theme);
            }
            "/version" | "version" => {
                println!("{}ColtLang Toolchain v0.2.0{}", theme.accent, theme.reset);
                println!("{}Native Rust CLI & Execution Runtime{}", theme.muted, theme.reset);
            }
            "/doctor" | "doctor" => {
                let opts = crate::args::CliOptions {
                    command: crate::args::CommandName::Doctor,
                    file: None,
                    json: false,
                    stdin: false,
                    quiet: false,
                    check: false,
                    dry_run: false,
                    verbose: false,
                };
                crate::commands::doctor::run_doctor(&opts);
            }
            "/capabilities" | "capabilities" => {
                let opts = crate::args::CliOptions {
                    command: crate::args::CommandName::Capabilities,
                    file: None,
                    json: false,
                    stdin: false,
                    quiet: false,
                    check: false,
                    dry_run: false,
                    verbose: false,
                };
                crate::commands::capabilities::run_capabilities(&opts);
            }
            "/history" | "history" => {
                println!("{}Command History ({} commands):{}", theme.accent_alt, history.len(), theme.reset);
                for (i, h) in history.iter().enumerate() {
                    println!("  {:3}. {}", i + 1, h);
                }
            }
            "/theme" | "theme" => {
                if parts.len() > 1 {
                    match parts[1].to_lowercase().as_str() {
                        "dark" => theme = Theme::new(ThemeMode::Dark),
                        "copper" => theme = Theme::new(ThemeMode::Copper),
                        "light" => theme = Theme::new(ThemeMode::Light),
                        "mono" => theme = Theme::new(ThemeMode::Mono),
                        _ => println!("{}Unknown theme. Choose: dark, copper, light, mono{}", theme.warning, theme.reset),
                    }
                    println!("{}Theme updated to {:?}{}", theme.success, theme.mode, theme.reset);
                } else {
                    println!("Current theme: {:?}. Available: dark, copper, light, mono", theme.mode);
                }
            }
            "/run" | "run" => {
                if parts.len() < 2 {
                    println!("{}Usage: /run <file.colt> [--dry-run] [--verbose]{}", theme.warning, theme.reset);
                    print_available_colt_files(&theme);
                } else {
                    let file = parts[1];
                    let dry_run = parts.iter().any(|&p| p == "--dry-run");
                    let verbose = parts.iter().any(|&p| p == "--verbose");
                    let opts = crate::args::CliOptions {
                        command: crate::args::CommandName::Run,
                        file: Some(file.to_string()),
                        json: false,
                        stdin: false,
                        quiet: false,
                        check: false,
                        dry_run,
                        verbose,
                    };
                    if let Ok(src) = crate::source::read_source(Some(file), false) {
                        crate::commands::run::run_run(&src, &opts);
                    } else {
                        eprintln!("{}Cannot read source file: {}{}", theme.error, file, theme.reset);
                    }
                }
            }
            "/check" | "check" => {
                if parts.len() < 2 {
                    println!("{}Usage: /check <file.colt>{}", theme.warning, theme.reset);
                    print_available_colt_files(&theme);
                } else {
                    let file = parts[1];
                    let opts = crate::args::CliOptions {
                        command: crate::args::CommandName::Check,
                        file: Some(file.to_string()),
                        json: false,
                        stdin: false,
                        quiet: false,
                        check: false,
                        dry_run: false,
                        verbose: false,
                    };
                    if let Ok(src) = crate::source::read_source(Some(file), false) {
                        crate::commands::check::run_check(&src, &opts);
                    } else {
                        eprintln!("{}Cannot read source file: {}{}", theme.error, file, theme.reset);
                    }
                }
            }
            "/plan" | "plan" => {
                if parts.len() < 2 {
                    println!("{}Usage: /plan <file.colt>{}", theme.warning, theme.reset);
                    print_available_colt_files(&theme);
                } else {
                    let file = parts[1];
                    let opts = crate::args::CliOptions {
                        command: crate::args::CommandName::Plan,
                        file: Some(file.to_string()),
                        json: false,
                        stdin: false,
                        quiet: false,
                        check: false,
                        dry_run: false,
                        verbose: false,
                    };
                    if let Ok(src) = crate::source::read_source(Some(file), false) {
                        crate::commands::plan::run_plan(&src, &opts);
                    } else {
                        eprintln!("{}Cannot read source file: {}{}", theme.error, file, theme.reset);
                    }
                }
            }
            "/fmt" | "fmt" => {
                if parts.len() < 2 {
                    println!("{}Usage: /fmt <file.colt>{}", theme.warning, theme.reset);
                    print_available_colt_files(&theme);
                } else {
                    let file = parts[1];
                    let opts = crate::args::CliOptions {
                        command: crate::args::CommandName::Fmt,
                        file: Some(file.to_string()),
                        json: false,
                        stdin: false,
                        quiet: false,
                        check: false,
                        dry_run: false,
                        verbose: false,
                    };
                    if let Ok(src) = crate::source::read_source(Some(file), false) {
                        crate::commands::fmt::run_fmt(&src, &opts);
                    } else {
                        eprintln!("{}Cannot read source file: {}{}", theme.error, file, theme.reset);
                    }
                }
            }
            other => {
                // If user typed a .colt file path directly, default to running it!
                if other.ends_with(".colt") && Path::new(other).exists() {
                    let opts = crate::args::CliOptions {
                        command: crate::args::CommandName::Run,
                        file: Some(other.to_string()),
                        json: false,
                        stdin: false,
                        quiet: false,
                        check: false,
                        dry_run: false,
                        verbose: false,
                    };
                    if let Ok(src) = crate::source::read_source(Some(other), false) {
                        crate::commands::run::run_run(&src, &opts);
                    }
                } else {
                    println!(
                        "{}Unknown command '{}'. Type /help for discoverable commands.{}",
                        theme.warning, other, theme.reset
                    );
                }
            }
        }
    }

    0
}

fn print_welcome_screen(theme: &Theme) {
    let cwd = env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| ".".to_string());

    println!("{}╔══════════════════════════════════════════════════════════════════════════════╗{}", theme.accent, theme.reset);
    println!(
        "{}║{}   {}▄████████  ▄██████▄   ▄█    ███  {}            ColtLang Toolchain v0.2.0    {}║{}",
        theme.accent, theme.reset, theme.accent, theme.reset, theme.accent, theme.reset
    );
    println!(
        "{}║{}   {}███    ███ ███    ███ ███    ███  {}            Declarative Multi-Paradigm   {}║{}",
        theme.accent, theme.reset, theme.accent, theme.reset, theme.accent, theme.reset
    );
    println!(
        "{}║{}   {}███    █▀  ███    ███ ███    ███  {}            Unified Database Language    {}║{}",
        theme.accent, theme.reset, theme.accent, theme.reset, theme.accent, theme.reset
    );
    println!(
        "{}║{}   {}███        ███    ███ ███    ███  {}            [High Performance Native]    {}║{}",
        theme.accent, theme.reset, theme.accent, theme.reset, theme.accent, theme.reset
    );
    println!("{}╟──────────────────────────────────────────────────────────────────────────────╢{}", theme.accent, theme.reset);
    println!("{}║{} Working Directory: {}{:<56}{}║{}", theme.accent, theme.reset, theme.text, cwd, theme.reset, theme.accent);
    println!("{}║{} Quick Actions:                                                            {}║{}", theme.accent, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /run <file.colt>{}       Execute file against live backend or --dry-run  {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /check <file.colt>{}     Validate syntax, types, and capability gates    {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /plan <file.colt>{}      Inspect parameterized execution plan JSON       {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /doctor{}                Diagnostic health check of toolchain & backend  {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /capabilities{}          View Tier-1 database capability matrix          {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /theme <name>{}          Switch theme: dark, copper, light, mono         {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}║{}   {}• /help /exit{}            Show help reference or exit terminal            {}║{}", theme.accent, theme.reset, theme.accent_alt, theme.reset, theme.accent, theme.reset);
    println!("{}╚══════════════════════════════════════════════════════════════════════════════╝{}", theme.accent, theme.reset);
    println!();
}

fn print_tui_help(theme: &Theme) {
    println!("{}Colt Interactive Terminal Commands:{}", theme.accent, theme.reset);
    println!("  {}/run <file> [--dry-run]{}   Execute a .colt program live or preview offline", theme.accent_alt, theme.reset);
    println!("  {}/check <file>{}             Compile and report diagnostics (0 = valid, 1 = errors)", theme.accent_alt, theme.reset);
    println!("  {}/plan <file>{}              Generate backend-neutral execution plan", theme.accent_alt, theme.reset);
    println!("  {}/fmt <file>{}               Format Colt source code consistently", theme.accent_alt, theme.reset);
    println!("  {}/doctor{}                   Inspect environment, toolchain, and runtime status", theme.accent_alt, theme.reset);
    println!("  {}/capabilities{}             Display PostgreSQL Tier-1 supported feature matrix", theme.accent_alt, theme.reset);
    println!("  {}/theme <name>{}             Change palette (dark, copper, light, mono)", theme.accent_alt, theme.reset);
    println!("  {}/history{}                  Display session command history", theme.accent_alt, theme.reset);
    println!("  {}/clear{}                    Clear terminal screen", theme.accent_alt, theme.reset);
    println!("  {}/version{}                  Display Colt toolchain version", theme.accent_alt, theme.reset);
    println!("  {}/exit, exit, quit{}         Close the interactive terminal session", theme.accent_alt, theme.reset);
}

fn print_available_colt_files(theme: &Theme) {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(".") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "colt").unwrap_or(false) {
                files.push(path.display().to_string());
            }
        }
    }
    if let Ok(entries) = fs::read_dir("examples") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "colt").unwrap_or(false) {
                files.push(path.display().to_string());
            }
        }
    }

    if !files.is_empty() {
        println!("{}Available .colt files:{}", theme.muted, theme.reset);
        for f in files {
            println!("  • {}", f);
        }
    }
}
