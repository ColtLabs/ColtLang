# ADR-0002: Shared-Instance Tenant Namespaces

- Status: Accepted
- Date: 2026-09-30

## Context

The operator owns exactly one provider resource per service. ColtaneDB must isolate many tenant projects within those shared resources and must not create provider-level projects.

## Decision

Tenant ids are opaque, server-generated `tnt_` identifiers. Each backend uses the isolation method in the project brief: tenant schemas and roles for Postgres, scoped document metadata/paths for MongoDB and Firestore, prefixes for Redis and object stores, and tenant keys for D1. Every adapter call requires a tenant context and goes through TenantGuard.

## Consequences

Isolation is part of the adapter contract, not an optional caller convention. Code-enforced isolation requires cross-tenant leak and escape/fuzz tests. Provider resource usage, quotas, noisy-neighbor risk, and global kill switches are shared-system concerns.