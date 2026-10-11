use colt_compiler::compile;
use colt_lexer::lex;
use colt_parser::parse;

fn lcg_random(state: &mut u32) -> f64 {
    *state = state.wrapping_add(0x6d2b79f5);
    let mut v = *state;
    v = (v ^ (v >> 15)).wrapping_mul(v | 1);
    v ^= v.wrapping_add((v ^ (v >> 7)).wrapping_mul(v | 61));
    ((v ^ (v >> 14)) as f64) / 4294967296.0
}

const VOCABULARY: &[&str] = &[
    "DEFINE", "COLLECTION", "STRICT", "FLEXIBLE", "FIND", "SELECT", "FETCH", "WHERE", "ORDER", "BY",
    "ASC", "DESC", "LIMIT", "OFFSET", "SINCE", "WINDOW", "LIVE", "NEAREST", "PUT", "CREATE", "SET",
    "GET", "DELETE", "RELATE", "ATOMIC", "AND", "OR", "NOT", "IN", "TRUE", "FALSE", "NULL",
    "uuid", "text", "int", "float", "bool", "time", "duration", "doc", "list", "link", "vector",
    "users", "orders", "id", "name", "email", "profile", "now", "$email", "$owner",
    "\"text\"", "\"unterminated", "42", "3.5", "1.5e3", "30m", "2026-09-30T12:30:00Z",
    "11111111-1111-4111-8111-111111111111",
    "{", "}", "(", ")", "[", "]", ",", ":", ".", "?", ";", "@", "->", "==", "!=", "<=", ">=", "<", ">",
    "+", "-", "*", "/", "%", "--", "/*", "*/", "\\", "\n", "\t", " ", "",
];

const CHAR_ALPHABET: &[u8] = b"ABCXYZabcxyz019 \t\n{}()[]<>,.:;?@$+-*/%=!#&|~^_`";

fn assert_total(source: &str) {
    let lex_res = lex(source);
    assert_eq!(lex_res.tokens.last().map(|t| t.kind), Some(colt_lexer::TokenKind::Eof));

    let parse_res = parse(source);
    assert_eq!(parse_res.program.r#type, "Program");

    let comp_res = compile(source, None, None);
    if let Some(plan) = comp_res.plan {
        assert!(!plan.steps.is_empty());
    }
}

#[test]
fn test_fuzz_random_token_soup() {
    let mut rng_state = 0x5eed0001;
    for _ in 0..100 {
        let len = 4 + (lcg_random(&mut rng_state) * 40.0) as usize;
        let mut parts = String::new();
        for _ in 0..len {
            let idx = (lcg_random(&mut rng_state) * VOCABULARY.len() as f64) as usize;
            parts.push_str(VOCABULARY[idx]);
            if lcg_random(&mut rng_state) < 0.5 {
                parts.push(' ');
            } else {
                parts.push('\n');
            }
        }
        assert_total(&parts);
    }
}

#[test]
fn test_fuzz_random_character_soup() {
    let mut rng_state = 0x5eed0002;
    for _ in 0..100 {
        let len = 1 + (lcg_random(&mut rng_state) * 160.0) as usize;
        let mut text = String::new();
        for _ in 0..len {
            let idx = (lcg_random(&mut rng_state) * CHAR_ALPHABET.len() as f64) as usize;
            text.push(CHAR_ALPHABET[idx] as char);
        }
        assert_total(&text);
    }
}
