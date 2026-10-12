# Colt Toolchain Protocol (CTP)

Version: 1.0  
Status: Normative  
Target: `colt` executable (`crates/colt-cli`)

## 1. Purpose

The Colt Toolchain Protocol (CTP) specifies the machine-readable interaction contract between the `colt` CLI and external developer tools, editors (including ColtStudio2 and VS Code), and CI/CD pipelines.

## 2. Process Exit Codes

| Exit Code | Meaning | Behavior |
| :--- | :--- | :--- |
| `0` | Success | Operation completed cleanly; no errors encountered. |
| `1` | Syntax or Semantic Error | Program contains one or more diagnostic errors. Structured diagnostics emitted to `stderr` or stdout (if `--json`). |
| `2` | I/O or Configuration Error | Target file missing, invalid permissions, or corrupted configuration. |

## 3. Machine-Readable Handshake (`colt version --json`)

External tools negotiate capabilities using `colt version --json`:

```json
{
  "name": "colt",
  "version": "0.2.0",
  "protocolVersion": "1",
  "capabilities": {
    "check": true,
    "plan": true,
    "fmt": true,
    "parse": true,
    "lex": true,
    "jsonOutput": true,
    "stdin": true
  }
}
```

## 4. Structured Diagnostics Format (`--json`)

When invoked with `--json`, diagnostic arrays follow a uniform flat schema:

```json
[
  {
    "file": "example.colt",
    "line": 4,
    "column": 1,
    "endLine": 4,
    "endColumn": 45,
    "severity": "error",
    "code": "COLT2023",
    "message": "Connection url cannot contain literal credentials; use env(\"VAR\") instead",
    "hint": "Replace literal connection string with env(\"DATABASE_URL\")",
    "span": {
      "startLine": 4,
      "startColumn": 1,
      "endLine": 4,
      "endColumn": 45
    }
  }
]
```

## 5. Editor Buffer Formatting (`colt fmt --stdin --json`)

Editors pipe unsaved buffer content directly through stdin:
```bash
colt fmt --stdin --json
```

Output:
```json
{
  "source": "<stdin>",
  "changed": true,
  "formatted": "#colt 0.2\n\nCONNECT main AS postgres(env(\"DATABASE_URL\"))\n"
}
```
If formatting fails due to syntax errors, exit code is `1` and structured diagnostics are returned.
