# ColtStudio2 Toolchain & Integration Specification

**Product:** ColtLang  
**Toolchain Version:** `colt 0.2.0`  
**Protocol Version:** `1`  
**Target Consumer:** ColtStudio2 Desktop IDE  
**Source Repository:** [https://github.com/ColtLabs/ColtLang](https://github.com/ColtLabs/ColtLang)  
**Binary Executable:** `colt` (`colt.exe` on Windows)

---

## 1. Executive Summary & Architecture Boundary

ColtLang is the official reference implementation and single source of truth for:
* Syntax & Grammar ([`spec/grammar.ebnf`](../spec/grammar.ebnf))
* Lexical analysis & Tokenization ([`crates/colt-lexer`](../crates/colt-lexer))
* Abstract Syntax Tree representation ([`crates/colt-ast`](../crates/colt-ast))
* Parsing ([`crates/colt-parser`](../crates/colt-parser))
* Semantic validation, catalog resolution & capability checking ([`crates/colt-compiler`](../crates/colt-compiler))
* Multi-engine PostgreSQL execution planning ([`crates/colt-compiler`](../crates/colt-compiler))
* Canonical, idempotent code formatting ([`crates/colt-fmt`](../crates/colt-fmt))
* Diagnostic codes & error reporting ([`crates/colt-diagnostics`](../crates/colt-diagnostics))
* Command Line Interface toolchain ([`crates/colt-cli`](../crates/colt-cli))

**Boundary Rule for ColtStudio2:**  
ColtStudio2 is a separate desktop IDE application and **must not duplicate** parsing, semantic analysis, type checking, or query planning logic. Instead, ColtStudio2 consumes the native `colt` executable or library interfaces via standard IPC, standard input/output streams, and structured JSON contracts documented below.

---

## 2. Implementation Audit: Current vs Planned Capabilities

To prevent assumptions, all capabilities have been audited against the codebase and verified by 82 Rust tests and 147 reference suite tests:

| Capability | Status | Implemented Details | Tested By |
| :--- | :---: | :--- | :--- |
| **Lexing & Tokenization** | ✅ **Active** | 89 case-insensitive keywords, punctuation, strings, durations (`10s`, `5m`), ISO time, RFC 4122 v4 UUID, parameters (`$param`). | `colt-lexer` tests (5 tests) |
| **Parsing & AST** | ✅ **Active** | Recursive descent + Pratt expression parser. Statements: `CONNECT`, `DEFAULT CONNECTION`, `DEFINE COLLECTION`, `FIND`, `PUT`, `CREATE`, `DELETE`, `ATOMIC`. Produces camelCase AST. | `colt-parser` (4 tests) & `conformance_test.rs` |
| **Semantic Checking** | ✅ **Active** | Catalog tracking (connections, collections, fields, types, annotations), primary key enforcement (`@key`), unique constraints (`@unique`), defaults, type compatibility. | `colt-compiler` (8 tests) |
| **Capability Checking** | ✅ **Active** | Engine capability verification (PostgreSQL Tier-1: joins, transactions, vector, graph, etc.). Enforces single-connection ATOMIC constraint (`COLT2025`). | `conformance_test.rs` (45 tests) |
| **Execution Planning** | ✅ **Active** | Compiles queries/mutations to backend-neutral plan steps containing parameterized SQL and bound parameter maps. Constant-true DELETE protection (`COLT2005`). | `colt-compiler` & `parity.test.ts` |
| **Formatting (`colt fmt`)** | ✅ **Active** | Idempotent canonical formatter. Normalizes indentation, annotations, and spacing. Supports `--check` and `--json`. | `colt-fmt` (4 tests) & `integration_test.rs` |
| **Diagnostics (31 codes)** | ✅ **Active** | Full catalog `COLT1001` through `COLT2027` with severities, hints, byte spans, and line/column positions. | `colt-diagnostics` (2 tests) |
| **Reserved Constructs** | ⚠️ **Reserved** | `DEFINE MELD`, `SAGA`, and `POLICY` statements are syntactically recognized by parser but intentionally emit `COLT2003` ("reserved construct") in compiler. | Conformance suite |
| **Live Database Execution** | ❌ **External** | Colt compiler is pure and offline; query execution over live TCP connections is handled by host database drivers/adapters, not compiler. | N/A |

---

## 3. CLI Command & Invocation Contract

The `colt` CLI supports both interactive terminal usage and machine-readable JSON mode (`--json`).

### Standard Exit Codes

| Code | Name | Meaning |
| :---: | :--- | :--- |
| **`0`** | `SUCCESS` | Operation succeeded. In `check`, program is valid with 0 diagnostics. In `fmt --check`, file is properly formatted. |
| **`1`** | `DIAGNOSTICS` | Source contains syntax, parser, or compiler diagnostics. In `fmt --check`, file is unformatted. |
| **`2`** | `USAGE_ERROR` | CLI usage error, unknown flag, missing file, or file I/O error. |

---

### Command Reference

#### 1. Version & Handshake (`colt version`)

Allows ColtStudio2 to verify toolchain existence, version, protocol compatibility, and feature set.

```bash
# Plain text
colt version

# Machine-readable JSON handshake
colt version --json
```

**JSON Schema (`colt version --json`):**
```json
{
  "name": "colt",
  "version": "0.2.0",
  "protocolVersion": "1",
  "capabilities": [
    "check",
    "plan",
    "parse",
    "lex",
    "fmt",
    "capabilities"
  ]
}
```

---

#### 2. Check & Validate (`colt check`)

Validates syntax, types, catalog declarations, and capability constraints.

```bash
# Check file on disk
colt check path/to/file.colt --json

# Check unsaved editor buffer via stdin
colt check --stdin --json < buffer.colt
# Or
cat buffer.colt | colt check - --json
```

**JSON Schema — Success (`exit 0`):**
```json
{
  "source": "path/to/file.colt",
  "status": "ok",
  "diagnostics": [],
  "steps": 6
}
```

**JSON Schema — Diagnostics Present (`exit 1`):**
```json
{
  "source": "path/to/file.colt",
  "diagnostics": [
    {
      "file": "path/to/file.colt",
      "line": 15,
      "column": 6,
      "endLine": 15,
      "endColumn": 11,
      "severity": "error",
      "code": "COLT2002",
      "message": "Unknown collection 'users'. Declare it with DEFINE COLLECTION first.",
      "hint": "Declare it with DEFINE COLLECTION first.",
      "span": {
        "start": { "line": 15, "column": 6, "offset": 240 },
        "end": { "line": 15, "column": 11, "offset": 245 }
      }
    }
  ]
}
```

---

#### 3. Plan Generation (`colt plan`)

Generates the compiled multi-engine execution plan without running queries.

```bash
# Plan file on disk
colt plan path/to/file.colt

# Plan unsaved editor buffer via stdin
colt plan --stdin --json < buffer.colt
```

**JSON Schema — Success (`exit 0`):**
```json
{
  "source": "path/to/file.colt",
  "plan": {
    "steps": [
      {
        "backend": "main",
        "collection": "books",
        "operation": "query",
        "parameterizedStatement": "SELECT \"title\" AS \"title\" FROM \"books\" WHERE (\"views\" > $1)",
        "params": [
          { "kind": "constant", "value": 10 }
        ],
        "span": {
          "start": { "line": 25, "column": 1, "offset": 495 },
          "end": { "line": 28, "column": 18, "offset": 621 }
        }
      }
    ]
  }
}
```

---

#### 4. Code Formatting (`colt fmt`)

Idempotently formats Colt code according to the canonical specification.

```bash
# Format file in-place
colt fmt path/to/file.colt

# Format editor buffer via stdin -> stdout (standard editor format-on-save)
colt fmt --stdin < buffer.colt

# Format editor buffer with JSON response
colt fmt --stdin --json < buffer.colt

# Check if file is formatted without writing (exit 0 if clean, exit 1 if unformatted)
colt fmt --check path/to/file.colt --json
```

**JSON Schema — Formatting via Stdin (`exit 0`):**
```json
{
  "source": "<stdin>",
  "formatted": "#colt 0.2\n\nCONNECT main AS postgres(env(\"DATABASE_URL\"))\n...",
  "changed": true
}
```

**JSON Schema — Check Only (`--check`, `exit 0` or `1`):**
```json
{
  "source": "path/to/file.colt",
  "formatted": false
}
```

---

#### 5. AST & Token Inspection (`colt parse`, `colt lex`)

Useful for syntax trees, outline views, and custom editor inspectors.

```bash
# Parse full AST as JSON
colt parse --json path/to/file.colt

# Lex token stream as JSON
colt lex --json path/to/file.colt
```

---

## 4. Diagnostic Object Specification

Every diagnostic emitted by `colt` conforms to this standardized schema:

```typescript
export interface ColtDiagnosticItem {
  /** Source file name or "<stdin>" */
  file: string;
  /** 1-indexed starting line number */
  line: number;
  /** 1-indexed starting column number */
  column: number;
  /** 1-indexed ending line number */
  endLine: number;
  /** 1-indexed ending column number */
  endColumn: number;
  /** Severity level: "error" | "warning" | "information" | "hint" */
  severity: "error" | "warning" | "information" | "hint";
  /** Formal diagnostic code (COLT1001 - COLT2027) */
  code: string;
  /** Human-readable explanation */
  message: string;
  /** Optional actionable resolution hint */
  hint?: string | null;
  /** Full source span with byte offsets and positions */
  span: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
}
```

### Diagnostic Codes Reference (`COLT1001`–`COLT2027`)

* **Lexer (`COLT1001`–`COLT1006`)**: Unexpected character, missing parameter name, malformed number, unknown string escape, unterminated string, unterminated block comment.
* **Parser (`COLT1099`–`COLT1110`)**: Expected statement, expected type, DELETE without key/WHERE, invalid ATOMIC construct, expected identifier, expected name, expected integer, expected value.
* **Semantic Analysis (`COLT2001`–`COLT2027`)**:
  * `COLT2001`: Unsupported capability on backend.
  * `COLT2002`: Unknown collection name.
  * `COLT2003`: Reserved construct used (`DEFINE MELD`, `SAGA`, `POLICY`).
  * `COLT2004`: Unknown field name.
  * `COLT2005`: Constant-true `DELETE WHERE` rejected.
  * `COLT2006`: Duplicate collection definition.
  * `COLT2007`: Duplicate field name in collection.
  * `COLT2008` / `COLT2009`: Unknown or duplicate field annotation.
  * `COLT2010`: Invalid vector dimension.
  * `COLT2011`: Collection missing required `@key` field.
  * `COLT2012`: Document path lookup on non-`doc` field.
  * `COLT2014`: Required field missing in insert/put.
  * `COLT2015`: Record key is not a valid UUID.
  * `COLT2016` / `COLT2025`: ATOMIC block spans multiple backends / connections.
  * `COLT2018`: Type mismatch in expression or field assignment.
  * `COLT2019`: Vector array dimension mismatch.
  * `COLT2020`: Empty ATOMIC block.
  * `COLT2021` / `COLT2022`: Unknown or duplicate connection alias.
  * `COLT2023`: Literal connection string credential rejected (`env()` required).
  * `COLT2024`: Ambiguous default connection.

---

## 5. Colt Language Server Protocol (LSP) Architecture & Plan

For high-responsiveness live editing in ColtStudio2, an LSP server (`colt lsp`) can be implemented as a lightweight adapter over the existing compiler crates.

### Grounded Feature Matrix (Based on Actual Semantic Model)

| LSP Feature | Method | Supported by Model? | How It Maps to Colt Engine |
| :--- | :--- | :---: | :--- |
| **Diagnostics** | `textDocument/publishDiagnostics` | ✅ **Fully Supported** | Run `colt_compiler::compile(&doc_text, None, None)` on `didOpen`, `didChange`, `didSave`. Convert `ColtDiagnostic` directly to LSP `Diagnostic` (mapping `span.start` / `span.end` to 0-indexed LSP `Position`). |
| **Formatting** | `textDocument/formatting` | ✅ **Fully Supported** | Run `colt_fmt::format_source(&doc_text)`. Return a full-document `TextEdit`. |
| **Document Symbols** | `textDocument/documentSymbol` | ✅ **Fully Supported** | Parse AST with `colt_parser::parse`. Walk statements to produce hierarchy: Collections (Class/Struct), Fields (Field/Property), Queries (Method), Connections (Interface). |
| **Hover** | `textDocument/hover` | ✅ **Fully Supported** | Resolve token under cursor: Keywords (markdown reference), Types (`text`, `int`, `time`, `doc`, `vector`), Collection and Field definitions (inferred type, annotations). |
| **Completion** | `textDocument/completion` | ✅ **Fully Supported** | Context-sensitive: top-level statements (`CONNECT`, `DEFINE COLLECTION`, `FIND`, `PUT`, `CREATE`, `ATOMIC`), collection names in `FIND <here>`, field names in `SELECT <here>` / `WHERE <here>`, types, annotations (`@key`, `@unique`, `@index`). |
| **Go to Definition** | `textDocument/definition` | ✅ **Fully Supported** | From `FIND books` or `link<authors>` jump to `DEFINE COLLECTION authors`. From connection alias `CONNECT main` jump to declaration. |
| **Live DB Autocomplete**| `completion` (live columns) | ❌ **Out of Scope** | Compiler is offline. Live database introspection belongs to ColtaneDB connection manager, not compiler LSP. |

### LSP Diagnostic Conversion Pattern (TypeScript / Rust)

To map Colt diagnostics to standard LSP:
```typescript
function toLspDiagnostic(diag: ColtDiagnosticItem): lsp.Diagnostic {
  return {
    range: {
      start: { line: diag.span.start.line - 1, character: diag.span.start.column - 1 },
      end: { line: diag.span.end.line - 1, character: diag.span.end.column - 1 }
    },
    severity: lsp.DiagnosticSeverity.Error,
    code: diag.code,
    source: "colt",
    message: diag.hint ? `${diag.message} (Hint: ${diag.hint})` : diag.message,
  };
}
```

---

## 6. Windows Build, Invocation & Distribution Guide

### Local Development Workflow (Windows)

#### Prerequisites
* Rust 1.85+ (`stable-x86_64-pc-windows-gnu` or `stable-x86_64-pc-windows-msvc`)
* Cargo

#### Build Commands
```powershell
# 1. Run all workspace tests (82 tests across 8 crates)
cargo test --workspace

# 2. Build optimized release binary
cargo build --release -p colt-cli

# 3. Output executable location:
# target\release\colt.exe (~5.2 MB)
```

#### Verification Invocation
```powershell
# Verify version
.\target\release\colt.exe version
# Output: colt 0.2.0

# Verify integration fixtures
.\target\release\colt.exe check --json fixtures\integration\valid.colt
.\target\release\colt.exe check --json fixtures\integration\invalid_syntax.colt
.\target\release\colt.exe check --json fixtures\integration\invalid_semantic.colt
.\target\release\colt.exe check --json fixtures\integration\invalid_capability.colt
```

### Packaging & Distribution with ColtStudio2

When distributing ColtStudio2:
1. Place precompiled `colt.exe` (Windows), `colt` (Linux/macOS) into the application's binary directory (e.g., `resources/bin/colt.exe` or `resources/app.asar.unpacked/bin/colt.exe`).
2. ColtStudio2 detects the executable path from:
   - User configuration setting: `colt.compilerPath`
   - Application bundled resources: `path.join(app.getAppPath(), "resources", "bin", "colt.exe")`
   - System `PATH`: fallback to `colt`
3. Execute via `child_process.spawn("colt", ["check", "--stdin", "--json"], { stdio: ["pipe", "pipe", "pipe"] })`.
