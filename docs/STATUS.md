# Project Status

Last updated: 2026-10-11

## Current milestone

ColtLang Rust-Native Migration — Phase 0 & Phase 1 Complete. Full repository audit, language contract inventory, baseline timing, and crate architecture established. Waiting for user approval of migration plan before Phase 2.

## Built

- Completed initial language core extraction from legacy monolith.
- Performed comprehensive Phase 0 audit: language contracts, AST node serialization, 31 diagnostic codes (`COLT1001`–`COLT2027`), CLI behavior, and remaining Firebase/runtime references.
- Froze baseline metrics and compatibility test suite (171 passing tests across 15 suites).
- Pinned toolchain prerequisites: `rustc 1.99.0`, `cargo 1.99.0`.
- Authored formal migration plan artifact: `migration_plan_and_baseline.md`.

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
- **Zero Language Redesign**: Grammar, syntax, AST node structures, diagnostic codes, and execution plans are strictly preserved.
- **Reference Oracle Strategy**: The TypeScript implementation remains untouched as an executable oracle until 100% differential parity is proven across the golden fixture suite.
- **`DEFINE MELD` Preservation**: Consistent with existing parser behavior, `link<T>` inside collection definitions is fully supported, while statement-level `DEFINE MELD` is parsed as reserved emitting `COLT2003`.
- **Clean Toolchain Separation**: ColtLang owns language specification, parsing, typechecking, AST, formatting, diagnostics, and CLI. ColtaneDB owns database execution and drivers.

## Exact next step

Obtain user approval on `migration_plan_and_baseline.md` to begin Phase 2: establish Cargo workspace (`colt-span`, `colt-diagnostics`, `colt-lexer`), generate golden fixture snapshots, and implement core crates.

