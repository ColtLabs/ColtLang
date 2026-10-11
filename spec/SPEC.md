# Colt Language Specification v0.2

Status: normative for the implemented subset. Product: ColtaneDB. Language: Colt. Source extension: `.colt`. License: CC-BY-4.0. This specification does not describe support that the current implementation does not prove.

## 1. Design and Philosophy

Colt describes collections, multi-backend connections, and data intent independently of storage syntax. ColtaneDB acts as a query orchestrator and transpilation layer implementing Mass Database Management (MDM). A catalog supplies collection, field, type, policy, placement, and capability facts. The compiler parses source and produces diagnostics or a backend-neutral execution plan; it never embeds credentials in query text and enforces strict engine-centric boundaries.

Colt uses a Bring Your Own Database (BYOD) model targeting underlying database protocols and engines (`postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`), rather than cloud provider hosting brand names.

## 2. Lexical rules

Keywords are case-insensitive and are tokenized in uppercase. Identifiers are ASCII and case-sensitive. Whitespace separates tokens. `--` begins a line comment; `/* ... */` begins a non-nesting block comment. `#colt <version>` at the top of a file specifies the language version pragma (e.g. `#colt 0.2`). Strings use double quotes and support `\\`, `\"`, `\n`, `\r`, `\t`, and `\uXXXX`. Unknown escapes and unterminated strings/comments produce diagnostics.

Equality and inequality are `==` and `!=`. Parameters use `$name`. Integers and decimal/exponent floats are decimal. Durations are a non-negative integer followed by `s`, `m`, `h`, or `d`. Time literals are ISO-8601 timestamps with a timezone. Identifiers may contain ASCII letters, digits after the first character, and `_`.

The lexer reserves keywords used by later milestones. Reserved forms include `LIVE`, `FETCH`, `NEAREST`, `SINCE`, `WINDOW`, `RELATE`, `MELD`, `SYNC`, `CONSTRAINT`, and edge-path arrows. They report `COLT2003` with the planned milestone.

## 3. Connections and Infrastructure

Colt 0.2 introduces explicit infrastructure declarations via `CONNECT` statements or a companion `colt.toml` file:

```colt
CONNECT <alias> AS <engine>(env("VAR"))
DEFAULT CONNECTION <alias>
```

- **Engines**: `postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`.
- **Secrets**: `env("VAR")` is the ONLY valid mechanism to supply connection strings. Literal credential URLs produce a compile-time diagnostic (`COLT2023`).
- **Default Connection**: If exactly one connection is declared, it is the implicit default. If multiple connections exist, an explicit `DEFAULT CONNECTION <alias>` or per-collection `@backend(alias)` is required. Omitting both when multiple connections are defined produces `COLT2024`.
- **Configuration File**: Connections may be defined in `colt.toml` (`[connections.<alias>] engine, url_env`).
- **Uniqueness**: Declaring the same connection alias more than once produces `COLT2022`.

## 4. Types and values

Primitive types are `uuid`, `text`, `int`, `float`, `bool`, `time`, `duration`, and `doc`. Parameterized types are `list<T>`, `link<Collection>`, and `vector(N)`. `T?` marks a field optional; fields are required otherwise. Missing optional values and explicit null have the same read behavior. There is no implicit type coercion.

Supported literal values are strings, integers, floats, booleans, null, parameters, durations, times, object literals, and list literals. Expressions support field/document paths, record references, function calls, unary negation/NOT, arithmetic, comparisons, and boolean operations. Precedence from lowest to highest is `OR`, `AND`, comparisons/`IN`, addition/subtraction, multiplication/division/remainder, unary, then primary/path access. Binary operators associate left-to-right.

Comparisons are two-valued: `null == null` is true, `null == x` for non-null `x` is false, and ordered comparisons with null are false. Number/string comparisons are false. Document paths use `a.b.c` and `a.b[0]`; a missing segment or indexing a non-object yields null. Applying a document path to a non-`doc` field is a semantic error. Null sorts last for both ascending and descending order.

## 5. Schema statements and Melds

`DEFINE COLLECTION name [STRICT|FLEXIBLE] annotations { fields }` defines a collection; omitted mode means STRICT. A field is `name: type? annotations`.

Annotations use `@name` or `@name(arguments)`:
- `@backend(alias)`: Binds a collection to a declared connection alias (never a provider name). Undeclared aliases produce `COLT2021` (with a migration hint for legacy v0.1 provider names).
- `@key`: Exactly one field must be annotated as the primary record key (`COLT2011`).
- `@unique`: Enforces unique constraint on the field.
- `@default(expr)`: Evaluated at statement time using UTC server clock.
- `@readonly`: Preserved across updates, protected from modification.
- `@ttl(duration)`: Specifies automatic time-to-live expiration.
- `@index(kind, options)`: Creates an index. Capability checks validate whether the backing engine supports the index type (e.g. `@index(hnsw)` is rejected on Redis with `COLT2026`).

### Melds (Cross-Connection Links)
A `link<TargetCollection>` where the target collection resides on a different connection alias is treated as a **Meld**. Melds automatically compile to stitched lookups in the query orchestrator and are non-transactional across storage engines.

Reserved syntax for explicit melds (`DEFINE MELD ... LINK | SYNC | CONSTRAINT`) is reserved under `COLT2003` for planned execution.

## 6. Queries

M1/0.2 supports `FIND collection SELECT projection [WHERE expr] [ORDER BY field [ASC|DESC]] [LIMIT integer] [OFFSET integer]`. Projection entries are fields or document paths. `WHERE` is a boolean expression. Parameters remain separate from generated statements. Pagination values are non-negative integer literals.

`FETCH`, `LIVE FIND`, `NEAREST`, `SINCE`, `WINDOW`, graph paths, and aggregates report `COLT2003`.

## 7. Mutations and Transactions

`PUT collection:key { field: expr, ... }` creates or replaces the entire record identified by an explicit key. It is idempotent and preserves fields annotated `@readonly`. `CREATE collection[:key] { ... }` is insert-only and reports a conflict if the key exists. If omitted, the key is generated only when the key field is UUID-typed. Both return the stored record with defaults applied and a `created` boolean.

`DELETE collection:key` deletes one record. `DELETE collection WHERE expr` deletes matching records. Bare `DELETE collection` and a WHERE expression that constant-folds to true are rejected. A missing record is idempotent and returns `{ deleted: 0 }`; otherwise the result is `{ deleted: n }`.

`ATOMIC { statements }` executes an atomic unit of work:
- Single-Connection Rule: All statements inside an `ATOMIC` block must target the same connection alias. Spanning multiple connections produces `COLT2025` (`ATOMIC block spans connections '...' and '...'`).
- Transaction Capability: The target connection engine must support transactions. Targeting non-transactional engines (such as Redis) produces `COLT2001`.

## 8. Diagnostics

Every diagnostic has a stable code, message, source span, and actionable hint where appropriate:
- `COLT1xxx`: Lexical and syntax errors (`COLT1001` unexpected char, `COLT1101` expected statement, etc.)
- `COLT2xxx`: Semantic and capability errors:
  - `COLT2001`: Unsupported capability or transaction mode
  - `COLT2002`: Unknown collection
  - `COLT2003`: Reserved construct
  - `COLT2004`: Unknown field
  - `COLT2005`: Constant-true DELETE rejected
  - `COLT2006`: Duplicate collection
  - `COLT2007`: Duplicate field
  - `COLT2008`: Unknown annotation
  - `COLT2009`: Duplicate annotation
  - `COLT2010`: Invalid vector dimension
  - `COLT2011`: Key field required
  - `COLT2012`: Invalid document path
  - `COLT2014`: Required field missing
  - `COLT2015`: UUID key format required
  - `COLT2016`: Deprecated multi-primary span (superseded by `COLT2025`)
  - `COLT2017`: CREATE without ID requires UUID key
  - `COLT2018`: Type mismatch
  - `COLT2019`: Vector length mismatch
  - `COLT2020`: Empty ATOMIC block
  - `COLT2021`: Unknown connection
  - `COLT2022`: Duplicate connection alias
  - `COLT2023`: Literal credentials URL rejected (must use `env("VAR")`)
  - `COLT2024`: Ambiguous default connection
  - `COLT2025`: Mixed ATOMIC block across connections
  - `COLT2026`: Feature unsupported on engine (e.g. HNSW on Redis)
  - `COLT2027`: Unknown engine
- `COLT3xxx`: Access and security errors
- `COLT4xxx`: Runtime and limit errors

## 9. Python SDK Interoperability

The normative parser and compiler are implemented in TypeScript. The official `coltanedb` Python client SDK connects to ColtaneDB execution runtimes or local query bridges (`colt serve`), submitting Colt source without requiring credentials inside `.colt` files.