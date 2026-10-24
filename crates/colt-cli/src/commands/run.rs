use crate::args::CliOptions;
use crate::diagnostics::{format_diagnostics, format_diagnostics_as_json};
use crate::exit_code::ExitCode;
use crate::source::SourceUnit;
use crate::execution::{execute_dry_run, execute_live, render};
use colt_compiler::compile;

pub fn run_run(source: &SourceUnit, options: &CliOptions) -> i32 {
    let result = compile(&source.text, None, None);

    if !result.diagnostics.is_empty() {
        if options.json {
            print!("{}", format_diagnostics_as_json(&result.diagnostics, &source.name));
        } else {
            eprint!("{}", format_diagnostics(&result.diagnostics, &source.name));
        }
        return ExitCode::DIAGNOSTICS;
    }

    let plan = match result.plan {
        Some(p) => p,
        None => {
            eprintln!("Error: Compiler succeeded but generated no execution plan.");
            return ExitCode::DIAGNOSTICS;
        }
    };

    if options.dry_run {
        let preview = execute_dry_run(&source.name, &plan);
        if options.json {
            println!("{}", serde_json::to_string_pretty(&preview).unwrap_or_default());
        } else {
            render::render_dry_run_preview(&preview, options.verbose);
        }
        return ExitCode::SUCCESS;
    }

    // Live Execution against verified runtime
    match execute_live(&source.name, &source.text, &plan) {
        Ok(report) => {
            if options.json {
                println!("{}", serde_json::to_string_pretty(&report).unwrap_or_default());
            } else if !options.quiet {
                render::render_execution_report(&report, options.verbose);
            }
            ExitCode::SUCCESS
        }
        Err(err_report) => {
            if options.json {
                println!("{}", serde_json::to_string_pretty(&err_report).unwrap_or_default());
            } else {
                render::render_execution_report(&err_report, options.verbose);
            }
            ExitCode::USAGE_ERROR
        }
    }
}
