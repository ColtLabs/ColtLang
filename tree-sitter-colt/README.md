# tree-sitter-colt

Tree-sitter grammar and parser for **ColtLang** (`.colt`), the unified declarative query and data-definition language.

## Overview

This package defines the formal Tree-sitter grammar for Colt source code (`.colt`). It is used for:
- Fast, incremental syntax highlighting in editors (Neovim, Helix, Zed, VS Code).
- Upstream submission to [GitHub Linguist](https://github.com/github/linguist) for native syntax highlighting and language statistics on GitHub.
- Structural AST parsing across C, Rust, Node.js, and WASM.

## Grammar Highlights

Supports all ColtLang v0.2 constructs:
- **Connection Declarations:** `CONNECT <alias> AS <engine>(env("..."))`, `DEFAULT CONNECTION <alias>`
- **Collection Declarations:** `DEFINE COLLECTION <name> STRICT|FLEXIBLE { ... }`
- **Meld Primitives:** `DEFINE MELD <name> { LINK ... TO ..., SYNC ... TO ..., CONSTRAINT ... }`
- **Queries & Mutations:** `FIND ... SELECT ... WHERE ... ORDER BY ... LIMIT ...`, `PUT`, `CREATE`, `DELETE`, `ATOMIC`
- **Advanced Primitives:** `VECTORIZE`, `STREAM`, `MASK`, `REDACT`, `EXPIRE`, `RESOLVE`, `FALLBACK`

## Building and Testing

Prerequisites: Node.js and a C/C++ compiler.

```bash
# Install dependencies
npm install

# Generate C parser from grammar.js
npx tree-sitter generate

# Run parsing tests against example files
npx tree-sitter test
```

## GitHub Linguist Submission Guide

To enable native `.colt` syntax highlighting and language recognition on GitHub:

1. **Verify Usage Requirements:** Ensure demonstratable usage across public repositories.
2. **Submit PR to `github/linguist`:**
   Add Colt to `languages.yml`:
   ```yaml
   Colt:
     type: programming
     color: "#10B981"
     extensions:
       - ".colt"
     tm_scope: source.colt
     ace_mode: text
     language_id: <assigned-by-github>
   ```
3. Add `tree-sitter-colt` to `vendor/grammars/` or the Tree-sitter submodule manifest.
