use crate::args::CliOptions;
use crate::diagnostics::{format_diagnostic_as_json, format_diagnostics};
use crate::exit_code::ExitCode;
use crate::source::SourceUnit;
use colt_parser::parse;
use serde_json::json;

pub fn run_parse(source: &SourceUnit, options: &CliOptions) -> i32 {
    let result = parse(&source.text);
    if options.json {
        let diag_items: Vec<_> = result
            .diagnostics
            .iter()
            .map(|d| format_diagnostic_as_json(d, &source.name))
            .collect();
        let out = json!({
            "source": source.name,
            "program": result.program,
            "diagnostics": diag_items
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    } else {

        println!("{}", serde_json::to_string_pretty(&result.program).unwrap_or_default());
    }

    if !result.diagnostics.is_empty() {
        if !options.json {
            eprint!("{}", format_diagnostics(&result.diagnostics, &source.name));
        }
        ExitCode::DIAGNOSTICS
    } else {
        ExitCode::SUCCESS
    }
}
