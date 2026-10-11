# ColtaneDB UI Brief

This is the repository-local baseline for the owner-provided console brief. UI implementation begins at **M4 / UI Stage 0**; M0–M3 are API and CLI only. The console must not be started early.

## Product and visual direction

The console is a dense, calm, keyboard-first developer instrument. The supplied “Graphite” direction uses graphite neutrals, hairline borders, restrained depth, one warm accent, Geist Sans/Mono, and lucide icons. Dark is the default with a complete light theme, system preference support, explicit override, and comfortable/compact density. Meet WCAG 2.2 AA, honor reduced motion, and keep the initial shell under 200 KB gzipped. Do not use provider logos or expose credentials and connection strings.

The owner requested Supabase-like familiarity for the dashboard, landing page, database user experience, and editor. Interpret this as familiar product workflows and information architecture; preserve ColtaneDB's own name, language, visual assets, and implementation. Do not copy Supabase branding or proprietary assets. Reconcile this with the Graphite design direction during M4 before UI implementation.

## Stack and data boundary

The target is Next.js App Router, TypeScript strict, Tailwind, Radix/shadcn primitives, cmdk, Monaco, TanStack Table/Virtual/Query, Zustand, React Flow, motion, charts, react-hook-form, zod, and sonner. Use shared typed contracts from `packages/api-types` and MSW with realistic seed data; the UI must work in healthy, slow, empty, error, quota, degraded, and read-only states. Lazy-load Monaco, React Flow, and charts.

## Stages

0. Tokens, fonts, theme/density, logo, accessible shared primitives, and Storybook.
1. App shell, user/admin route groups, command palette, shortcuts, and MSW.
2. Access/onboarding and Overview.
3. Data views and record inspector.
4. Colt query workspace, plan, and capability errors.
5. Schema designer.
6. Backends/sync, Settings, Storage, Live, Logs, and Policies.
7. Operator admin console with server-side authorization.
8. Accessibility, performance, empty/error/loading audit, Playwright, and visual baselines.

Each stage is approved independently. Every shipped screen needs both themes and its loading, empty, error, permission, quota, read-only, and degraded states. See the original UI brief for detailed screen and interaction acceptance criteria.