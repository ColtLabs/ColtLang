# Provider Capacity and Verification

Checked on 2026-10-01. This ledger separates verified facts from initial assumptions. Recheck provider limits and pricing before enabling real tenants; provider tiers and capabilities change.

| Provider / topic | Finding | Evidence / status |
| --- | --- | --- |
| Vercel Node.js runtime | Node.js 24.x is listed as available and default; Node 24 LTS is supported for functions and builds. | Verified against [Vercel supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) on 2026-09-30. |
| pnpm / Node compatibility | pnpm's current compatibility table includes Node.js 24. | Verified against [pnpm installation docs](https://pnpm.io/installation) on 2026-09-30. |
| Vercel Node server/config | Vercel auto-detects a root `server.ts` Node entrypoint. `functions.<path>.includeFiles` bundles runtime-read assets; `.vercelignore` controls uploaded files. | Verified against [Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json), and [.vercelignore](https://vercel.com/docs/deployments/vercel-ignore) docs on 2026-10-01. |
| GitHub Actions Node runtimes | `actions/checkout@v7`, `actions/setup-node@v7`, `actions/setup-python@v7`, and `pnpm/action-setup@v6` use Node 24 runtimes. | Verified against the official action metadata/readmes on 2026-10-01. |
| Neon CLI/config | `neon` CLI 7.0.1; `@neon/config` 1.8.3 supports top-level `buckets` and `functions`; `preview` is deprecated. `neon deploy` applies `neon.ts` to the linked branch. | Versions checked from npm and behavior verified against [Neon CLI install](https://neon.com/docs/cli/install), [CLI config](https://neon.com/docs/cli/config), and [`neon.ts` reference](https://neon.com/docs/reference/neon-ts) on 2026-09-30. |
| Neon project bootstrap | Existing `coltbucket` is private. Function `api` deployment 1 is completed on the `production` branch with runtime `nodejs24`. | Verified with `neon buckets list` and `neon functions get` on 2026-09-30. No environment pull was performed. |
| Neon capacity; Supabase, Atlas, Firestore, Upstash, R2, D1 | Limits, pricing, capacity ceilings, and capability details not yet verified. Only the owner-approved Neon project bootstrap was accessed; other providers remain untouched. | Defer to the relevant adapter milestone. Supabase additionally remains blocked on its backup/restore gate. |

Do not infer free-tier capacity from old values. Before accepting users, record the actual operator plan, shared-resource ceilings, quota headroom, and alert thresholds for each provider. Supabase remains blocked until the owner records backup and restore verification in `docs/RUNBOOK.md`.