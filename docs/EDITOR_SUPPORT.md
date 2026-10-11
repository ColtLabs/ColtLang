# Editor Support & `.colt` File Standardization

This document details how `.colt` files are recognized, highlighted, and standardized across code editors, version control platforms, and desktop operating systems.

---

## 1. Why `.colt` Files Need Registration

A file extension is simply a string suffix. Operating systems, code editors, and code-hosting platforms (such as GitHub) maintain internal mapping tables that associate extensions with language grammars and default handlers.

Until `.colt` is explicitly registered in those tables, editors and platforms fall back to treating it as plain text (`text/plain`). ColtaneDB standardizes `.colt` support across four tiers:

1. **VS Code / Cursor / VSCodium**: Official TextMate grammar extension and snippets (`editors/vscode`).
2. **GitHub Linguist**: Immediate SQL-compatible fallback via `.gitattributes`, plus roadmap to 200+ repository upstream inclusion.
3. **Tree-sitter Ecosystem**: Grammar roadmap for Neovim, Helix, and Zed.
4. **Operating Systems**: MIME and file association descriptors for Linux, Windows, and macOS (`os/*`).

---

## 2. VS Code, Cursor & VSCodium Extension

The official Colt extension is located in the [`editors/vscode`](../editors/vscode) directory.

### Features
- **Grammar**: TextMate grammar ([`colt.tmLanguage.json`](../editors/vscode/syntaxes/colt.tmLanguage.json)) supporting `#colt` version pragmas, shebangs (`#!/usr/bin/env colt`), connection definitions (`CONNECT ... AS ...`), queries (`FIND`, `PUT`, `UPDATE`, `DELETE`, `ATOMIC`), melds (`DEFINE MELD`), annotations (`@backend`, `@primary`, `@index`, `@ttl`), and primitive/complex types.
- **Language Configuration**: Smart bracket closing, auto-indentation, and comment toggling for single-line (`--`) and multi-line (`/* ... */`) comments.
- **Snippets**: Quick scaffolding for pragmas, connections, collections, queries, and atomic blocks.
- **First-line matching**: Automatically activates Colt mode for any file beginning with `#colt` or `#!/usr/bin/env colt`, even before saving with a `.colt` extension.

### Installing the VSIX Locally

A ready-to-install package is generated at `editors/vscode/colt-0.2.0.vsix`.

#### Via Command Line:
```sh
# For VS Code:
code --install-extension editors/vscode/colt-0.2.0.vsix

# For Cursor:
cursor --install-extension editors/vscode/colt-0.2.0.vsix

# For VSCodium:
codium --install-extension editors/vscode/colt-0.2.0.vsix
```

#### Via Editor GUI:
1. Open the **Extensions** panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Click the `...` menu (Views and More Actions) in the top-right of the Extensions panel.
3. Select **Install from VSIX...**.
4. Browse to `editors/vscode/colt-0.2.0.vsix` and select it.

#### Building the VSIX from Source:
```sh
cd editors/vscode
npx @vscode/vsce package
```

*(Note: Publishing to Visual Studio Marketplace and Open VSX requires an active publisher account and personal access token, and will only be performed after explicit project confirmation).*

---

## 3. GitHub & GitHub Linguist Highlighting

GitHub utilizes [Linguist](https://github.com/github-linguist/linguist) to detect programming languages, calculate repository language statistics, and apply syntax highlighting.

### Immediate Solution: `.gitattributes`
Until Colt is upstreamed into Linguist's official language registry, our root [`.gitattributes`](../.gitattributes) overrides syntax highlighting:

```gitattributes
# GitHub Linguist override for Colt files (fallback to SQL until Colt is upstreamed in linguist)
*.colt linguist-language=SQL
```

This ensures that GitHub immediately renders keywords, comments, strings, and operators in `.colt` files with high-contrast syntax highlighting on web diffs, pull requests, and file trees.

### Upstreaming to Linguist (200+ Repository Requirement)
Linguist requires that any new language be in use in at least **200 distinct, non-fork public GitHub repositories** before an upstream pull request to `languages.yml` will be accepted.

Once ColtaneDB reaches this milestone, a pull request will be submitted upstream adding:
```yaml
Colt:
  type: programming
  color: "#4f46e5"
  extensions:
    - .colt
  tm_scope: source.colt
  ace_mode: sql
  codemirror_mode: sql
  language_id: <assigned_by_linguist>
```

---

## 4. Tree-sitter Roadmap (Neovim, Helix, Zed)

Modern modal and native editors rely on [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) for concrete syntax tree parsing rather than regular expression-based TextMate grammars.

### Planned Architecture: `tree-sitter-colt`
- **Grammar Definition**: Based on the canonical EBNF specification in [`spec/grammar.ebnf`](../spec/grammar.ebnf).
- **Queries**:
  - `highlights.scm`: Syntax highlighting queries for keywords, types, strings, and operators.
  - `folds.scm`: Code folding for collections, queries, and atomic blocks.
  - `indents.scm`: Indentation rules.

### Target Editor Integrations:
1. **Neovim**:
   Add filetype detection in `~/.config/nvim/lua/filetype.lua`:
   ```lua
   vim.filetype.add({
     extension = {
       colt = 'colt',
     },
   })
   ```
2. **Helix**:
   Add to `languages.toml`:
   ```toml
   [[language]]
   name = "colt"
   scope = "source.colt"
   injection-regex = "colt"
   file-types = ["colt"]
   roots = ["colt.toml", ".git"]
   comment-token = "--"
   grammar = "colt"
   ```
3. **Zed**:
   Create a Zed Extension referencing the WebAssembly compilation of `tree-sitter-colt`.

---

## 5. Operating System File Associations

Pre-configured OS integration templates are provided in the [`os/`](../os) directory.

### Linux (FreeDesktop / GNOME / KDE)
1. **MIME Type Definition** ([`os/linux/colt.xml`](../os/linux/colt.xml)):
   ```sh
   # Install the MIME type for current user
   xdg-mime install --novendor os/linux/colt.xml
   update-mime-database ~/.local/share/mime
   ```
2. **Desktop Application Launcher** ([`os/linux/colt-studio.desktop`](../os/linux/colt-studio.desktop)):
   - Open [`os/linux/colt-studio.desktop`](../os/linux/colt-studio.desktop) and replace `<PATH_TO_COLT_STUDIO>` with the actual path to your Colt Studio executable or wrapper script.
   - Copy to applications directory and associate:
     ```sh
     cp os/linux/colt-studio.desktop ~/.local/share/applications/
     xdg-mime default colt-studio.desktop text/x-colt
     update-desktop-database ~/.local/share/applications
     ```

### Windows
1. Open [`os/windows/colt-file-association.reg`](../os/windows/colt-file-association.reg).
2. Replace `<PATH_TO_COLT_STUDIO>` with the escaped absolute path to your executable (e.g., `C:\\Program Files\\ColtStudio\\colt-studio.exe`).
3. Double-click the `.reg` file or run from an elevated PowerShell / Command Prompt:
   ```cmd
   reg import os\windows\colt-file-association.reg
   ```

### macOS
1. Open [`os/macos/Info.plist.fragment`](../os/macos/Info.plist.fragment).
2. Replace `<REVERSE_DNS_DOMAIN>` with your organization domain (e.g., `coltanedb` or `io.coltane`).
3. Merge the `<key>CFBundleDocumentTypes</key>` and `<key>UTExportedTypeDeclarations</key>` dictionaries into your macOS app's `Contents/Info.plist`.
4. Rebuild the Launch Services database:
   ```sh
   /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/ColtStudio.app
   ```

---

## 6. Grammar & Parser Test Suite

To prevent syntax regressions between the compiler lexer/parser and editor grammars, an automated test suite is maintained at [`tests/grammar.test.ts`](../tests/grammar.test.ts).

Run the grammar test suite with:
```sh
npx vitest run tests/grammar.test.ts
```

This test suite continuously verifies:
1. Integrity of the TextMate JSON structure and regex compilability.
2. Tokenization and pattern matching across keywords, types, and annotations.
3. Conformance of language fixtures ([`tour.colt`](../editors/vscode/tests/fixtures/tour.colt), [`melds.colt`](../editors/vscode/tests/fixtures/melds.colt), and [`shebang.colt`](../editors/vscode/tests/fixtures/shebang.colt)) against the Colt compiler lexer and parser.
