# Colt Language Conformance Protocol (CLCP)

Version: 1.0  
Status: Normative  
Specification: [spec/SPEC.md](../SPEC.md)

## 1. Purpose

The Colt Language Conformance Protocol (CLCP) defines the formal requirements an implementation must meet to be certified as a conformant ColtLang compiler, parser, or interpreter.

Any implementation—whether written in Rust (`colt-cli`), TypeScript (`@coltanedb/compiler`), C, or another language—must adhere to these rules.

## 2. Conformance Requirements

### 2.1 Lexical & Grammar Parity
A conformant implementation:
1. Must tokenize valid `.colt` programs according to [grammar.ebnf](../grammar.ebnf).
2. Must treat keywords as case-insensitive (`FIND` == `find` == `Find`).
3. Must enforce case-sensitive identifiers.
4. Must reject literal credentialed database URLs with diagnostic code `COLT2023`.
5. Must validate RFC 4122 v4 UUID literals in record keys.

### 2.2 AST Serialization Parity
When serializing ASTs to JSON:
1. All property names must use standard camelCase (`startOffset`, `endOffset`, `startLine`, `startColumn`, `endLine`, `endColumn`).
2. Statements must preserve source order.
3. Node kinds must match normative schemas (`PragmaStatement`, `ConnectionStatement`, `DefaultConnectionStatement`, `DefineCollectionStatement`, `FindStatement`, `PutStatement`, `CreateStatement`, `DeleteStatement`, `AtomicBlockStatement`).

### 2.3 Diagnostic Parity
Every error or warning:
1. Must produce a stable diagnostic code in the range `COLT1001`–`COLT4999`.
2. Must report exact 1-indexed line and column coordinates.
3. Must categorize severity into `error`, `warning`, `information`, or `hint`.
4. Must include an actionable remediation hint where specified in `spec/SPEC.md`.

## 3. Conformance Suite

Conformance is verified by running the differential test corpus in `fixtures/` and `tests/parity.test.ts`. An implementation passes if and only if:
- All valid programs parse without errors.
- All invalid programs produce the exact expected diagnostic code.
- Formatter output is idempotent (`fmt(fmt(src)) == fmt(src)`).
