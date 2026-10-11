# Colt Specification Changelog

## v0.2 (2026-10-04)

- **SPEC CHANGE**: `@backend` now takes a declared connection alias, never a provider name.
- Added `CONNECT <alias> AS <engine>(env("VAR"))` supporting engines `postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`. Connection strings must use `env("VAR")`; literal credential URLs are a compile error (`COLT2023`). Duplicate aliases are rejected (`COLT2022`).
- Support connection declarations via `colt.toml` (`[connections.<alias>] engine, url_env`).
- Added `DEFAULT CONNECTION <alias>`. Exactly one declared connection serves as an implicit default; multiple declared connections require `DEFAULT CONNECTION` or explicit `@backend(alias)` (`COLT2024`).
- Capability checks are enforced against the connection's engine (`COLT2026`).
- Cross-connection `link<T>` creates an automatic "meld" (stitched lookup, non-transactional).
- `ATOMIC` blocks are restricted to a single connection; mixed connection blocks are rejected (`COLT2025`).
- Reserved `MELD` syntax: `DEFINE MELD ... LINK | SYNC | CONSTRAINT` (`COLT2003`).
- Added `#colt 0.2` pragma; v0.1 files with undeclared aliases receive a migration hint (`COLT2021`).
- **PLAN CHANGE**: Transitioned to engine-centric Bring Your Own Database (BYOD) model. Removed tenancy, partitions, shared quotas, and spillover from active specification and docs, preserving original tenancy architecture on git branch `archive/tenancy` (tagged `archive/tenancy-v0.1`).

## v0.1 (2026-09-30)

- Initial normative M1 Tier-1 language contract and EBNF.
- Records owner decisions from ADR-0004: mutation semantics, optional fields, null comparisons, deletion safeguards, and reserved later-stage syntax.