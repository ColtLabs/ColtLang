# ADR-0003: Node.js Runtime for the API

- Status: Accepted
- Date: 2026-09-30

## Context

The MongoDB driver and Firebase Admin SDK require the Node runtime. Long-running work is delegated to queue/workflow providers.

## Decision

The API targets Node.js 24 LTS and uses Hono on Node. The default hosted target is Vercel Functions; Docker plus docker-compose is the self-host target. Pin Node 24 in `.nvmrc`, package engines, and CI. Revisit when Node 26 becomes LTS.

## Consequences

Handlers remain stateless and reuse clients safely across invocations. M0 verified Node 24 support against Vercel's published runtime list on 2026-09-30; see `docs/CAPACITY.md`.