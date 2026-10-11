# Project Status

Last updated: 2026-10-11

## Current milestone

ColtLang Standalone Language Core Extraction — Pruned database, server runtime, Python SDK, and Web UI bloat from the legacy ColtaneDB monolith. Repository is now ColtLang, the standalone official home for the Colt language specification, AST, lexer, grammar, and compiler.

## Built

- Pinned Node.js 24 and pnpm 10.34.6 workspace foundation with frozen lockfile.
- Rebranded workspace package to `@coltlabs/coltlang`.
- Cleaned `package.json`, `pnpm-workspace.yaml`, and `turbo.json` removing references to deleted web services and server scripts.
- Pruned database, server runtime, and UI bloat:
  - Removed `python/` directory (moving to standalone SDK repository).
  - Removed `src/` directory.
  - Removed `os/` directory.
  - Removed cloud/hosting configurations: `firebase.json`, `firebase.ts`, `firestore.rules`, `firestore.indexes.json`, `vercel.json`, `neon.ts`, `server.ts`, `hello.ts`, `.firebaserc`, `.vercelignore`.
  - Removed standalone web HTML and portal assets: `app.html`, `login.html`, `index.html`, `docs.html`, `privacy.html`, `404.html`, `site.webmanifest`, `sitemap.xml`, `robots.txt`.
- Preserved language core intact:
  - `spec/`: Formal language specification ([`spec/SPEC.md`](../spec/SPEC.md)), changelog ([`spec/CHANGELOG.md`](../spec/CHANGELOG.md)), and formal EBNF grammar ([`spec/grammar.ebnf`](../spec/grammar.ebnf)).
  - `packages/`: Parser, AST, lexer, semantic compiler, and CLI (`@coltanedb/parser`, `@coltanedb/compiler`, `@coltanedb/cli`).
  - `editors/vscode/`: Visual Studio Code extension with TextMate grammar, language configuration, and snippets.
  - `examples/`: Sample `.colt` source files (`examples/library.colt`).
- Overhauled [`README.md`](../README.md) to define ColtLang as the official language specification, AST, and parser for Colt, stripping out database hosting presets and web UI studio documentation while keeping complete language reference and Meld Model architecture.
- Verified test suite: 171 tests passing across 15 test suites with zero typecheck or lint errors.

## Run and test

```sh
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Current test suite: **171 tests passing across 15 test files** (conformance, compiler, parser, lexer, grammar, fuzz, adapters, provider-plugin, tenant-guard, tenant-manager, tenant-context, api, firebase, cross-tenant-leak, foundation).

## Decisions

- **Product & Language**: Product is ColtLang; language and CLI are Colt / `colt`. Source files use `.colt`.
- **Standalone Focus**: Dedicated purely to language grammar, parsing, type checking, AST representation, and language tooling.
- **Minimal Footprint**: Colt keeps a minimal, respectful footprint (`colt` schema in Postgres, `colt:` prefix in Redis, `colt_` prefix in Document/SQLite) and never touches user objects outside this namespace.
- **Secrets Policy**: Zero credentials in `.colt` files or committed config; `env("VAR")` is the sole connection string mechanism.
- **Atomic Transactions**: `ATOMIC` blocks are strictly single-connection only.
- **Cross-Connection Links**: Inter-backend links are classified as Melds (stitched lookups, non-transactional).

## Exact next step

Package and distribute standalone `@colt/parser` and `@colt/compiler` builds and publish syntax highlighting extension updates.

