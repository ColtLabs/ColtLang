# ADR-0005: Owner-Approved Neon Project Bootstrap

- Status: Accepted by owner
- Date: 2026-09-30

## Context

The v1 provider contract uses R2/Blob for files and Vercel for hosting, and originally deferred additional Neon services. The owner explicitly requested linking the existing Neon project and deploying a private object-storage bucket plus a minimal Neon Function.

## Decision

For this project bootstrap only, link the repository to the owner-designated Neon production branch, declare a private `coltbucket`, and deploy the `api` function from `hello.ts`. Use the current top-level `buckets` and `functions` fields in `neon.ts`; the older `preview` form is deprecated by current Neon config docs. Disable environment pull for both linking and deployment so provider-generated secrets are not written to local `.env` files.

This operational setup does not add Neon Object Storage or Neon Functions as supported ColtaneDB v1 adapters or change the provider choices in the product architecture.

## Consequences

Applying the config modifies the linked production branch by provisioning or updating declared services. Review `neon config plan` before apply. Do not auto-confirm protected-branch or existing-resource changes. The Neon CLI stores authentication outside the repository; `.neon` context is ignored by Git.

## Verification

On 2026-09-30, Neon CLI 7.0.1 linked the requested production branch with `--no-env-pull`. The dry run showed only `+ function api`; `coltbucket` already existed with private access. `neon deploy --no-env-pull` completed, and `neon functions get api` reported deployment 1 completed on `nodejs24`. No HTTP invocation was performed.