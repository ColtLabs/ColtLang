use crate::args::CliOptions;
use crate::exit_code::ExitCode;
use colt_compiler::capabilities::POSTGRES_CAPABILITIES;
use serde_json::json;

pub fn run_capabilities(options: &CliOptions) -> i32 {
    if options.json {
        let out = json!({
            "backend": "postgres",
            "capabilities": POSTGRES_CAPABILITIES
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return ExitCode::SUCCESS;
    }

    let entries = [
        ("joins", POSTGRES_CAPABILITIES.joins),
        ("transactions", POSTGRES_CAPABILITIES.transactions),
        ("docPaths", POSTGRES_CAPABILITIES.doc_paths),
        ("vector", POSTGRES_CAPABILITIES.vector),
        ("graph", POSTGRES_CAPABILITIES.graph),
        ("timeSeries", POSTGRES_CAPABILITIES.time_series),
        ("fullText", POSTGRES_CAPABILITIES.full_text),
        ("ttl", POSTGRES_CAPABILITIES.ttl),
    ];

    let width = entries.iter().map(|(n, _)| n.len()).max().unwrap_or(0);
    for (name, supported) in entries {
        println!("{:<width$}  {}", name, if supported { "yes" } else { "no" }, width = width);
    }
    ExitCode::SUCCESS
}
