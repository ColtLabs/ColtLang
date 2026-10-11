# Colt Language Support for Visual Studio Code

Official Visual Studio Code extension for **Colt** (ColtLang, `.colt`) and **ColtaneDB**.

*Conceived and created by **Ayush Bhattacharya**.*

---

## Features

- **Rich Syntax Highlighting**: Full TextMate grammar support for Colt 0.2, including `#colt` pragma, first-line shebangs (`#!/usr/bin/env colt`), `CONNECT`, `DEFAULT CONNECTION`, `DEFINE COLLECTION`, `DEFINE MELD`, `LINK`, `SYNC`, `CONSTRAINT`, `FIND`, `PUT`, `CREATE`, `DELETE`, `ATOMIC`, types, annotations (`@key`, `@unique`, `@backend`), durations, and comments.
- **Language Identification**: Automatically associates `.colt` files with the `Colt` language mode.
- **Bracket Matching & Auto-Closing**: Automatic pair closing for braces `{}`, brackets `[]`, parentheses `()`, and quotes `""`.
- **Comment Toggling**: Line comments `--` (`Ctrl+/` or `Cmd+/`) and block comments `/* ... */`.
- **Snippets**: Productivity snippets for collections, connections, melds, queries, and mutations.

---

## Installation

### Method 1: Install from VSIX (Local / Codespaces)
1. Run `npx @vscode/vsce package` inside this directory to generate `colt-0.2.0.vsix`.
2. In VS Code or GitHub Codespaces, press `Ctrl+Shift+P` (or `Cmd+Shift+P`), type **Extensions: Install from VSIX...**, and select the generated file.

### Method 2: Visual Studio Marketplace & Open VSX
Search for **Colt Language Support** (`itsjustayush.colt`) in the Extensions Marketplace and click **Install**.

---

## License

Apache-2.0 © Ayush Bhattacharya & ColtaneDB Team
