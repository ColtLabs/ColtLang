# The Colt Language Reference & Documentation

**Language:** Colt (also written ColtLang)  
**File Extension:** `.colt` (for example `app.colt`, `main.colt`, `sampledb.colt`)  
**Product Built on Colt:** ColtaneDB  
**Python Package:** `coltanedb`  
**Specification Version:** 0.2 (draft)  
**Core Concept:** The Meld Model (MELD = Multi-Engine Link Declaration)  
**Creator:** Ayush Bhattacharya (`info.cometlabs@gmail.com`)  
**License:** Apache-2.0 (Code & Runtime) / CC-BY-4.0 (Language Specification)

---

> [!NOTE]
> **How to read status tags in this reference**:
> - `[core]`: The stable core of version 0.2, fully implemented and enforced by the compiler.
> - `[proposed]`: Designed, specified, and documented; details may still evolve.
> - `[reserved]`: Keywords or syntax reserved so later versions will not break existing programs. Using a reserved construct produces diagnostic `COLT2003` ("reserved construct").
> Implementation status is tracked in [`docs/STATUS.md`](docs/STATUS.md) and conformance test cases in `spec/conformance`.

---

## Table of Contents

1. [Introduction](#1-introduction)
   - [The Problem](#11-the-problem)
   - [What Colt Is](#12-what-colt-is)
   - [What Colt Is Not](#13-what-colt-is-not)
   - [Prior Art & Positioning](#14-prior-art--positioning)
2. [Design Principles](#2-design-principles)
3. [The Meld Model](#3-the-meld-model)
   - [The Three Layers](#31-the-three-layers)
   - [The Three Kinds of Melds](#32-the-three-kinds-of-melds)
4. [A Tour of Colt](#4-a-tour-of-colt)
5. [Lexical Structure](#5-lexical-structure)
   - [Source Text, Comments & Pragma](#51-source-text-comments--pragma)
   - [Identifiers & Keywords](#52-identifiers--keywords)
   - [Literals](#53-literals)
   - [Separators](#54-separators)
6. [Types](#6-types)
   - [Logical Types](#61-the-logical-types-core)
   - [Optional Types & Null Semantics](#62-optional-types--null-semantics-core)
   - [Links](#63-links-core)
7. [Connections](#7-connections)
   - [CONNECT & Engine Keywords](#71-connect-core)
   - [Secrets: env()](#72-secrets-env-core)
   - [DEFAULT CONNECTION](#73-default-connection-core)
   - [Shared Config: colt.toml](#74-project-configuration-file-colttoml)
   - [Minimal Engine Footprint](#75-what-a-connection-may-touch)
8. [Collections](#8-collections)
   - [DEFINE COLLECTION, STRICT & FLEXIBLE](#81-define-collection-core)
   - [Annotations Matrix](#82-annotations)
9. [Records and Identifiers](#9-records-and-identifiers)
10. [Expressions & Operators](#10-expressions--operators)
11. [Statements](#11-statements)
    - [FIND](#111-find-core)
    - [PUT & CREATE](#112-put--create-core)
    - [DELETE](#113-delete-core)
    - [ATOMIC (Single-Connection Rule)](#114-atomic-core-restricted)
    - [Reserved Statements (SAGA, POLICY)](#115-reserved-statements-reserved)
12. [Melds in Detail](#12-melds-in-detail)
    - [LINK](#121-link)
    - [SYNC](#122-sync)
    - [CONSTRAINT](#123-constraint)
    - [Inspecting Melds](#124-inspecting-melds)
    - [Consistency Summary](#125-consistency-summary)
    - [SAGA](#126-saga-reserved)
    - [Stitched Joins](#127-stitched-joins-proposed)
13. [Execution Model](#13-execution-model)
    - [Compilation Pipeline](#131-pipeline)
    - [Where Code Runs (Local, Web IDE, Hosted)](#132-where-code-runs)
    - [Result Shape & Concurrency](#133-result-shape--concurrency)
14. [Engines & Capabilities Matrix](#14-engines-and-capabilities)
15. [Errors and Diagnostics Catalog](#15-errors-and-diagnostics)
16. [Security Model](#16-security-model)
17. [Tooling and the Python SDK](#17-tooling-and-the-python-sdk)
    - [Command-line Tool colt](#171-command-line-tool-colt)
    - [Python SDK coltanedb](#172-python-sdk-coltanedb)
    - [Troubleshooting ModuleNotFoundError](#173-troubleshooting-python-modulenotfounderror)
18. [Appendices](#18-appendices)
    - [Appendix A: Reserved Words](#appendix-a-reserved-words)
    - [Appendix B: Colt at a Glance (SQL vs MongoDB vs Redis vs Colt)](#appendix-b-colt-at-a-glance-for-people-who-know-other-languages)
    - [Appendix C: Glossary](#appendix-c-glossary)
    - [Appendix D: Logical Type Mapping](#appendix-d-logical-type-mapping)
    - [Appendix E: Frequently Asked Questions (FAQ)](#appendix-e-frequently-asked-questions)

---

## 1. Introduction

### 1.1 The Problem
Real software uses several kinds of databases at once:
- **Relational tables** for business entities and structured transactions (PostgreSQL, MySQL, SQLite).
- **Key-value stores** for sub-millisecond caching and transient sessions (Redis, Valkey).
- **Document stores** for flexible, polymorphic metadata (MongoDB, Firestore).
- **Vector indexes** for AI semantic search (pgvector, Pinecone).
- **Time-series engines** for high-throughput metrics and chronological events.

Each engine comes with its own query language (SQL, Redis commands, MongoDB aggregation JSON), its own driver stack, and its own idea of consistency. In virtually every production system, the relationships and synchronization between these stores live in scattered, undocumented application glue code that nobody can centrally inspect, plan, or verify.

### 1.2 What Colt Is
Colt is one declarative language for:
1. **Describing data** (collections, fields, types, constraints),
2. **Querying and changing data** (`FIND`, `PUT`, `CREATE`, `DELETE`),
3. **Declaring connections** to the databases that hold it (`CONNECT`), and
4. **Declaring relationships between databases** (`DEFINE MELD`), which is Colt's distinguishing breakthrough.

A Colt program is compiled into the native operations of each database it targets. **Colt does not replace those databases.** It sits in front of the databases you already run and gives them a common, structured language.

### 1.3 What Colt Is Not
- **It is not a database engine**: It stores nothing by itself.
- **It is not a general-purpose programming language**: It has no loops, user-defined functions, or arbitrary code execution. This is deliberate: a declarative language can be statically checked, planned, explained, and secured.
- **It does not make several databases behave like one ACID database**: Where a guarantee is weaker, Colt states it honestly in the language, in error messages, in query plans, and in documentation.

### 1.4 Prior Art & Positioning
- **Polystores**: Research systems that place a single query interface over multiple databases.
- **Multi-Model Databases** (e.g. SurrealDB, ArangoDB): Pack several data models into a single proprietary database engine.
- **Colt's Approach**: Compiles to the independent engines the user **already operates**, and makes the relationships between them a first-class, declared part of the language: **The Meld Model**.

---

## 2. Design Principles

1. **One language, many engines**: Learn one syntax. The compiler handles dialect and protocol differences.
2. **Declarative**: You state what you want; the planner decides how. Programs can be explained and inspected (`colt plan`) before running.
3. **Beginner-friendly, expert-capable**: A newcomer can read `FIND books WHERE views > 10` without training. An expert can inspect the generated native parameterized queries.
4. **Honest about consistency**: Every operation that spans databases states its exact consistency guarantee.
5. **Secrets stay out of source**: Connection strings never appear in `.colt` files (`env("VAR")` only).
6. **Engine-aware**: The compiler knows what each engine can do and refuses what it cannot do with clear diagnostic codes, rather than failing at runtime.
7. **Extensible**: New engines, statements, and annotations can be added without breaking existing programs.
8. **Readable**: Keywords are plain English words; code reads close to a natural sentence.

---

## 3. The Meld Model

**MELD stands for Multi-Engine Link Declaration.**

A meld is a declared, named relationship between data that lives in two or more connections. The connections can use different engines (PostgreSQL and Redis) or the same engine (two separate PostgreSQL databases).

### 3.1 The Three Layers
A Colt program is organized in three layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 3: MELDS        How data on different connections relates,       │
│                       and what must be kept true (DEFINE MELD)         │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: COLLECTIONS  What the data looks like, and which connection   │
│                       holds it (DEFINE COLLECTION)                     │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: CONNECTIONS  Where data lives: an engine plus an endpoint,    │
│                       referenced by alias (CONNECT)                    │
└────────────────────────────────────────────────────────────────────────┘
```

| Layer | Declared With | Answers the Question |
| :--- | :--- | :--- |
| **Connections** | `CONNECT` | *Where does the data live?* |
| **Collections** | `DEFINE COLLECTION` | *What is the data, and which connection holds it?* |
| **Melds** | `DEFINE MELD` (or cross-connection `link<T>`) | *How are the stores related, and what must stay true?* |

### 3.2 The Three Kinds of Melds

| Kind | Declares | Example | Guarantee |
| :--- | :--- | :--- | :--- |
| **`LINK`** | A reference from a record on one connection to a record on another | A review in MongoDB points to a book in PostgreSQL | Resolved at read time via stitched lookup; not transactional. |
| **`SYNC`** | A projection that copies data from a source to a target | Popular books kept in Redis for 10 minutes | Eventually consistent; rebuildable from the source. Modes: `write_through`, `reconcile`, `cdc`. |
| **`CONSTRAINT`** | A rule that must hold across connections | A review must reference an existing book | Checked on write, verified by reconciliation; not atomic. Modes: `check_on_write`, `flag`, `reject`. |

**Why this matters**: In most projects, these relationships exist only as undocumented glue code scattered across services. In Colt, they are written down once, named, checked by the compiler, shown in query plans, and verified by tooling.

---

## 4. A Tour of Colt

A complete program using the Meld Model across **PostgreSQL**, **Redis**, and **MongoDB**:

```colt
#colt 0.2
-- A small library catalog with multi-engine melding.
-- Check it with: colt check library.colt

// 1. Declare connections (engine + endpoint alias)
CONNECT main  AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))

DEFAULT CONNECTION main

// 2. Define collections on Postgres (via default connection)
DEFINE COLLECTION authors STRICT {
  id: uuid @key,
  name: text @unique,
  joined: time @default(now)
}

DEFINE COLLECTION books STRICT {
  id: uuid @key,
  title: text,
  author: link<authors>,
  tags: list<text>,
  published: time?,
  metadata: doc,
  embedding: vector(1536) @index(hnsw),
  views: int @default(0)
}

// Stored in MongoDB
DEFINE COLLECTION reviews FLEXIBLE @backend(notes) {
  id: uuid @key,
  book: link<books>,
  body: text,
  meta: doc
}

// Stored in Redis with automatic 30-minute expiration
DEFINE COLLECTION sessions @backend(cache) @ttl(30m) {
  value: text
}

// 3. Declare Melds across connections
DEFINE MELD book_reviews LINK       reviews.book -> books.id
DEFINE MELD hot_books    SYNC       books TO cache KEY id TTL 10m
DEFINE MELD review_book  CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write

// 4. Queries & Stitched Reads
// A query that crosses connections: stitched by the Coltane engine
FIND reviews FETCH book 
WHERE book.views > 10 
LIMIT 20

// 5. Mutations
PUT books:11111111-1111-4111-8111-111111111111 {
  title: "The Left Hand of Darkness",
  author: authors:22222222-2222-4222-8222-222222222222,
  tags: ["science-fiction", "classic"],
  metadata: { edition: 3, language: "en" },
  embedding: [0.12, -0.4, 0.88],
  views: 42
}

CREATE books {
  title: "The Dispossessed",
  author: authors:22222222-2222-4222-8222-222222222222,
  tags: ["science-fiction"],
  metadata: {},
  views: 0
}

// 6. Transactions (Single-connection only)
ATOMIC {
  DELETE books:33333333-3333-4333-8333-333333333333;
  PUT authors:22222222-2222-4222-8222-222222222222 { 
    name: "Ursula K. Le Guin" 
  }
}
```

---

## 5. Lexical Structure

### 5.1 Source Text, Comments & Pragma
- Source files are UTF-8, conventional extension is `.colt`.
- Whitespace separates tokens and is otherwise insignificant. Indentation has no syntactic meaning.
- `-- text` runs to the end of the line (canonical comment form).
- `/* text */` is a block comment (does not nest).
- `#colt <version>`: Optional first line declaring the language version (e.g. `#colt 0.2`). Tools use it to select compiler rules and warn about deprecations.

### 5.2 Identifiers & Keywords
- **Identifiers**: Starts with a letter or underscore, followed by letters, digits, or underscores. Case-sensitive (`Books` and `books` are different).
- **Keywords**: Case-insensitive (`FIND`, `find`, and `Find` are identical). Written in uppercase by convention.

### 5.3 Literals
| Kind | Examples | Notes |
| :--- | :--- | :--- |
| **Integer** | `0`, `42`, `-7` | Signed 64-bit. Out-of-range literals are a compile error. |
| **Float** | `3.14`, `-0.5`, `2e3` | IEEE-754 double precision. |
| **Text** | `"hello"`, `"line\n"` | Double-quoted. Supports `\"`, `\\`, `\n`, `\t`, `\r`, `\uXXXX`. |
| **Boolean** | `true`, `false` | Boolean literal. |
| **Null** | `null` | Two-valued comparison semantics. |
| **Time** | `2026-10-04T10:00:00Z` | ISO-8601 without quotes; UTC recommended. Built-in `now` [proposed]. |
| **Duration** | `30s`, `5m`, `2h`, `1d` | Units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days). |
| **UUID** | `11111111-1111-4111-8111-111111111111` | Hyphenated hexadecimal. |
| **List** | `[1, 2, 3]`, `["a", "b"]`, `[]` | Elements must share a type. |
| **Document** | `{ edition: 3, language: "en" }` | Keys are identifiers or text; values may nest. |
| **Vector** | `[0.12, -0.4, 0.88]` | List of floats; length must equal declared `vector(N)`. |
| **Record ID** | `books:11111111-...`, `users:alice` | Format: `collection:key`. |
| **Parameter** | `$name`, `$min_views` | Supplied by the caller at runtime; safe against SQL injection. |

### 5.4 Separators
Statements are separated by whitespace and grammar structure. Semicolons are optional between top-level statements, and **required** between statements inside an `ATOMIC` block.

---

## 6. Types

### 6.1 The Logical Types [core]
| Type | Meaning |
| :--- | :--- |
| `uuid` | Universally unique identifier |
| `text` | Unicode string |
| `int` | Signed 64-bit integer |
| `float` | 64-bit floating point |
| `bool` | `true` or `false` |
| `time` | A point in time (UTC) |
| `duration` | A length of time |
| `doc` | A nested document of named values (JSON-like) |
| `list<T>` | An ordered list of values of type `T` |
| `link<C>` | A reference to a record of collection `C` |
| `vector(N)` | A fixed-length list of `N` floats, for similarity search |

Logical types are engine-independent. Each engine maps them to its native storage types.

### 6.2 Optional Types & Null Semantics [core]
- A field is required by default. `T?` marks it optional:
  ```colt
  published: time?
  ```
- Writing a record that omits a required field (and has no `@default`) produces diagnostic `COLT2014`.
- **Two-Valued Comparisons**: Comparisons are two-valued, not three-valued as in SQL:
  - `null == null` is `true`.
  - `null == x` is `false` for any non-null `x`.
  - `<`, `>`, `<=`, `>=` involving `null` are `false`.
- In `ORDER BY`, null values sort last in both `ASC` and `DESC`.
- No implicit type coercion: comparing an `int` with a `text` is `false`, not an error and not an implicit cast.

### 6.3 Links [core]
`link<authors>` stores a reference to a record of collection `authors`.
- A single `link<T>` holds one reference.
- `list<link<T>>` holds multiple references.
- If the target does not exist (a dangling reference), reading it yields `null` for a single link and omits the entry from a list; neither is an error, but result metadata reports the count of dangling references.

---

## 7. Connections

A connection names a database the program talks to. It consists of an **alias**, an **engine**, and an **endpoint** supplied from the environment.

### 7.1 CONNECT [core]
```colt
CONNECT main  AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
```
- `main` and `cache` are **aliases** chosen by the author. Prefer names describing the architectural role (`main`, `cache`, `notes`), not the vendor, so changing providers never requires renaming code.
- The word after `AS` is the **engine**.

#### Supported Engine Keywords:
| Engine | Meaning |
| :--- | :--- |
| `postgres` | PostgreSQL wire protocol (Neon, Supabase, AWS RDS, Docker, self-hosted) |
| `redis` | Redis serialization protocol (Upstash, Redis Cloud, Valkey, Docker) |
| `mongodb` | MongoDB wire protocol (MongoDB Atlas, self-hosted) |
| `sqlite` | Local SQLite embedded file (`./app.db`) |
| `libsql` | LibSQL protocol (Turso, Sqld) |
| `firestore` | Google Firestore (provider-specific API) |
| `d1` | Cloudflare D1 (provider-specific API) |

> [!WARNING]
> **Provider brand names are never engine names.** A provider is only a host for an engine. Neon is `postgres`, Upstash is `redis`, and Turso is `libsql`.

### 7.2 Secrets: `env()` [core]
The connection endpoint is given as `env("VARIABLE_NAME")`, which reads an environment variable at runtime. **Credentials never appear in `.colt` source.** A literal connection string containing credentials produces error `COLT2023`. Logs, plans, and exports automatically redact connection strings.

### 7.3 DEFAULT CONNECTION [core]
```colt
DEFAULT CONNECTION main
```
If exactly one connection is declared, it is the implicit default. If several are declared, you must specify `DEFAULT CONNECTION <alias>` or place `@backend(alias)` on every collection; otherwise the compiler reports an ambiguity error (`COLT2024`).

### 7.4 Project Configuration File (`colt.toml`) [proposed]
Connections shared by several `.colt` files can live in `colt.toml`, safely committed to version control:
```toml
# colt.toml (contains no secrets)
[connections.main]
engine  = "postgres"
url_env = "DATABASE_URL"

[connections.cache]
engine  = "redis"
url_env = "REDIS_URL"
```

### 7.5 What a Connection May Touch
Colt maintains a minimal, respectful footprint:
- **PostgreSQL**: Dedicated `colt` schema (`colt.*`).
- **Redis**: Key prefix `colt:` (`colt:*`).
- **MongoDB / SQLite**: Collection/table prefix `colt_`.
- Colt **never** reads, drops, or alters tables or keys outside this namespace.

---

## 8. Collections

A collection is a named set of records with a declared shape (a SQL table, a MongoDB collection, or a Redis keyspace).

### 8.1 DEFINE COLLECTION [core]
```colt
DEFINE COLLECTION books STRICT @backend(main) {
  id: uuid @key,
  title: text,
  views: int @default(0)
}
```
- **`STRICT` (default)**: Only declared fields are permitted; undeclared fields produce an error.
- **`FLEXIBLE`**: Undeclared fields are accepted and stored inside a document column or equivalent.

### 8.2 Annotations
| Annotation | Applies To | Meaning |
| :--- | :--- | :--- |
| `@key` | field | The record's primary identifier. Exactly one per collection (`COLT2011`). |
| `@unique` | field | No two records may share this value. |
| `@default(expr)` | field | Value used when the field is absent. `@default(now)` evaluates once per statement by server UTC clock. |
| `@readonly` | field | Set at creation, preserved by `PUT`, rejected if a statement tries to modify it. |
| `@index(kind, opts)` | field | Requests an index (e.g. `@index(hnsw)` for vectors). Subject to engine capability. |
| `@backend(alias)` | collection | The connection holding this collection. Defaults to the default connection. |
| `@ttl(duration)` | collection | Records automatically expire after given duration (e.g. `@ttl(30m)`). |
| `@storage(...)` | collection | Storage-shape hint (`kv`, `relational`, `document`) when an engine supports several. |
| `@timeseries(field)` | collection | Marks a time-ordered collection [reserved]. |

---

## 9. Records and Identifiers

A record ID has the form `collection:key`:
```colt
books:11111111-1111-4111-8111-111111111111
authors:22222222-2222-4222-8222-222222222222
users:alice
users:42
```
The key may be a UUID, an identifier, or an integer. The key's type must match the collection's `@key` type. Record IDs appear in `PUT`, `DELETE`, `FIND`, and as values of `link` fields.

---

## 10. Expressions & Operators

Expressions appear in `WHERE`, `SELECT`, and `@default`.

### 10.1 Paths [core]
Nested document paths use dot notation and array indexing:
```colt
metadata.edition
metadata.tags[0]
```
A missing segment yields `null` without error. Applying a path to a non-`doc` column is a compile-time error (`COLT2012`).

### 10.2 Operator Precedence (Highest to Lowest)
1. Path access (`.`) and indexing (`[ ]`)
2. Unary minus (`-`)
3. Multiplicative (`*`, `/`, `%`)
4. Additive (`+`, `-`)
5. Relational (`<`, `<=`, `>`, `>=`)
6. Equality (`==`, `!=`, `IN`)
7. Logical NOT (`NOT`)
8. Logical AND (`AND`)
9. Logical OR (`OR`)

---

## 11. Statements

### 11.1 FIND [core]
```colt
FIND books
SELECT title, author, metadata.edition
WHERE views > 10 AND published != null
ORDER BY views DESC
LIMIT 20 OFFSET 0
```
- Clauses: `FIND <source>`, `SELECT <paths>`, `WHERE <expr>`, `ORDER BY <path> [ASC|DESC]`, `LIMIT n`, `OFFSET n`.
- Reserved clauses: `FETCH` (follow links across melds), `NEAREST ... TO ...` (vector similarity), `SINCE` & `WINDOW` (time series), and `LIVE FIND` (real-time subscriptions).

### 11.2 PUT & CREATE [core]
- **`PUT` (Idempotent Upsert)**: Replaces the entire record at an explicit ID. Preserves fields marked `@readonly`. Returns the stored record and `created: true|false`.
  ```colt
  PUT books:11111111-1111-4111-8111-111111111111 {
    title: "The Left Hand of Darkness",
    views: 10
  }
  ```
- **`CREATE` (Insert-Only)**: Inserts a new record and fails if the ID exists. If the ID is omitted and the key type is `uuid`, a UUID is generated automatically.
  ```colt
  CREATE books {
    title: "The Dispossessed",
    views: 0
  }
  ```

### 11.3 DELETE [core]
```colt
DELETE books:33333333-3333-4333-8333-333333333333
DELETE books WHERE views == 0
```
- Deleting a non-existent record returns `{ deleted: 0 }` and is idempotent (not an error).
- **Safety Rule**: Bare `DELETE books` or a condition that constant-folds to true (`WHERE true`) is rejected with error `COLT2005`.

### 11.4 ATOMIC [core, restricted]
```colt
ATOMIC {
  DELETE books:33333333-3333-4333-8333-333333333333;
  PUT authors:22222222-2222-4222-8222-222222222222 { name: "Ursula K. Le Guin" }
}
```
- **Single-Connection Rule**: All statements inside an `ATOMIC` block must target **one connection**. Spanning multiple connections produces compile error `COLT2025`.
- Runs inside a native transaction if the engine supports it (e.g. Postgres, SQLite); reports `COLT2001` if the engine lacks transaction capabilities (e.g. Redis).
- Semicolons are required between statements inside the block.

### 11.5 Reserved Statements [reserved]
`DEFINE EDGE`, `RELATE`, `DEFINE POLICY`, `SET`, `GET`, `UPDATE ... MERGE`, `EXPLAIN`, and `SAGA`.

---

## 12. Melds in Detail

A meld is written with `DEFINE MELD`. All melds refer to connection aliases and collections, **never to provider brand names**. Status in 0.2: `[reserved]` (syntax is standardized; cross-connection `link<T>` creates an implicit meld `[proposed]`).

### 12.1 LINK
```colt
DEFINE MELD book_reviews LINK reviews.book -> books.id
```
Declares that `reviews.book` refers to a record in `books`, possibly on a different connection.
- **Reads**: `FETCH` resolves the link with a stitched lookup: the engine queries the first connection, collects referenced IDs (up to a configurable cap), queries the second connection, and merges the results in memory.
- **Guarantee**: Point-in-time per connection, not transactional. Between the two reads, data may change.

### 12.2 SYNC
```colt
DEFINE MELD hot_books SYNC books TO cache KEY id TTL 10m
```
Keeps a projection of a source collection in a target connection.
- `KEY`: Chooses the field used as the target key.
- `TTL`: Automatic expiration for projected records.
- `MODE`:
  - `write_through` (default): Changes made through Colt are copied as they happen.
  - `reconcile`: A scheduled job compares source and target and repairs differences.
  - `cdc`: A worker follows the source's change stream (PostgreSQL logical replication or MongoDB change streams).
- **Guarantee**: Eventual consistency with at-least-once delivery and idempotent application. Rebuildable at any time via `colt rebuild <meld>`.

### 12.3 CONSTRAINT
```colt
DEFINE MELD review_book CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write
```
A rule that must hold across connections. Modes:
- `check_on_write`: On each write, check that the referenced record exists; reject if it does not.
- `flag`: Allow the write; record the violation for later review.
- `reject`: Reject the write whenever the check cannot confirm the rule (including network timeouts).
- **Guarantee**: Best-effort. Verified by reconciliation scans (`colt melds check`).

### 12.4 Inspecting Melds
- `colt melds status`: Lists declared melds and last reconciliation times.
- `colt melds check`: Scans for constraint violations across connections.
- `colt rebuild <meld>`: Re-projects cached data from the source of truth.

### 12.5 Consistency Summary
| Operation | Guarantee | Details |
| :--- | :--- | :--- |
| **Single statement on 1 connection** | Native engine guarantee | Native ACID or atomic semantics. |
| **`ATOMIC` on 1 connection** | Transactional | Runs in engine transaction; compile error if unsupported. |
| **`ATOMIC` across connections** | ❌ **Forbidden** (`COLT2025`) | No distributed commit illusion. Use `SAGA`. |
| **`LINK` read (`FETCH`)** | Point-in-time per connection | Stitched lookup; non-transactional across stores. |
| **`SYNC` projection** | Eventually consistent | Rebuildable from source. |
| **`CONSTRAINT` cross-engine rule** | Best-effort | Checked on write, verified by periodic scan. |

### 12.6 SAGA [reserved]
An explicit multi-connection sequence in which each step declares a compensating action that undoes it if a later step fails. It is eventually consistent, not ACID.

### 12.7 Stitched Joins [proposed]
When a query needs data from two connections, the planner pushes filters down to each engine, caps ID list sizes, merges in memory, and flags the result as non-transactional.

---

## 13. Execution Model

### 13.1 Pipeline
```
source text → lexer → parser (AST with spans)
            → semantic check (types, links, aliases, annotations)
            → planner (chooses connection per step, checks capabilities)
            → code generation (parameterized native queries)
            → execution plan → executor
```
- The compiler **never** concatenates raw values into queries; values are always parameterized bindings.
- `colt plan` prints the execution plan without running it.

### 13.2 Where Code Runs
- **Local mode**: The CLI and Python SDK run the entire pipeline locally, connecting to user databases directly. No account required; credentials never leave the machine.
- **Browser (Web IDE)**: Edits, parses, validates, and explains `.colt` files entirely in-browser. Running live queries connects through a local bridge (`colt serve`) or an optional hosted runner.
- **Hosted runner**: Optional service that treats client parses as advisory, re-validating everything securely on the server.

### 13.3 Result Shape & Concurrency
- **Concurrency**: Independent plan steps on different connections run in parallel; dependent steps run in order.
- **Result Payload**:
  ```json
  {
    "rows": [ ... ],
    "meta": {
      "connections": [
        { "alias": "main", "engine": "postgres", "count": 10, "status": "ok" },
        { "alias": "notes", "engine": "mongodb", "count": 10, "status": "ok" }
      ],
      "partial": false,
      "dangling": 0
    }
  }
  ```

---

## 14. Engines and Capabilities

| Capability | `postgres` | `mongodb` | `sqlite` / `libsql` / `d1` | `redis` | `firestore` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`FIND` with `WHERE`, `ORDER BY`, `LIMIT`** | ✅ Yes | ✅ Yes | ✅ Yes | Key access & index lookups | Limited (index rules apply) |
| **Nested document paths (`a.b.c`)** | ✅ Yes (JSONB) | ✅ Native | Partial | ❌ No | ✅ Native (limits) |
| **`ATOMIC` transactions** | ✅ Yes | ✅ Yes (replica sets) | Limited | ❌ No | ✅ Yes (limits) |
| **`@ttl` automatic expiration** | Via scheduled cleanup | ✅ Yes | Via cleanup | ✅ Native | Via policy |
| **Vector index & `NEAREST`** | ✅ Yes (pgvector) | ✅ Yes (Atlas) | Varies | ❌ No | ✅ Yes |
| **Graph path expressions** | ✅ Yes (recursive) | ✅ Yes (graph lookup) | ✅ Yes (recursive) | ❌ No | ❌ No |
| **Time-series windows** | ✅ Yes | ✅ Yes | Basic | ❌ No | ❌ No |

### Transpilation Example
The query:
```colt
FIND books SELECT title, metadata.edition WHERE views > 10 ORDER BY views DESC LIMIT 20
```
Compiles for **PostgreSQL** to parameterized SQL:
```sql
SELECT "title", "metadata" -> 'edition' AS "metadata.edition"
FROM "colt"."books"
WHERE "views" > $1
ORDER BY "views" DESC NULLS LAST
LIMIT $2
```
And compiles for **MongoDB** to a filter, projection, and sort:
```json
{
  "filter": { "views": { "$gt": 10 } },
  "projection": { "title": 1, "metadata.edition": 1 },
  "sort": { "views": -1 },
  "limit": 20
}
```

---

## 15. Errors and Diagnostics

Every diagnostic carries a unique code, clear message, source span, and hint:

| Code Range | Meaning |
| :--- | :--- |
| **`COLT1xxx`** | Syntax: Text is not valid Colt syntax. |
| **`COLT2xxx`** | Semantic and capability: Unknown names, type errors, unsupported on engine, reserved constructs. |
| **`COLT3xxx`** | Policy and access: Rule or permission denied the operation. |
| **`COLT4xxx`** | Runtime and limits: Connection failure, timeout, quota or size limit. |

### Selected Diagnostics Catalog
| Diagnostic Code | Situation | Example Message Style |
| :--- | :--- | :--- |
| **`COLT2001`** | Unsupported operation | `COLT2001: transactions are not supported on engine 'redis'` |
| **`COLT2003`** | Reserved construct | `COLT2003: 'DEFINE MELD' is reserved for multi-store melds` |
| **`COLT2005`** | Safety rule | `DELETE without WHERE or with constant-true condition is rejected` |
| **`COLT2011`** | Missing primary key | `collection 'books' must declare exactly one @key field` |
| **`COLT2021`** | Unknown connection | `unknown connection 'neon'. Declare it with CONNECT neon AS postgres(env("..."))` |
| **`COLT2022`** | Duplicate alias | `connection 'main' is declared twice` |
| **`COLT2023`** | Literal credentials | `connection strings must use env("VAR"), not a literal URL` |
| **`COLT2024`** | Ambiguous default | `2 connections declared and no default. Add DEFAULT CONNECTION or @backend(...)` |
| **`COLT2025`** | Mixed ATOMIC | `ATOMIC block spans connections 'main' and 'cache'` |
| **`COLT2026`** | Unsupported on engine | `HNSW indexes are not supported on redis connection 'cache'` |
| **`COLT2027`** | Undefined env var | `environment variable 'DATABASE_URL' is not defined` |

---

## 16. Security Model

1. **No secrets in source**: Connections use `env()`; the compiler strictly rejects literal credential URLs (`COLT2023`).
2. **No injection by construction**: Values are always bound parameters; identifiers are validated against schema declarations.
3. **No arbitrary code execution**: Colt has no user-defined code, loops, or shell execution; it cannot run arbitrary network calls or shell commands.
4. **Redaction**: Plans, logs, errors, and exports hide connection strings and credentials.
5. **Least privilege**: Colt recommends a dedicated database role with permissions limited to the `colt` namespace.
6. **Minimal footprint**: Colt creates objects only within designated namespaces (`colt` schema in Postgres, `colt:` key prefix in Redis).
7. **Hosted runner security**: Hosted runners encrypt stored credentials, restrict connections to allowed engine hosts, and rate-limit actions.
8. **No raw escape hatches**: Raw SQL or Redis string escape hatches are not part of the language to preserve formal planning guarantees.

---

## 17. Tooling and the Python SDK

### 17.1 Command-line Tool `colt`
| Command | Purpose |
| :--- | :--- |
| `colt check file.colt` | Parse and validate; print diagnostics |
| `colt plan file.colt` | Show the execution plan without running |
| `colt run file.colt` | Execute against the declared connections |
| `colt fmt file.colt` | Format source consistently |
| `colt repl` | Interactive prompt |
| `colt serve` | Local bridge so the Web IDE can run queries on your machine |
| `colt doctor` | Print environment diagnostics (versions, paths, set variables) |
| `colt melds status` | Inspect declared melds [reserved] |
| `colt melds check` | Verify cross-connection constraints [reserved] |
| `colt rebuild <meld>` | Rebuild a projection from its source [reserved] |

### 17.2 Python SDK `coltanedb`
```python
import os
from coltanedb import ColtaneClient

# Initialize client from .colt file (resolves CONNECT via environment)
db = ColtaneClient.from_file("app.colt")

# Execute parameterized query
result = db.run("FIND books WHERE views > $min LIMIT 10", min=10)

for row in result.rows:
    print(row["title"])

print(result.meta)  # connections used, timings, partial flag
```

### 17.3 Troubleshooting Python `ModuleNotFoundError`
If you encounter `ModuleNotFoundError: No module named 'coltanedb'` when running `/usr/bin/python3 app.py` despite `pip list` showing the package:
- **Root Cause**: `pip install` installed the package into the active virtual environment or pyenv (`/home/codespace/.python/current/lib/python3.12/site-packages`), whereas `/usr/bin/python3` explicitly runs the system Linux Python.
- **Fix (Recommended)**: Run using the active Python environment:
  ```bash
  python3 app.py
  ```
- **Alternative**: Install directly into the system interpreter:
  ```bash
  /usr/bin/python3 -m pip install coltanedb
  ```

---

## 18. Appendices

### Appendix A. Reserved Words
- **In use (`#colt 0.2`)**: `ATOMIC`, `AND`, `AS`, `ASC`, `BY`, `COLLECTION`, `CONNECT`, `CONNECTION`, `CREATE`, `DEFAULT`, `DEFINE`, `DELETE`, `DESC`, `FALSE`, `FIND`, `FLEXIBLE`, `IN`, `LIMIT`, `NOT`, `NULL`, `OFFSET`, `OR`, `ORDER`, `PUT`, `SELECT`, `STRICT`, `TRUE`, `WHERE`.
- **Reserved for later**: `CONSTRAINT`, `EDGE`, `EXPLAIN`, `FETCH`, `FOR`, `FROM`, `GET`, `KEY`, `LINK`, `LIVE`, `MELD`, `MERGE`, `MODE`, `NEAREST`, `ON`, `POLICY`, `REFERENCES`, `RELATE`, `SAGA`, `SET`, `SINCE`, `SYNC`, `TO`, `TTL`, `UPDATE`, `WINDOW`.

### Appendix B. Colt at a Glance (For People Who Know Other Languages)
| Task | SQL | MongoDB | Redis | Colt (ColtLang) |
| :--- | :--- | :--- | :--- | :--- |
| **Read with filter** | `SELECT title FROM books WHERE views > 10 ORDER BY views DESC LIMIT 20;` | `db.books.find({views: {$gt: 10}}).sort({views: -1}).limit(20)` | *(Needs manual secondary index)* | `FIND books SELECT title WHERE views > 10 ORDER BY views DESC LIMIT 20` |
| **Insert or replace by ID** | `INSERT ... ON CONFLICT ... DO UPDATE` | `replaceOne({_id}, doc, {upsert: true})` | `SET key value` | `PUT books:<id> { ... }` |
| **Insert only** | `INSERT INTO books ...` | `insertOne(doc)` | `SETNX key value` | `CREATE books { ... }` |
| **Delete by ID** | `DELETE FROM books WHERE id = ...` | `deleteOne({_id})` | `DEL key` | `DELETE books:<id>` |
| **Expire records** | *(Manual cleanup cron)* | TTL index | `EXPIRE key 1800` | `@ttl(30m)` on collection |
| **Relate across two databases** | *Application glue code* | *Application glue code* | *Application glue code* | `DEFINE MELD ...` |

### Appendix C. Glossary
- **Alias**: The name given to a connection in `CONNECT`.
- **Collection**: A named set of records with a declared shape.
- **Connection**: An engine plus an endpoint, referred to by alias.
- **Engine**: The kind of database protocol (`postgres`, `redis`, `mongodb`, `sqlite`, `libsql`, `firestore`, `d1`).
- **Meld**: A declared, named relationship between data on two or more connections (Multi-Engine Link Declaration).
- **Meld Model**: The three-layer organization of a Colt program: connections, collections, melds.
- **Projection**: A copy of source data kept in another store that can always be rebuilt.
- **Provider**: A company that hosts an engine (e.g. Neon, Supabase, Upstash); configuration only, not part of the language.
- **Record**: One item in a collection, identified by `collection:key`.
- **Stitched lookup**: A read that queries two connections and merges the results in memory.

### Appendix D. Logical Type Mapping
| Colt Type | `postgres` | `mongodb` | `sqlite` / `libsql` | `redis` | `firestore` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `uuid` | `uuid` | binary or string | `text` | string | string |
| `text` | `text` | string | `text` | string | string |
| `int` | `bigint` | `int64` | `integer` | string in hash | `integer` |
| `float` | `double precision` | `double` | `real` | string in hash | `double` |
| `bool` | `boolean` | `bool` | `integer 0/1` | string in hash | `boolean` |
| `time` | `timestamptz` | `date` | `text (ISO)` / integer | string in hash | `timestamp` |
| `doc` | `jsonb` | embedded document | `JSON text` | serialized JSON | `map` |
| `list<T>` | `array` or `jsonb` | `array` | `JSON text` | serialized JSON | `array` |
| `link<C>` | key column (+ FK within same connection) | reference value | key column | reference value | reference / string |
| `vector(N)` | `vector(N)` (pgvector) | array of floats (Atlas) | engine-dependent | not supported | vector value |

### Appendix E. Frequently Asked Questions
- **Is Colt a replacement for SQL?**  
  No. Colt targets SQL databases as well as key-value, document, and vector engines. If you only ever use one relational database, SQL is fine. Colt becomes valuable when you use more than one kind of store and want the relationships between them formally declared and verified.
- **Does Colt give me transactions across databases?**  
  No, and it says so. Use `ATOMIC` within one connection, and melds (with their stated consistency guarantees) across connections.
- **Do I need an account to use Colt?**  
  Not in local mode. The CLI and Python SDK connect to your own databases directly on your machine.
- **Which databases can I connect?**  
  Any server speaking supported engine protocols (`postgres`, `redis`, `mongodb`, `sqlite`, `libsql`), plus provider-specific adapters (`firestore`, `d1`). Providers are interchangeable presets.
- **Can I add my own engine?**  
  Yes. The engine architecture allows a new engine in an existing family to be added via a small driver and manifest, without requiring language changes.

---

*The Colt language and the Meld Model are conceived and created by **Ayush Bhattacharya**.*
