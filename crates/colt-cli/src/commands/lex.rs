use crate::args::CliOptions;
use crate::diagnostics::{format_diagnostic_as_json, format_diagnostics};
use crate::exit_code::ExitCode;
use crate::source::SourceUnit;
use colt_lexer::{lex, ColtToken, TokenKind};
use serde_json::json;

pub fn run_lex(source: &SourceUnit, options: &CliOptions) -> i32 {
    let result = lex(&source.text);
    let tokens: Vec<&ColtToken> = result
        .tokens
        .iter()
        .filter(|t| t.kind != TokenKind::Eof)
        .collect();

    if options.json {
        let diag_items: Vec<_> = result
            .diagnostics
            .iter()
            .map(|d| format_diagnostic_as_json(d, &source.name))
            .collect();
        let out = json!({
            "source": source.name,
            "tokens": tokens,
            "diagnostics": diag_items
        });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
    } else {
        for token in &tokens {

            println!("{}", format_token(token));
        }
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

fn format_token(token: &ColtToken) -> String {
    let kind_str = match token.kind {
        TokenKind::Keyword => "keyword",
        TokenKind::Identifier => "identifier",
        TokenKind::Integer => "integer",
        TokenKind::Float => "float",
        TokenKind::String => "string",
        TokenKind::Duration => "duration",
        TokenKind::Time => "time",
        TokenKind::Uuid => "uuid",
        TokenKind::Parameter => "parameter",
        TokenKind::Operator => "operator",
        TokenKind::Punctuation => "punctuation",
        TokenKind::Pragma => "pragma",
        TokenKind::Eof => "eof",
    };
    let val_json = serde_json::to_string(&token.value).unwrap_or_default();
    let pos = format!("{}:{}", token.span.start.line, token.span.start.column);
    format!("{:<12} {:<24} {}", kind_str, val_json, pos)
}
