# Contributing

ColtaneDB is developed as a pnpm monorepo with TypeScript strict mode. Use Node.js 24 and the pnpm version pinned in `package.json`.

Before opening a change, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Add or update tests for behavior changes. Keep changes within the currently approved milestone; milestones and UI stages require owner approval before advancing.

Use conventional commit messages and small, focused commits. Record non-obvious architectural decisions in `docs/adr/`. Do not commit credentials, provider connection strings, or tenant data. Never access the Supabase project until the backup and scratch-restore procedure in `docs/RUNBOOK.md` is completed and confirmed by the owner.