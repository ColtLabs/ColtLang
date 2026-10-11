# Repository instructions

- Follow the active milestone in `docs/STATUS.md`; do not start a later milestone or UI stage without owner approval.
- Read `docs/PROJECT_BRIEF.md`, `docs/UI_BRIEF.md`, and relevant ADRs before changing behavior.
- The product is ColtaneDB; the language and CLI are Colt / `colt`; source files use `.colt`.
- Do not invent provider APIs. Verify current official documentation and record dated findings in `docs/CAPACITY.md`.
- Never put credentials in source, logs, fixtures, or committed environment files. Use `.env.example` placeholders only.
- Supabase access is blocked until the owner documents a successful full backup and scratch restore in `docs/RUNBOOK.md`.
- Keep TypeScript strict and run lint, typecheck, tests, and build for changes that affect them.
- Update `docs/STATUS.md` at the end of each work session with progress, checks, blockers, decisions, and the exact next step.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
