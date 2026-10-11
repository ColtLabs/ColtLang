# ColtaneDB Project Brief

This repository-local brief records the approved product baseline from the owner-provided v1.0 brief and ADR-0004. The full v1.0 target is staged; it is not a claim that those features are implemented.

## Product

ColtaneDB is an open-source, web-first backend platform built around **Colt**, a custom query language. The product is a language, compiler, control plane, and query router over existing databases, not a storage engine. Its tagline is “One language for every kind of data.” Product name: **ColtaneDB**. Language and CLI: **Colt** and `colt`. Source extension: **`.colt`**. Diagnostics use `COLT####`.

Supported models are relational, document, key-value, vector, graph, and time-series, subject to each adapter's verified capabilities. Each collection has exactly one primary backend; other stores are derived projections. Cross-backend links are batched lookups and are not transactional. `ATOMIC` is single-primary only.

## Fixed provider boundary

The operator owns one shared resource per provider; ColtaneDB creates tenant namespaces inside those resources and must not create provider projects. The v1 provider set is Neon Postgres, the existing Supabase Postgres project, MongoDB Atlas, Firestore, Upstash Redis, Cloudflare R2, Upstash Blob, Cloudflare D1 as an opt-in read replica, Upstash QStash, Upstash Workflow, and Vercel. No Appwrite, Turso, or additional Neon products before 1.0.

Supabase contains pre-existing production data. No Supabase credential may be provided or used until a full `pg_dump` has been restored to scratch Postgres, row counts have been checked, and dated commands and results are recorded in `docs/RUNBOOK.md`. M6 remains blocked until the owner confirms completion.

## Core architecture and security

The system is a TypeScript pnpm/Turborepo monorepo with a Node.js API, a web console, Colt compiler packages, adapters, SDKs, and CLI. Colt source passes through lexing, parsing, semantic analysis, planning, and code generation. The compiler does not execute queries or concatenate user values into query text. All adapter calls require tenant context and pass through TenantGuard. Isolation is database-enforced where possible and strictly tested in code-enforced adapters. Policies deny by default.

Invite-only signup, per-project limits and metering, a global kill switch, tenant export/deletion workflows, audit logs, and leak tests are core product requirements. Provider secrets remain in deployment secret stores, never in the catalog or client bundles. Real-user data is prohibited until backup restore, legal, and security gates are complete.

## Milestones

M0: monorepo, tooling, CI, license, documentation, and ADRs.
M1: Colt v0.1 language specification and Tier-1 language/compiler subset.
M2: tenant guard/manager, catalog, Neon adapter, and leak tests.
M3: API, authentication/access gate, project execution, limits, and usage.
M4: console Stage 0–4; UI work begins here, not in M0–M3.
M5–M13: Redis/sync, Supabase (blocked), files, MongoDB, Firestore, cross-backend planning, advanced query models, administration, and hardening.

Milestones are gated. Do not start the next milestone until the owner approves. See `docs/ROADMAP.md` for acceptance criteria and `docs/STATUS.md` for the active step.

## Language baseline

The initial language decisions and owner amendments are recorded in `docs/adr/0004-language-and-project-decisions.md`. Only Tier-1 syntax is normative in M1. Later constructs are reserved, not represented by placeholder AST nodes, until their milestone. Amendments to the language contract belong in `spec/CHANGELOG.md` once the spec exists.