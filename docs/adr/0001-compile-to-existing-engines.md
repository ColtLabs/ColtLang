# ADR-0001: Compile to Existing Engines

- Status: Accepted
- Date: 2026-09-30

## Context

ColtaneDB needs a unified language and control plane across data models without taking on the scope and operational risk of creating a new storage engine.

## Decision

Colt is compiled and planned for existing provider databases and services. The compiler emits parameterized or structured execution plans; adapters execute them. The compiler itself performs no I/O and does not execute queries.

## Consequences

Provider capabilities constrain supported syntax and must be tested and reported honestly. Cross-backend behavior cannot claim distributed atomicity. Provider adapters and contracts become explicit package boundaries.