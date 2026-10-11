use colt_diagnostics::codes::*;
use colt_diagnostics::ColtDiagnostic;
use colt_span::{SourcePosition, SourceSpan};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenKind {
    Keyword,
    Identifier,
    Uuid,
    Integer,
    Float,
    Duration,
    Time,
    String,
    Parameter,
    Operator,
    Punctuation,
    Pragma,
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ColtToken {
    pub kind: TokenKind,
    pub lexeme: String,
    pub value: String,
    pub span: SourceSpan,
}

impl ColtToken {
    pub fn new(
        kind: TokenKind,
        lexeme: impl Into<String>,
        value: impl Into<String>,
        span: SourceSpan,
    ) -> Self {
        Self {
            kind,
            lexeme: lexeme.into(),
            value: value.into(),
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LexResult {
    pub tokens: Vec<ColtToken>,
    pub diagnostics: Vec<ColtDiagnostic>,
}

const KEYWORDS: &[&str] = &[
    "DEFINE",
    "COLLECTION",
    "EDGE",
    "POLICY",
    "STRICT",
    "FLEXIBLE",
    "FIND",
    "SELECT",
    "FETCH",
    "WHERE",
    "ORDER",
    "BY",
    "ASC",
    "DESC",
    "LIMIT",
    "OFFSET",
    "SINCE",
    "WINDOW",
    "LIVE",
    "NEAREST",
    "TO",
    "PUT",
    "CREATE",
    "SET",
    "GET",
    "DELETE",
    "RELATE",
    "ATOMIC",
    "FOR",
    "READ",
    "UPDATE",
    "WHEN",
    "IN",
    "AND",
    "OR",
    "NOT",
    "TRUE",
    "FALSE",
    "NULL",
    "UUID",
    "TEXT",
    "INT",
    "FLOAT",
    "BOOL",
    "TIME",
    "DURATION",
    "DOC",
    "LIST",
    "LINK",
    "VECTOR",
    "KEY",
    "UNIQUE",
    "CONNECT",
    "AS",
    "DEFAULT",
    "CONNECTION",
    "ENV",
    "MELD",
    "SYNC",
    "CONSTRAINT",
    "REFERENCES",
    "MODE",
    "POSTGRES",
    "SQLITE",
    "LIBSQL",
    "D1",
    "INDEX",
    "TTL",
    "STORAGE",
    "TIMESERIES",
    "BACKEND",
    "READONLY",
    "MONGODB",
    "FIRESTORE",
    "REDIS",
    "KV",
    "RELATIONAL",
    "DOCUMENT",
    "NOW",
];

const TWO_CHAR_OPERATORS: &[&str] = &["==", "!=", "<=", ">=", "->"];
const ONE_CHAR_OPERATORS: &[char] = &['<', '>', '+', '-', '*', '/', '%'];
const PUNCTUATION: &[char] = &['@', '{', '}', '(', ')', '[', ']', ',', ':', '.', '?', ';'];

struct Lexer<'a> {
    source: &'a str,
    bytes: &'a [u8],
    offset: usize,
    line: usize,
    column: usize,
    tokens: Vec<ColtToken>,
    diagnostics: Vec<ColtDiagnostic>,
}

impl<'a> Lexer<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source,
            bytes: source.as_bytes(),
            offset: 0,
            line: 1,
            column: 1,
            tokens: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn run(mut self) -> LexResult {
        while !self.at_end() {
            let char = self.peek_char();

            if char == ' ' || char == '\t' || char == '\r' || char == '\n' {
                self.advance();
            } else if self.starts_with("--") {
                self.skip_line_comment();
            } else if self.starts_with("/*") {
                self.skip_block_comment();
            } else if self.starts_with("#!") {
                self.skip_line_comment();
            } else if self.starts_with("#colt") {
                self.read_pragma();
            } else if char == '"' {
                self.read_string();
            } else if char == '$' {
                self.read_parameter();
            } else if char.is_ascii_digit() {
                self.read_number_or_time();
            } else if Self::is_identifier_start(char) {
                self.read_identifier();
            } else if self.read_operator_or_punctuation() {
                continue;
            } else {
                let start = self.position();
                self.advance();
                let json_char = serde_json::to_string(&char.to_string()).unwrap_or_default();
                self.report(
                    COLT1001,
                    format!("Unexpected character {json_char}."),
                    start,
                );
            }
        }

        let end = self.position();
        self.tokens.push(ColtToken {
            kind: TokenKind::Eof,
            lexeme: String::new(),
            value: String::new(),
            span: SourceSpan::new(end, end),
        });

        LexResult {
            tokens: self.tokens,
            diagnostics: self.diagnostics,
        }
    }

    fn read_identifier(&mut self) {
        let start = self.position();
        let start_offset = self.offset;
        while !self.at_end() && Self::is_identifier_continue(self.peek_char()) {
            self.advance();
        }
        let lexeme = &self.source[start_offset..self.offset];
        let normalized = lexeme.to_ascii_uppercase();
        let is_kw = KEYWORDS.iter().any(|&k| k == normalized);
        let kind = if is_kw {
            TokenKind::Keyword
        } else {
            TokenKind::Identifier
        };
        let value = if is_kw {
            normalized
        } else {
            lexeme.to_string()
        };
        self.add_token(kind, lexeme, value, start);
    }

    fn read_parameter(&mut self) {
        let start = self.position();
        self.advance(); // consume '$'
        let name_start = self.offset;
        while !self.at_end() && Self::is_identifier_continue(self.peek_char()) {
            self.advance();
        }
        let name = &self.source[name_start..self.offset];
        if name.is_empty() {
            self.report(COLT1002, "Expected a parameter name after $.", start);
            return;
        }
        let lexeme = &self.source[start.offset..self.offset];
        self.add_token(TokenKind::Parameter, lexeme, name, start);
    }

    fn read_number_or_time(&mut self) {
        let start = self.position();
        let remaining = &self.source[self.offset..];

        // 1. Try UUID
        if let Some(uuid_len) = Self::match_uuid(remaining) {
            let next_byte = remaining.as_bytes().get(uuid_len);
            let not_word_char = next_byte.map_or(true, |&b| !Self::is_word_byte(b));
            if not_word_char {
                let uuid = &remaining[..uuid_len];
                self.advance_len(uuid_len);
                self.add_token(TokenKind::Uuid, uuid, uuid, start);
                return;
            }
        }

        // 2. Try Time literal
        if let Some(time_len) = Self::match_time(remaining) {
            let time = &remaining[..time_len];
            self.advance_len(time_len);
            self.add_token(TokenKind::Time, time, time, start);
            return;
        }

        // 3. Try Duration literal
        if let Some(dur_len) = Self::match_duration(remaining) {
            let dur = &remaining[..dur_len];
            self.advance_len(dur_len);
            self.add_token(TokenKind::Duration, dur, dur, start);
            return;
        }

        // 4. Try Number literal
        if let Some((num_len, is_float)) = Self::match_number(remaining) {
            let num = &remaining[..num_len];
            self.advance_len(num_len);
            self.add_token(
                if is_float {
                    TokenKind::Float
                } else {
                    TokenKind::Integer
                },
                num,
                num,
                start,
            );
            return;
        }

        self.advance();
        self.report(COLT1003, "Malformed numeric literal.", start);
    }

    fn match_uuid(text: &str) -> Option<usize> {
        let b = text.as_bytes();
        if b.len() < 36 {
            return None;
        }
        // 8 hex
        for i in 0..8 {
            if !b[i].is_ascii_hexdigit() {
                return None;
            }
        }
        if b[8] != b'-' {
            return None;
        }
        // 4 hex
        for i in 9..13 {
            if !b[i].is_ascii_hexdigit() {
                return None;
            }
        }
        if b[13] != b'-' {
            return None;
        }
        // [1-8][0-9a-f]{3}
        if !matches!(b[14], b'1'..=b'8') {
            return None;
        }
        for i in 15..18 {
            if !b[i].is_ascii_hexdigit() {
                return None;
            }
        }
        if b[18] != b'-' {
            return None;
        }
        // [89ab][0-9a-f]{3}
        if !matches!(b[19], b'8' | b'9' | b'a' | b'b' | b'A' | b'B') {
            return None;
        }
        for i in 20..23 {
            if !b[i].is_ascii_hexdigit() {
                return None;
            }
        }
        if b[23] != b'-' {
            return None;
        }
        // 12 hex
        for i in 24..36 {
            if !b[i].is_ascii_hexdigit() {
                return None;
            }
        }
        Some(36)
    }

    fn match_time(text: &str) -> Option<usize> {
        let b = text.as_bytes();
        // Min len: YYYY-MM-DDTHH:mm:ssZ = 20 chars
        if b.len() < 20 {
            return None;
        }
        // YYYY-MM-DD
        if !b[0..4].iter().all(u8::is_ascii_digit)
            || b[4] != b'-'
            || !b[5..7].iter().all(u8::is_ascii_digit)
            || b[7] != b'-'
            || !b[8..10].iter().all(u8::is_ascii_digit)
        {
            return None;
        }
        // T or t
        if b[10] != b'T' && b[10] != b't' {
            return None;
        }
        // HH:mm:ss
        if !b[11..13].iter().all(u8::is_ascii_digit)
            || b[13] != b':'
            || !b[14..16].iter().all(u8::is_ascii_digit)
            || b[16] != b':'
            || !b[17..19].iter().all(u8::is_ascii_digit)
        {
            return None;
        }
        let mut idx = 19;
        // Optional .\d+
        if idx < b.len() && b[idx] == b'.' {
            idx += 1;
            let frac_start = idx;
            while idx < b.len() && b[idx].is_ascii_digit() {
                idx += 1;
            }
            if idx == frac_start {
                return None;
            }
        }
        // Timezone: Z or [+-]HH:mm
        if idx < b.len() && (b[idx] == b'Z' || b[idx] == b'z') {
            idx += 1;
            return Some(idx);
        }
        if idx + 5 < b.len()
            && (b[idx] == b'+' || b[idx] == b'-')
            && b[idx + 1].is_ascii_digit()
            && b[idx + 2].is_ascii_digit()
            && b[idx + 3] == b':'
            && b[idx + 4].is_ascii_digit()
            && b[idx + 5].is_ascii_digit()
        {
            return Some(idx + 6);
        }
        None
    }

    fn match_duration(text: &str) -> Option<usize> {
        let b = text.as_bytes();
        let mut idx = 0;
        while idx < b.len() && b[idx].is_ascii_digit() {
            idx += 1;
        }
        if idx == 0 || idx >= b.len() {
            return None;
        }
        let unit = b[idx];
        if matches!(unit, b's' | b'm' | b'h' | b'd' | b'S' | b'M' | b'H' | b'D') {
            let next_byte = b.get(idx + 1);
            if next_byte.map_or(true, |&next| !Self::is_word_byte(next)) {
                return Some(idx + 1);
            }
        }
        None
    }

    fn match_number(text: &str) -> Option<(usize, bool)> {
        let b = text.as_bytes();
        let mut idx = 0;
        while idx < b.len() && b[idx].is_ascii_digit() {
            idx += 1;
        }
        if idx == 0 {
            return None;
        }
        let mut is_float = false;
        // Check for decimal part: . followed by digit
        if idx + 1 < b.len() && b[idx] == b'.' && b[idx + 1].is_ascii_digit() {
            is_float = true;
            idx += 1; // consume '.'
            while idx < b.len() && b[idx].is_ascii_digit() {
                idx += 1;
            }
        }
        // Check for exponent: [eE][+-]?\d+
        if idx < b.len() && (b[idx] == b'e' || b[idx] == b'E') {
            let mut exp_idx = idx + 1;
            if exp_idx < b.len() && (b[exp_idx] == b'+' || b[exp_idx] == b'-') {
                exp_idx += 1;
            }
            if exp_idx < b.len() && b[exp_idx].is_ascii_digit() {
                is_float = true;
                idx = exp_idx;
                while idx < b.len() && b[idx].is_ascii_digit() {
                    idx += 1;
                }
            }
        }
        Some((idx, is_float))
    }

    fn read_string(&mut self) {
        let start = self.position();
        self.advance(); // consume opening quote
        let mut value = String::new();

        while !self.at_end() && self.peek_char() != '"' && self.peek_char() != '\n' {
            let char = self.advance();
            if char != '\\' {
                value.push(char);
                continue;
            }

            if self.at_end() {
                break;
            }
            let escape = self.advance();
            match escape {
                '"' => value.push('"'),
                '\\' => value.push('\\'),
                'n' => value.push('\n'),
                'r' => value.push('\r'),
                't' => value.push('\t'),
                'u' => {
                    if self.offset + 4 <= self.bytes.len() {
                        let hex_bytes = &self.bytes[self.offset..self.offset + 4];
                        if hex_bytes.iter().all(u8::is_ascii_hexdigit) {
                            let hex_str = std::str::from_utf8(hex_bytes).unwrap_or("");
                            let codepoint = u32::from_str_radix(hex_str, 16).unwrap_or(0);
                            self.advance_len(4);
                            if let Some(ch) = char::from_u32(codepoint) {
                                value.push(ch);
                            } else {
                                value.push('\u{FFFD}');
                            }
                        } else {
                            self.report(
                                COLT1004,
                                "Expected four hexadecimal digits after \\u.",
                                start,
                            );
                        }
                    } else {
                        self.report(
                            COLT1004,
                            "Expected four hexadecimal digits after \\u.",
                            start,
                        );
                    }
                }
                other => {
                    self.report(
                        COLT1004,
                        format!("Unknown string escape \\{other}."),
                        start,
                    );
                    value.push(other);
                }
            }
        }

        if self.at_end() || self.peek_char() != '"' {
            self.report(COLT1005, "Unterminated string literal.", start);
            return;
        }

        self.advance(); // consume closing quote
        let lexeme = &self.source[start.offset..self.offset];
        self.add_token(TokenKind::String, lexeme, value, start);
    }

    fn skip_line_comment(&mut self) {
        while !self.at_end() && self.peek_char() != '\n' {
            self.advance();
        }
    }

    fn skip_block_comment(&mut self) {
        let start = self.position();
        self.advance_len(2); // consume '/*'
        while !self.at_end() && !self.starts_with("*/") {
            self.advance();
        }
        if self.at_end() {
            self.report(COLT1006, "Unterminated block comment.", start);
            return;
        }
        self.advance_len(2); // consume '*/'
    }

    fn read_pragma(&mut self) {
        let start = self.position();
        self.advance_len(5); // consume '#colt'
        while !self.at_end() && (self.peek_char() == ' ' || self.peek_char() == '\t') {
            self.advance();
        }
        let remaining = &self.source[self.offset..];
        let mut ver_len = 0;
        let b = remaining.as_bytes();
        while ver_len < b.len() && b[ver_len].is_ascii_digit() {
            ver_len += 1;
        }
        if ver_len < b.len() && b[ver_len] == b'.' {
            let next = ver_len + 1;
            if next < b.len() && b[next].is_ascii_digit() {
                ver_len = next;
                while ver_len < b.len() && b[ver_len].is_ascii_digit() {
                    ver_len += 1;
                }
            }
        }
        let version = if ver_len > 0 {
            let v = remaining[..ver_len].to_string();
            self.advance_len(ver_len);
            v
        } else {
            "0.2".to_string()
        };
        while !self.at_end() && self.peek_char() != '\n' {
            self.advance();
        }
        let end = self.position();
        self.tokens.push(ColtToken {
            kind: TokenKind::Pragma,
            lexeme: format!("#colt {version}"),
            value: version,
            span: SourceSpan::new(start, end),
        });
    }

    fn read_operator_or_punctuation(&mut self) -> bool {
        let start = self.position();

        // 2-character operators
        for &op in TWO_CHAR_OPERATORS {
            if self.starts_with(op) {
                self.advance_len(op.len());
                self.add_token(TokenKind::Operator, op, op, start);
                return true;
            }
        }

        let char = self.peek_char();

        // 1-character operators
        if ONE_CHAR_OPERATORS.contains(&char) {
            self.advance();
            let s = char.to_string();
            self.add_token(TokenKind::Operator, &s, &s, start);
            return true;
        }

        // Punctuation
        if PUNCTUATION.contains(&char) {
            self.advance();
            let s = char.to_string();
            self.add_token(TokenKind::Punctuation, &s, &s, start);
            return true;
        }

        false
    }

    fn add_token(
        &mut self,
        kind: TokenKind,
        lexeme: &str,
        value: impl Into<String>,
        start: SourcePosition,
    ) {
        self.tokens.push(ColtToken {
            kind,
            lexeme: lexeme.to_string(),
            value: value.into(),
            span: SourceSpan::new(start, self.position()),
        });
    }

    fn report(&mut self, code: &str, message: impl Into<String>, start: SourcePosition) {
        self.diagnostics.push(ColtDiagnostic::new(
            code,
            message,
            SourceSpan::new(start, self.position()),
        ));
    }

    fn advance(&mut self) -> char {
        let char = self.peek_char();
        self.offset += char.len_utf8();
        if char == '\n' {
            self.line += 1;
            self.column = 1;
        } else {
            self.column += 1;
        }
        char
    }

    fn advance_len(&mut self, len: usize) {
        for _ in 0..len {
            self.advance();
        }
    }

    fn position(&self) -> SourcePosition {
        SourcePosition::new(self.offset, self.line, self.column)
    }

    fn peek_char(&self) -> char {
        self.source[self.offset..].chars().next().unwrap_or('\0')
    }

    fn starts_with(&self, s: &str) -> bool {
        self.source[self.offset..].starts_with(s)
    }

    fn at_end(&self) -> bool {
        self.offset >= self.source.len()
    }

    fn is_identifier_start(c: char) -> bool {
        c.is_ascii_alphabetic() || c == '_'
    }

    fn is_identifier_continue(c: char) -> bool {
        c.is_ascii_alphanumeric() || c == '_'
    }

    fn is_word_byte(b: u8) -> bool {
        b.is_ascii_alphanumeric() || b == b'_'
    }
}

pub fn lex(source: &str) -> LexResult {
    Lexer::new(source).run()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keywords_case_insensitive() {
        let res = lex("FiNd users SeLeCt id");
        assert_eq!(res.diagnostics, vec![]);
        assert_eq!(res.tokens.len(), 5); // 4 tokens + EOF
        assert_eq!(res.tokens[0].kind, TokenKind::Keyword);
        assert_eq!(res.tokens[0].value, "FIND");
        assert_eq!(res.tokens[0].lexeme, "FiNd");
        assert_eq!(res.tokens[1].kind, TokenKind::Identifier);
        assert_eq!(res.tokens[1].value, "users");
        assert_eq!(res.tokens[2].kind, TokenKind::Keyword);
        assert_eq!(res.tokens[2].value, "SELECT");
        assert_eq!(res.tokens[3].kind, TokenKind::Identifier);
        assert_eq!(res.tokens[3].value, "id");
    }

    #[test]
    fn test_string_escapes() {
        let res = lex(r#""line\n\u0041""#);
        assert_eq!(res.diagnostics, vec![]);
        assert_eq!(res.tokens[0].kind, TokenKind::String);
        assert_eq!(res.tokens[0].value, "line\nA");
    }

    #[test]
    fn test_uuid() {
        let res = lex("11111111-1111-4111-8111-111111111111");
        assert_eq!(res.diagnostics, vec![]);
        assert_eq!(res.tokens[0].kind, TokenKind::Uuid);
        assert_eq!(res.tokens[0].value, "11111111-1111-4111-8111-111111111111");
    }

    #[test]
    fn test_durations_and_time() {
        let res = lex("30m 2026-09-30T12:30:00Z");
        assert_eq!(res.diagnostics, vec![]);
        assert_eq!(res.tokens[0].kind, TokenKind::Duration);
        assert_eq!(res.tokens[0].value, "30m");
        assert_eq!(res.tokens[1].kind, TokenKind::Time);
        assert_eq!(res.tokens[1].value, "2026-09-30T12:30:00Z");
    }

    #[test]
    fn test_conformance_diagnostics() {
        assert_eq!(lex("/* unclosed").diagnostics[0].code, "COLT1006");
        assert_eq!(lex("\"unclosed").diagnostics[0].code, "COLT1005");
        assert_eq!(lex("\"bad \\q\"").diagnostics[0].code, "COLT1004");
        assert_eq!(lex("$").diagnostics[0].code, "COLT1002");
        assert_eq!(lex("#").diagnostics[0].code, "COLT1001");
    }
}
