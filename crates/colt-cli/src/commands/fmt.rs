use crate::args::CliOptions;
use crate::diagnostics::{format_diagnostics, format_diagnostics_as_json};
use crate::exit_code::ExitCode;
use crate::source::SourceUnit;
use colt_fmt::format_source;
use serde_json::json;
use std::fs;

pub fn run_fmt(source: &SourceUnit, options: &CliOptions) -> i32 {
    let formatted = match format_source(&source.text) {
        Ok(s) => s,
        Err(diags) => {
            if options.json {
                print!("{}", format_diagnostics_as_json(&diags, &source.name));
            } else {
                eprint!("{}", format_diagnostics(&diags, &source.name));
            }
            return ExitCode::DIAGNOSTICS;
        }
    };

    if options.check {
        let is_formatted = formatted == source.text;
        if options.json {
            let out = json!({
                "source": source.name,
                "formatted": is_formatted,
            });
            println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
            return if is_formatted { ExitCode::SUCCESS } else { ExitCode::DIAGNOSTICS };
        }
        if !is_formatted {
            eprintln!("{}: unformatted", source.name);
            return ExitCode::DIAGNOSTICS;
        }
        return ExitCode::SUCCESS;
    }

    if options.json {
        let is_changed = formatted != source.text;
        let out = json!({
            "source": source.name,
            "formatted": formatted,
            "changed": is_changed,
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return ExitCode::SUCCESS;
    }

    if source.name == "<stdin>" {
        print!("{}", formatted);
    } else if let Err(e) = fs::write(&source.name, &formatted) {
        eprintln!("Could not write {}: {}", source.name, e);
        return ExitCode::USAGE_ERROR;
    }

    ExitCode::SUCCESS
}

