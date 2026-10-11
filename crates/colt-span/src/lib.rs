use std::fmt;
use serde::{Deserialize, Serialize};

/// A 1-indexed source location pointing to a character in a source text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct SourcePosition {
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

impl SourcePosition {
    pub const fn new(offset: usize, line: usize, column: usize) -> Self {
        Self { offset, line, column }
    }

    pub const fn start() -> Self {
        Self {
            offset: 0,
            line: 1,
            column: 1,
        }
    }
}

impl fmt::Display for SourcePosition {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}", self.line, self.column)
    }
}

/// A span between two source positions denoting a half-open or closed text range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SourceSpan {
    pub start: SourcePosition,
    pub end: SourcePosition,
}

impl SourceSpan {
    pub const fn new(start: SourcePosition, end: SourcePosition) -> Self {
        Self { start, end }
    }

    pub const fn empty() -> Self {
        Self {
            start: SourcePosition::start(),
            end: SourcePosition::start(),
        }
    }

    pub const fn point(pos: SourcePosition) -> Self {
        Self { start: pos, end: pos }
    }
}

impl fmt::Display for SourceSpan {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}-{}", self.start, self.end)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialization() {
        let span = SourceSpan::new(
            SourcePosition::new(0, 1, 1),
            SourcePosition::new(10, 1, 11),
        );
        let json = serde_json::to_string(&span).expect("serialization succeeds");
        assert_eq!(
            json,
            r#"{"start":{"offset":0,"line":1,"column":1},"end":{"offset":10,"line":1,"column":11}}"#
        );

        let roundtrip: SourceSpan = serde_json::from_str(&json).expect("deserialization succeeds");
        assert_eq!(span, roundtrip);
    }
}
