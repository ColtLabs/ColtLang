# Colt Language Server Profile (CLSP)

Version: 1.0  
Status: Grounded Specification  
Standard: Built upon Microsoft Language Server Protocol (LSP) 3.17

## 1. Purpose

The Colt Language Server Profile (CLSP) defines how language server implementations (`colt-lsp`) communicate with IDEs (ColtStudio2, VS Code, Neovim) using standard LSP JSON-RPC 2.0 messages over stdin/stdout, supplemented with Colt-specific capabilities.

## 2. Server Capabilities

A conformant `colt-lsp` server negotiates:

```json
{
  "capabilities": {
    "textDocumentSync": {
      "openClose": true,
      "change": 1
    },
    "diagnosticProvider": {
      "interFileDependencies": true,
      "workspaceDiagnostics": false
    },
    "documentFormattingProvider": true,
    "hoverProvider": true,
    "definitionProvider": true
  }
}
```

## 3. Grounded Diagnostics Mapping

Every compiler diagnostic maps to an LSP `Diagnostic` structure:

| Colt Diagnostic Field | LSP Field | Mapping / Transformation |
| :--- | :--- | :--- |
| `line` / `column` | `range.start` | 1-indexed to 0-indexed conversion (`line - 1`, `column - 1`) |
| `endLine` / `endColumn` | `range.end` | 1-indexed to 0-indexed conversion |
| `severity` | `severity` | `error` → 1, `warning` → 2, `info` → 3, `hint` → 4 |
| `code` | `code` | Stable string code (`"COLT2012"`) |
| `message` | `message` | Human-readable message text |
| `source` | `source` | Fixed string: `"colt"` |

## 4. File and Workspace Synchronization

1. **`.coltignore` Enforcement**: The server skips indexing files and directories listed in `.coltignore` (such as `node_modules/`, `target/`, `dist/`).
2. **Cancellation**: If a new `textDocument/didChange` arrives before validation finishes, pending analysis is canceled to preserve UI responsiveness.
3. **Multi-Connection Catalog**: Collections across declared connections (`CONNECT`) are indexed into a unified workspace symbol table for cross-file link resolution.
