use colt_diagnostics::ColtDiagnostic;
use serde_json::json;

pub fn format_diagnostic(diagnostic: &ColtDiagnostic, source_name: &str) -> String {
    let line = diagnostic.span.start.line;
    let column = diagnostic.span.start.column;
    let header = format!(
        "{}:{}:{}: {} [{}] {}",
        source_name,
        line,
        column,
        diagnostic.severity.as_str(),
        diagnostic.code,
        diagnostic.message
    );
    if let Some(hint) = &diagnostic.hint {
        format!("{}\n  hint: {}", header, hint)
    } else {
        header
    }
}

pub fn format_diagnostics(diagnostics: &[ColtDiagnostic], source_name: &str) -> String {
    let mut out = String::new();
    for d in diagnostics {
        out.push_str(&format_diagnostic(d, source_name));
        out.push('\n');
    }
    out
}

pub fn format_diagnostic_as_json(diagnostic: &ColtDiagnostic, source_name: &str) -> serde_json::Value {
    json!({
        "file": source_name,
        "line": diagnostic.span.start.line,
        "column": diagnostic.span.start.column,
        "endLine": diagnostic.span.end.line,
        "endColumn": diagnostic.span.end.column,
        "severity": diagnostic.severity.as_str(),
        "code": diagnostic.code,
        "message": diagnostic.message,
        "hint": diagnostic.hint,
        "span": diagnostic.span,
    })
}

pub fn format_diagnostics_as_json(diagnostics: &[ColtDiagnostic], source_name: &str) -> String {
    let items: Vec<_> = diagnostics
        .iter()
        .map(|d| format_diagnostic_as_json(d, source_name))
        .collect();
    let obj = json!({
        "source": source_name,
        "diagnostics": items
    });
    format!("{}\n", serde_json::to_string_pretty(&obj).unwrap_or_default())
}

