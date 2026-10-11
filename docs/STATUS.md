# Project Status

Last updated: 2026-10-04

## Current milestone

Colt 0.2 & BYOD Engine-Centric Architecture — Tenancy archived to `archive/tenancy`. Engine-centric Bring Your Own Database (BYOD) model implemented with multi-store meld capability, `CONNECT` statements, `colt.toml` support, capability checks, and diagnostic expansion.

## Built

- Pinned Node.js 24 and pnpm 10.34.6 workspace foundation with frozen lockfile.
- TypeScript strict, ESLint, Vitest, and Turborepo monorepo configuration across `packages/*` (`parser`, `compiler`, `cli`, `tenant`, `api`, `api-types`).
- CI workflow for install, lint, typecheck, tests, and build.
- CLI binaries: both `colt` and `coltane` registered and executable (`check`, `fmt`, `plan`, `run`).
- Dual license established: Apache-2.0 for code ([`LICENSE`](../LICENSE)), Creative Commons Attribution 4.0 International for Colt spec ([`spec/LICENSE`](../spec/LICENSE)).
- **Colt 0.2 Language Core & Specification**:
  - Spec updated to Colt v0.2 ([`spec/SPEC.md`](../spec/SPEC.md), [`spec/CHANGELOG.md`](../spec/CHANGELOG.md), [`spec/grammar.ebnf`](../spec/grammar.ebnf)).
  - `#colt 0.2` pragma support with automatic migration hints for legacy v0.1 files.
  - Explicit infrastructure statements: `CONNECT <alias> AS <engine>(env("VAR"))` and `DEFAULT CONNECTION <alias>`.
  - Externalized project connection loading via `colt.toml` (`[connections.<alias>] engine, url_env`).
  - `@backend(alias)` bound to connection aliases rather than hardcoded provider brand names.
  - Secret safety: `env("VAR")` strictly enforced; literal credentialed URLs rejected with `COLT2023`.
  - Engine capability validation matrix (`postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`) enforcing feature constraints (e.g. rejecting HNSW on Redis via `COLT2026`).
  - Single-connection `ATOMIC` validation (`COLT2025`).
  - Cross-connection `link<T>` melds (non-transactional stitched query lookups).
  - Reserved `DEFINE MELD ... LINK | SYNC | CONSTRAINT` grammar under `COLT2003`.
  - Comprehensive language documentation written to [`DOCUMENTATION.md`](../DOCUMENTATION.md).
- **Archival of Tenancy (Plan Change)**:
  - Tenancy, partitioning, quotas, and spillover concepts cleanly preserved on git branch `archive/tenancy` and tagged `archive/tenancy-v0.1`.
  - Production `.env.local` kept completely intact without modification.
- Multi-Provider Adapters & Isolation (Preserved):
  - `MultiBackendStoreAdapter`, `RedisStoreAdapter`, `TursoStoreAdapter`, `SupabaseStoreAdapter`, `MongoStoreAdapter`, `FirestoreStoreAdapter`.
  - `FirebaseAdminAuthClient` verifying Google OAuth and Firebase ID tokens.
- M3 API Layer: Hono-based API (`packages/api`) with API key generation/hashing (`colt_...`), Firebase Auth integration, project management, rate limiter, limits profiles, and query executor.
- Official Python SDK (`coltanedb`): Version bumped to `0.2.0` (matching Colt 0.2). Added `coltanedb.guide(file=True/False)` exporting the official `COLT_GUIDE.md` language reference or printing clean text, `coltanedb.author()` displaying clickable terminal hyperlinks (OSC 8), `client.run(...)`, `client.from_file(...)`, and `QueryResult.meta`. Built distribution packages `coltanedb-0.2.0-py3-none-any.whl` and `coltanedb-0.2.0.tar.gz` verified with `twine check` (PASSED). Automated PyPI publishing workflow [`.github/workflows/publish-pypi.yml`](../.github/workflows/publish-pypi.yml) configured to execute on each `push` (running SDK test suite, build, twine check, and `skip-existing` publication via PyPI Trusted Publishing).
- **Editor Support & `.colt` File Standardization**:
  - Official VS Code / Cursor / VSCodium extension at [`editors/vscode`](../editors/vscode) with TextMate syntax grammar (`syntaxes/colt.tmLanguage.json`), smart bracket/comment configuration (`language-configuration.json`), code snippets (`snippets/colt.json`), and pre-packaged VSIX (`editors/vscode/colt-0.2.0.vsix`).
  - Compiler lexer enhanced to recognize and ignore first-line shebangs (`#!/usr/bin/env colt`).
  - Automated grammar test suite at [`tests/grammar.test.ts`](../tests/grammar.test.ts) preventing syntax regressions and validating language fixtures ([`tour.colt`](../editors/vscode/tests/fixtures/tour.colt), [`melds.colt`](../editors/vscode/tests/fixtures/melds.colt), [`shebang.colt`](../editors/vscode/tests/fixtures/shebang.colt)).
  - Root [`.gitattributes`](../.gitattributes) configured with `*.colt linguist-language=SQL` as the immediate GitHub syntax highlighting override.
  - OS desktop integration templates in [`os/`](../os): Linux MIME (`os/linux/colt.xml`) and `.desktop` launcher (`os/linux/colt-studio.desktop`), Windows registry association (`os/windows/colt-file-association.reg`), and macOS UTI `Info.plist.fragment` (`os/macos/Info.plist.fragment`).
  - Comprehensive guide authored at [`docs/EDITOR_SUPPORT.md`](../docs/EDITOR_SUPPORT.md) detailing local installation, GitHub Linguist 200+ repo requirement, Tree-sitter roadmap (Neovim, Helix, Zed), and OS file association steps.
- Dedicated Standalone Pages & Repository Policies:
  - Overhauled [`README.md`](../README.md) and [`DOCUMENTATION.md`](../DOCUMENTATION.md) fully aligned with "The Colt Language Reference" specification: 3-layer Meld Model (`Connections`, `Collections`, `Melds`), 3 kinds of melds (`LINK`, `SYNC`, `CONSTRAINT`), 4-way paradigm comparison matrix (SQL vs MongoDB vs Redis vs Colt), engines matrix, consistency guarantees, security model, and tooling.
  - `index.html`, `login.html`, `app.html`, `docs.html`, `privacy.html`, `404.html`, `PRIVACY.md`.
- Conformance & Diagnostic Coverage:
  - Added new conformance test suites covering Colt 0.2 multi-store meld, capability checks, connection aliases, and diagnostics (`COLT2021`–`COLT2027`).

## Run and test

```sh
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Current test suite: **173 tests passing across 16 test files** (conformance, compiler, parser, lexer, grammar, fuzz, adapters, provider-plugin, tenant-guard, tenant-manager, tenant-context, api, firebase, cross-tenant-leak, m4-console, foundation).

## Decisions

- **Product & Language**: Product is ColtaneDB; language and CLI are Colt / `colt` (with `coltane` binary alias). Source files use `.colt`.
- **Tenancy Archival**: Multi-tenant partitioning and quota spillover archived to branch `archive/tenancy` and tag `archive/tenancy-v0.1`.
- **BYOD Standard**: Engine-centric architecture (`postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`). Provider names (Neon, Supabase, Upstash) are optional configuration presets only.
- **Minimal Footprint**: Colt keeps a minimal, respectful footprint (`colt` schema in Postgres, `colt:` prefix in Redis, `colt_` prefix in Document/SQLite) and never touches user objects outside this namespace.
- **Secrets Policy**: Zero credentials in `.colt` files or committed config; `env("VAR")` is the sole connection string mechanism.
- **Atomic Transactions**: `ATOMIC` blocks are strictly single-connection only.
- **Cross-Connection Links**: Inter-backend links are classified as Melds (stitched lookups, non-transactional).

## Exact next step

Advance runtime query execution to support live asynchronous parallel driver execution and memory stitching for Colt 0.2 multi-store meld queries.
