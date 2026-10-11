# Adapter Capabilities

This file is an initial, non-generated baseline. No adapter exists in M0; **all capability values are unverified assumptions** and must not be advertised as supported. The generated matrix must eventually come from each adapter's tested `Capabilities` object.

| Capability | Postgres | MongoDB | Firestore | Redis | D1 |
| --- | --- | --- | --- | --- | --- |
| Joins | Assumed yes | Assumed partial | Assumed no | Assumed no | Assumed yes |
| Multi-record transactions | Assumed yes | Assumed replica-set support | Assumed limited | Assumed limited | Assumed limited |
| Nested document paths | Assumed JSONB | Assumed native | Assumed native | Assumed no | Assumed partial |
| Vector search | Assumed pgvector | Assumed Atlas Vector Search | Unverified | Assumed no | Assumed no |
| Graph traversal | Assumed recursive CTE | Assumed `$graphLookup` | Assumed no | Assumed no | Assumed recursive CTE |
| Time-series windows | Assumed yes | Assumed time-series collections | Assumed no | Assumed no | Assumed basic |

Verify provider-specific behavior before implementing the corresponding adapter and record dated evidence in `docs/CAPACITY.md`. Planner support must be covered by contract tests; capability errors are preferable to unsupported claims.