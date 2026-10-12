use crate::args::CliOptions;
use crate::diagnostics::{format_diagnostics, format_diagnostics_as_json};
use crate::exit_code::ExitCode;
use crate::source::SourceUnit;
use colt_compiler::compile;
use serde_json::json;

pub fn run_check(source: &SourceUnit, options: &CliOptions) -> i32 {
    let result = compile(&source.text, None, None);
    if !result.diagnostics.is_empty() {
        if options.json {
            print!("{}", format_diagnostics_as_json(&result.diagnostics, &source.name));
        } else {
            eprint!("{}", format_diagnostics(&result.diagnostics, &source.name));
        }
        return ExitCode::DIAGNOSTICS;
    }

    let steps_count = result.plan.as_ref().map(|p| p.steps.len()).unwrap_or(0);
    if options.json {
        let out = json!({
            "source": source.name,
            "status": "ok",
            "diagnostics": [],
            "steps": steps_count
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    } else if !options.quiet {
        println!("{}: ok ({} planned steps)", source.name, steps_count);
    }

    ExitCode::SUCCESS
}
