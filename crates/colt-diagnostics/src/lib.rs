use colt_span::SourceSpan;
use serde::{Deserialize, Serialize};

pub mod codes {
    // Lexical codes
    pub const COLT1001: &str = "COLT1001"; // Unexpected character
    pub const COLT1002: &str = "COLT1002"; // Expected parameter name after $
    pub const COLT1003: &str = "COLT1003"; // Malformed numeric literal
    pub const COLT1004: &str = "COLT1004"; // Unknown string escape / incomplete unicode escape
    pub const COLT1005: &str = "COLT1005"; // Unterminated string literal
    pub const COLT1006: &str = "COLT1006"; // Unterminated block comment

    // Parser codes
    pub const COLT1099: &str = "COLT1099"; // Parser internal recovery
    pub const COLT1101: &str = "COLT1101"; // Expected a statement
    pub const COLT1102: &str = "COLT1102"; // Expected a type
    pub const COLT1103: &str = "COLT1103"; // DELETE requires record id or WHERE
    pub const COLT1104: &str = "COLT1104"; // ATOMIC supports PUT, CREATE, DELETE in M1
    pub const COLT1105: &str = "COLT1105"; // Record keys must be identifiers, strings, integers
    pub const COLT1106: &str = "COLT1106"; // Expected expression / Malformed @backend
    pub const COLT1107: &str = "COLT1107"; // Expected identifier
    pub const COLT1108: &str = "COLT1108"; // Expected name
    pub const COLT1109: &str = "COLT1109"; // Expected integer
    pub const COLT1110: &str = "COLT1110"; // Expected value

    // Semantic codes
    pub const COLT2001: &str = "COLT2001"; // Unsupported capability / non-transactional engine
    pub const COLT2002: &str = "COLT2002"; // Unknown collection
    pub const COLT2003: &str = "COLT2003"; // Reserved construct
    pub const COLT2004: &str = "COLT2004"; // Unknown field
    pub const COLT2005: &str = "COLT2005"; // Constant-true DELETE WHERE
    pub const COLT2006: &str = "COLT2006"; // Duplicate collection
    pub const COLT2007: &str = "COLT2007"; // Duplicate field
    pub const COLT2008: &str = "COLT2008"; // Unknown annotation
    pub const COLT2009: &str = "COLT2009"; // Duplicate annotation
    pub const COLT2010: &str = "COLT2010"; // Invalid vector dimension
    pub const COLT2011: &str = "COLT2011"; // Key field required
    pub const COLT2012: &str = "COLT2012"; // Document path only valid on doc field
    pub const COLT2013: &str = "COLT2013"; // Function not available in M1 subset
    pub const COLT2014: &str = "COLT2014"; // Required field missing
    pub const COLT2015: &str = "COLT2015"; // Record key must be a UUID
    pub const COLT2016: &str = "COLT2016"; // ATOMIC cannot span multiple primary backends
    pub const COLT2017: &str = "COLT2017"; // CREATE without record id requires UUID key
    pub const COLT2018: &str = "COLT2018"; // Type mismatch
    pub const COLT2019: &str = "COLT2019"; // Vector length mismatch
    pub const COLT2020: &str = "COLT2020"; // Empty ATOMIC block
    pub const COLT2021: &str = "COLT2021"; // Unknown connection
    pub const COLT2022: &str = "COLT2022"; // Duplicate connection alias
    pub const COLT2023: &str = "COLT2023"; // Literal credentials URL rejected
    pub const COLT2024: &str = "COLT2024"; // Ambiguous default connection
    pub const COLT2025: &str = "COLT2025"; // ATOMIC spans multiple connections
    pub const COLT2026: &str = "COLT2026"; // Feature unsupported on engine
    pub const COLT2027: &str = "COLT2027"; // Unknown engine
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColtDiagnostic {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub span: SourceSpan,
}

impl ColtDiagnostic {
    pub fn new(code: impl Into<String>, message: impl Into<String>, span: SourceSpan) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            hint: None,
            span,
        }
    }

    pub fn with_hint(
        code: impl Into<String>,
        message: impl Into<String>,
        hint: impl Into<String>,
        span: SourceSpan,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            hint: Some(hint.into()),
            span,
        }
    }

    pub fn format(&self, source_name: &str) -> String {
        let line = self.span.start.line;
        let column = self.span.start.column;
        let header = format!("{source_name}:{line}:{column}: error [{code}] {message}",
            code = self.code,
            message = self.message
        );
        match &self.hint {
            Some(hint) => format!("{header}\n  hint: {hint}"),
            None => header,
        }
    }
}

pub fn format_diagnostics(diagnostics: &[ColtDiagnostic], source_name: &str) -> String {
    let mut out = String::new();
    for diag in diagnostics {
        out.push_str(&diag.format(source_name));
        out.push('\n');
    }
    out
}

#[derive(Serialize)]
struct JsonDiagnosticsWrapper<'a> {
    source: &'a str,
    diagnostics: &'a [ColtDiagnostic],
}

pub fn format_diagnostics_as_json(diagnostics: &[ColtDiagnostic], source_name: &str) -> String {
    let wrapper = JsonDiagnosticsWrapper {
        source: source_name,
        diagnostics,
    };
    let mut json = serde_json::to_string_pretty(&wrapper).unwrap_or_else(|_| "{}".to_string());
    json.push('\n');
    json
}

pub fn summarize_diagnostics(diagnostics: &[ColtDiagnostic]) -> String {
    let count = diagnostics.len();
    if count == 1 {
        "1 error".to_string()
    } else {
        format!("{count} errors")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use colt_span::SourcePosition;

    #[test]
    fn test_diagnostic_formatting() {
        let span = SourceSpan::new(
            SourcePosition::new(10, 2, 5),
            SourcePosition::new(15, 2, 10),
        );
        let diag = ColtDiagnostic::new("COLT1001", "Unexpected character '#'.", span);
        assert_eq!(
            diag.format("test.colt"),
            "test.colt:2:5: error [COLT1001] Unexpected character '#'."
        );
    }

    #[test]
    fn test_diagnostic_with_hint() {
        let span = SourceSpan::new(
            SourcePosition::new(0, 1, 1),
            SourcePosition::new(5, 1, 6),
        );
        let diag = ColtDiagnostic::with_hint(
            "COLT2021",
            "unknown connection 'neon'.",
            "Declare it with CONNECT neon AS ...",
            span,
        );
        let formatted = diag.format("test.colt");
        assert_eq!(
            formatted,
            "test.colt:1:1: error [COLT2021] unknown connection 'neon'.\n  hint: Declare it with CONNECT neon AS ..."
        );
    }
}
