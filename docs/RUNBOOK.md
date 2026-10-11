# Runbook

## M0 local checks

Use Node.js 24 and pnpm 10.34.6. Run `corepack pnpm install`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`.

## Neon project bootstrap

The owner-approved Neon setup is recorded in [ADR-0005](adr/0005-neon-project-bootstrap.md). The repository is linked to the requested production branch through the ignored `.neon` context file. The private `coltbucket` already existed; the `api` Function was deployed and verified as completed on Node 24.

Use `neon config plan --branch production` before changes, then `neon deploy --branch production --no-env-pull` to apply. Keep `--no-env-pull`: Neon otherwise writes generated branch variables to a local `.env` file. Do not use `neon env pull` unless the owner explicitly requests local credential materialization. The CLI keeps its authentication in the user's Neon CLI config, outside this repository.

## Supabase pre-access backup and restore gate

**Status: not performed. No Supabase credentials have been requested or used. M6 is blocked until the owner confirms completion in writing.** The Supabase project contains pre-existing production data and must not be touched before this gate is complete.

Before any ColtanDB code accesses Supabase, the owner must:

1. Take a full `pg_dump` using an approved secure connection path and save the dump in protected storage, not this repository.
2. Restore that dump to an isolated scratch Postgres instance using `pg_restore` (or the matching restore tool for the chosen dump format).
3. Verify restore success and compare row counts for the production schemas/tables that must remain untouched.
4. Record the date, tool versions, redacted commands, verification method/results, and scratch restore disposition below. Never record passwords, tokens, or connection strings.
5. Confirm the gate in writing before M6 begins.

Example command shapes only; not executed, and must be adapted to the owner's approved environment:

```sh
pg_dump --format=custom --file=protected-backup.dump "$SUPABASE_BACKUP_URL"
pg_restore --exit-on-error --dbname="$SCRATCH_DATABASE_URL" protected-backup.dump
```

### Owner verification record

- Date: pending
- `pg_dump` / PostgreSQL client versions: pending
- Backup location and retention (no secret or public URL): pending
- Scratch restore target and result: pending
- Row-count verification method and result: pending
- Owner confirmation: pending

## Incident and credential handling

Provider secrets belong in the deployment secret store or a local ignored environment file. If exposed, revoke/rotate immediately, inspect access logs, and record the incident without copying the secret into logs or this repository. Keep tenant data out of operator views and diagnostic output.