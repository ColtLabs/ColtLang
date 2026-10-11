# ADR-0004: Language and Project Decisions

- Status: Accepted by owner
- Date: 2026-09-30
- Supersedes conflicting defaults in the original brief where stated below.

## Decisions

1. Product name is **ColtaneDB**. Language and CLI are **Colt** / `colt`; extension is **`.colt`**; diagnostic prefix remains `COLT####`.
2. Preserve the brief's keywords and examples except amendments here. Record later language changes in `spec/CHANGELOG.md`.
3. M1's normative grammar is Tier-1 only. Later keywords such as `NEAREST`, `WINDOW`, `SINCE`, `LIVE`, `RELATE`, `FETCH`, and edge paths are reserved; use returns `COLT2003` (“construct reserved, planned for M<n>”). The spec may document later grammar informatively, but no AST nodes are added before the relevant milestone.
4. `PUT collection:key { ... }` creates or replaces the whole record by explicit id and is idempotent. `CREATE collection[:key] { ... }` is insert-only, conflicts if the id exists, and generates a UUID key when omitted for UUID-keyed collections. `UPDATE ... MERGE` is reserved. PUT/CREATE return the stored record with defaults applied and `{ created: boolean }`.
5. Fields are required by default; `T?` makes a field optional. Missing optional and explicit null read identically. Comparisons are two-valued: `null == null` is true; `null == x` is false; ordered comparisons with null are false. `@default(expr)` applies only when absent, is evaluated once per statement using UTC server time at microsecond precision, and is bound as a parameter. `@readonly` is set at creation, preserved by PUT, and cannot be changed.
6. M1 supports `DELETE coll:id` and `DELETE coll WHERE <expr>`. Bare collection deletes and WHERE clauses constant-folding to true are coded errors. Return `{ deleted: n }`; missing records produce zero. Whole-collection clearing is a separate confirmed console/CLI action.
7. M1 reserves FETCH for M10. `link<T>` is single; `list<link<T>>` is many. Dangling single links resolve to null; dangling list members are omitted; metadata reports dangling count. v1 fetch depth is one. Doc paths include `a.b.c` and `a.b[0]`; missing paths or indexing non-objects produce null. Paths on non-doc columns are semantic errors. There is no implicit coercion; number/string comparisons are false. Null sorts last for both directions; adapters emulate or return a capability error.
8. M1 parses `ATOMIC` and plans a transaction for one Postgres primary; execution begins in M2/M3. Cross-backend blocks and blocks containing unimplemented statements (such as RELATE) are coded errors.
9. No Appwrite or Turso adapters before 1.0. The owner later explicitly approved a one-time Neon project bootstrap for the `coltbucket` private bucket and `api` function; see ADR-0005. This bootstrap does not add Neon object storage/functions to ColtaneDB's v1 adapter contract. Supabase access is blocked until the owner records a full pg_dump, scratch restore, row-count verification, commands, and date in `docs/RUNBOOK.md`, then confirms completion in writing. Use PGlite/local Postgres until then; M6 is blocked.
10. Use pnpm 10 pinned through `packageManager` and Corepack; Node 24 LTS is pinned in `.nvmrc`, package engines, and CI. Vercel support was verified in M0; revisit when Node 26 becomes LTS. UI Stage 0 starts at M4; M0–M3 are API and CLI only.

## Consequences

The language spec and tests must distinguish normative M1 syntax from reserved later syntax. Mutation, null, and deletion rules must be reflected consistently in semantics, planning, and adapter contracts. Provider access and UI implementation remain milestone-gated.