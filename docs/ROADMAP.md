# Roadmap

Milestones are sequential and owner-gated. Do not start the next milestone before approval. UI Stage 0 starts at M4.

| Milestone | Scope | Acceptance |
| --- | --- | --- |
| M0 | Monorepo, tooling, CI, license, briefs, status, ADRs | Install, test, and build pass locally and in CI |
| M1 | Colt v0.1 spec, grammar, lexer, parser, semantics, capability interface, Postgres Tier-1 codegen, CLI | 40+ conformance cases pass; parser fuzzing has no unhandled exceptions |
| M2 | TenantGuard, TenantManager, catalog, Neon adapter, in-memory fakes | Cross-tenant leak tests pass for supported query shapes |
| M3 | Hono API, auth, invite gate, API keys, project execution, limits, usage, kill switch | Invited user creates project and uses Colt via API; tag v0.1.0 |
| M4 | UI Stages 0–4: foundations, shell, access, Overview, Data, Query | User can onboard, edit schema, insert, and query in browser |
| M5 | Redis, QStash outbox, cache, reconciliation, rebuild | Cache invalidation and drift repair proven in tests |
| M6 | Supabase adapter and safety rules | Safety tests pass; pre-existing data unchanged; tag v0.5.0. **Blocked pending backup/restore confirmation.** |
| M7 | R2/Blob, quotas, signed URLs, Storage screen | Upload, download, quotas, and prefix leak tests pass |
| M8 | MongoDB primary adapter and change streams | Contract and aggregation leak tests pass |
| M9 | Firestore adapter and restrictions | Contract/leak tests pass; unsupported operations have coded errors |
| M10 | Cross-backend planner, semi-joins, capability fallbacks, Plan UI | Cross-backend tests pass; non-transactional warnings are clear |
| M11 | Vector, graph, time-series, LIVE, D1 replica | Combined queries work; live policy checks prevent leaks |
| M12 | Schema designer, placement, sync, export/deletion, admin | Export/deletion verification and audited admin actions work |
| M13 | Docs site, self-host guide, security/load/restore hardening, legal | v1.0 definition of done is met; tag v1.0.0 |

If scope must shrink, follow the priority order in `docs/PROJECT_BRIEF.md` and the full owner-provided brief.