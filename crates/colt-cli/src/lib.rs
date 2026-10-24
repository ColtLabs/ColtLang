pub mod args;
pub mod commands;
pub mod diagnostics;
pub mod execution;
pub mod exit_code;
pub mod source;
pub mod tui;
pub mod usage;

use args::{parse_args, CommandName};
use exit_code::ExitCode;
use source::read_source;
use usage::{help_text, version_text};

pub fn run<I, T>(args: I) -> i32
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let options = match parse_args(args) {
        Ok(opts) => opts,
        Err(err) => {
            eprintln!("{}\n\n{}", err.0, help_text());
            return ExitCode::USAGE_ERROR;
        }
    };

    if options.command == CommandName::Interactive {
        return tui::start_tui();
    }

    if options.command == CommandName::Help {
        print!("{}", help_text());
        return ExitCode::SUCCESS;
    }

    if options.command == CommandName::Version {
        if options.json {
            let out = serde_json::json!({
                "name": "colt",
                "version": "0.2.0",
                "protocolVersion": "1",
                "capabilities": [
                    "run",
                    "check",
                    "plan",
                    "parse",
                    "lex",
                    "doctor",
                    "fmt",
                    "capabilities"
                ]
            });
            println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        } else {
            print!("{}", version_text());
        }
        return ExitCode::SUCCESS;
    }

    if options.command == CommandName::Capabilities {
        return commands::capabilities::run_capabilities(&options);
    }

    if options.command == CommandName::Doctor {
        return commands::doctor::run_doctor(&options);
    }

    let source = match read_source(options.file.as_deref(), options.stdin) {
        Ok(src) => src,
        Err(err) => {
            eprintln!("{}", err.0);
            return ExitCode::USAGE_ERROR;
        }
    };

    match options.command {
        CommandName::Run => commands::run::run_run(&source, &options),
        CommandName::Check => commands::check::run_check(&source, &options),
        CommandName::Plan => commands::plan::run_plan(&source, &options),
        CommandName::Parse => commands::parse::run_parse(&source, &options),
        CommandName::Lex => commands::lex::run_lex(&source, &options),
        CommandName::Fmt => commands::fmt::run_fmt(&source, &options),
        _ => ExitCode::SUCCESS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_version() {
        assert_eq!(version_text(), "colt 0.2.0\n");
    }

    #[test]
    fn test_cli_help() {
        let help = help_text();
        assert!(help.contains("colt — the ColtLang compiler command line interface."));
        assert!(help.contains("colt 0.2.0"));
    }

    #[test]
    fn test_cli_check_library() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/library.colt");
        let code = run(["check", path]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_plan_library() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/library.colt");
        let code = run(["plan", path]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_run_dry_run_library() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/library.colt");
        let code = run(["run", path, "--dry-run"]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_run_dry_run_json() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../examples/library.colt");
        let code = run(["run", path, "--dry-run", "--json"]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_doctor() {
        let code = run(["doctor"]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_doctor_json() {
        let code = run(["doctor", "--json"]);
        assert_eq!(code, ExitCode::SUCCESS);
    }

    #[test]
    fn test_cli_capabilities() {
        let code = run(["capabilities"]);
        assert_eq!(code, ExitCode::SUCCESS);
    }
}
