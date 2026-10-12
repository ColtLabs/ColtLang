# ColtLang

<div align="center">

```
   ______      ____ 
  / ____/___  / / /_
 / /   / __ \/ / __/
/ /___/ /_/ / / /_  
\____/\____/_/\__/  
```

### ColtLang: The official language specification, AST, and parser for Colt.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec: CC-BY-4.0](https://img.shields.io/badge/Spec-CC--BY--4.0-emerald.svg)](spec/LICENSE)
[![Specification: v0.2 Draft](https://img.shields.io/badge/Colt_Spec-v0.2_(draft)-purple.svg)](spec/SPEC.md)
[![Tests: Passing](https://img.shields.io/badge/Tests-Passing-brightgreen.svg)](tests/)

**Colt** (also written **ColtLang**, file extension `.colt`) is the unified query and data-definition language for working with multiple database engines through one syntax, powered by the Meld Model.

*Conceived and created by **Ayush Bhattacharya**.*

[Language Documentation](DOCUMENTATION.md) • [Language Specification](spec/SPEC.md) • [EBNF Grammar](spec/grammar.ebnf) • [VS Code Extension](editors/vscode/) • [Project Status](docs/STATUS.md)

</div>

---

## 📖 Table of Contents

- [The Problem & The Solution](#-the-problem--the-solution)
- [Design Principles](#-design-principles)
- [The Meld Model (MELD)](#-the-meld-model-meld)
  - [The Three Layers](#the-three-layers)
  - [The Three Kinds of Melds](#the-three-kinds-of-melds)
- [A Tour of Colt](#-a-tour-of-colt)
- [Colt at a Glance (SQL vs MongoDB vs Redis vs Colt)](#-colt-at-a-glance)
- [Supported Engines & Capabilities](#-supported-engines--capabilities)
- [Consistency & Failure Guarantees](#-consistency--failure-guarantees)
- [Security Model & Minimal Footprint](#-security-model--minimal-footprint)
- [Tooling & CLI (`colt`)](#-tooling--cli-colt)
- [Local Development & Testing](#-local-development--testing)
- [License & Creator](#-license--creator)

---

## ⚡ The Problem & The Solution

### The Problem
Real-world software uses several kinds of databases at once:
- **Relational tables** for transactional business data (PostgreSQL, MySQL, SQLite).
- **Key-value stores** for ultra-fast caching and ephemeral sessions (Redis, Valkey).
- **Document stores** for flexible, polymorphic metadata (MongoDB, Firestore).
- **Vector databases** for AI semantic search (pgvector, Pinecone).

Each database forces you to write in its own query language (SQL, Redis imperative commands, MongoDB aggregation JSON), juggle incompatible connection drivers, and write brittle application glue code to keep records synchronized.

### What Colt Is
Colt is one declarative language for:
1. **Describing data** (collections, fields, types, constraints),
2. **Querying and changing data** (`FIND`, `PUT`, `CREATE`, `DELETE`),
3. **Declaring connections** to the databases that hold it (`CONNECT`), and
4. **Declaring relationships between databases** (`DEFINE MELD`), which is Colt's distinguishing breakthrough.

A Colt program is compiled into the native operations of each database it targets. **Colt does not replace your databases.** It sits in front of the databases you already run and gives them a common, elegant language.

### What Colt Is Not
- **It is not a database engine**: It stores nothing by itself.
- **It is not a general-purpose programming language**: It has no loops, user-defined functions, or arbitrary code execution. A declarative language can be checked, planned, explained, and secured.
- **It does not fake cross-database ACID transactions**: Where a guarantee is weaker, Colt is completely transparent in the language, in compiler diagnostics, and in execution plans.

---

## 🎯 Design Principles

1. **One language, many engines**: Learn one syntax. The compiler handles dialect differences.
2. **Declarative**: You state what you want; the planner decides how. Inspect execution plans with `colt plan` before running.
3. **Beginner-friendly, expert-capable**: Anyone can read `FIND books WHERE views > 10` without training. An expert can inspect the generated parameterized queries.
4. **Honest about consistency**: Every operation that spans databases states its exact guarantee.
5. **Secrets stay out of source**: Connection strings never appear in `.colt` files (`env("VAR")` only).
6. **Engine-aware**: The compiler knows what each engine can do and refuses what it cannot with clear diagnostic codes (e.g. `COLT2026`).
7. **Extensible**: New engines, statements, and annotations can be added without breaking existing programs.
8. **Readable**: Keywords are plain English words; code reads close to a natural sentence.

---

## 🧬 The Meld Model (MELD)

**MELD** stands for **Multi-Engine Link Declaration**.

A meld is a declared, named relationship between data that lives in two or more connections. The connections can use different engines (PostgreSQL and Redis) or the same engine (two separate PostgreSQL databases).

### The Three Layers
A Colt program is organized into three distinct layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 3: MELDS        How data on different connections relates,       │
│                       and what must be kept true (DEFINE MELD)         │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: COLLECTIONS  What the data looks like, and which connection   │
│                       holds it (DEFINE COLLECTION)                     │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 1: CONNECTIONS  Where data lives: an engine plus an endpoint     │
│                       referenced by alias (CONNECT)                    │
└────────────────────────────────────────────────────────────────────────┘
```

| Layer | Declared With | Answers the Question |
| :--- | :--- | :--- |
| **Connections** | `CONNECT` | *Where does the data live?* |
| **Collections** | `DEFINE COLLECTION` | *What is the data, and which connection holds it?* |
| **Melds** | `DEFINE MELD` (or cross-connection `link<T>`) | *How are the stores related, and what must stay true?* |

---

### The Three Kinds of Melds

| Kind | Declares | Practical Example | Guarantee |
| :--- | :--- | :--- | :--- |
| **`LINK`** | A reference from a record on one connection to a record on another | A review in MongoDB points to a book in PostgreSQL | Resolved at read time via stitched lookup; not transactional. |
| **`SYNC`** | A projection that copies data from a source to a target | Popular books kept in Redis cache for 10 minutes | Eventually consistent; rebuildable from source. Modes: `write_through`, `reconcile`, `cdc`. |
| **`CONSTRAINT`** | A rule that must hold across connections | A review must reference an existing book | Checked on write, verified by reconciliation; not atomic. Modes: `check_on_write`, `flag`, `reject`. |

Why this matters: in most projects, these relationships exist only as undocumented, fragile code scattered across microservices. In Colt, they are written down once, named, checked by the compiler, visualized in query plans, and verified by tooling.

---

## 🚀 A Tour of Colt

A complete program using the Meld Model across **PostgreSQL**, **Redis**, and **MongoDB**:

```colt
#colt 0.2

// -------------------------------------------------------------
// 1. CONNECTIONS: Declare your infrastructure
// -------------------------------------------------------------
CONNECT main  AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))

DEFAULT CONNECTION main

// -------------------------------------------------------------
// 2. COLLECTIONS: Declare schemas and storage placement
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 3. MELDS: Declare cross-database relationships
// -------------------------------------------------------------
DEFINE MELD book_reviews LINK       reviews.book -> books.id
DEFINE MELD hot_books    SYNC       books TO cache KEY id TTL 10m
DEFINE MELD review_book  CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write

// -------------------------------------------------------------
// 4. QUERIES & MUTATIONS: Query across stores seamlessly
// -------------------------------------------------------------

// Stitched query across MongoDB (reviews) and PostgreSQL (books)
FIND reviews FETCH book 
WHERE book.views > 10 
LIMIT 20

// Idempotent record upsert
PUT books:11111111-1111-4111-8111-111111111111 {
  title: "The Left Hand of Darkness",
  author: authors:22222222-2222-4222-8222-222222222222,
  tags: ["science-fiction", "classic"],
  metadata: { edition: 3, language: "en" },
  views: 42
}

// Single-connection transactional atomic block
ATOMIC {
  DELETE books:33333333-3333-4333-8333-333333333333;
  PUT authors:22222222-2222-4222-8222-222222222222 { 
    name: "Ursula K. Le Guin" 
  }
}
```

---

## 📊 Colt at a Glance

How standard operations compare across the primary database language families:

| Task | SQL (Relational) | MongoDB (Document) | Redis (Key-Value) | Colt (ColtLang) |
| :--- | :--- | :--- | :--- | :--- |
| **Read with filter** | `SELECT title FROM books WHERE views > 10 ORDER BY views DESC LIMIT 20;` | `db.books.find({views: {$gt: 10}}).sort({views: -1}).limit(20)` | *(Requires custom secondary indices)* | `FIND books SELECT title WHERE views > 10 ORDER BY views DESC LIMIT 20` |
| **Insert or replace by ID** | `INSERT ... ON CONFLICT ... DO UPDATE` | `replaceOne({_id}, doc, {upsert: true})` | `SET key value` | `PUT books:<id> { ... }` |
| **Insert only** | `INSERT INTO books ...` | `insertOne(doc)` | `SETNX key value` | `CREATE books { ... }` |
| **Delete by ID** | `DELETE FROM books WHERE id = ...` | `deleteOne({_id})` | `DEL key` | `DELETE books:<id>` |
| **Expire records** | *(Manual cleanup cron job)* | TTL Index | `EXPIRE key 1800` | `@ttl(30m)` on collection |
| **Relate across two databases** | *Application glue code* | *Application glue code* | *Application glue code* | `DEFINE MELD ...` |

---

## 🔌 Supported Engines & Capabilities

Colt targets **underlying database engine protocols**, not cloud brand names:

| Capability | `postgres` | `mongodb` | `sqlite` / `libsql` / `d1` | `redis` | `firestore` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`FIND` with `WHERE`, `ORDER BY`, `LIMIT`** | ✅ Yes | ✅ Yes | ✅ Yes | Key access & index lookups | Limited (index rules apply) |
| **Nested document paths (`a.b.c`)** | ✅ Yes (JSONB) | ✅ Native | Partial | ❌ No | ✅ Native (with limits) |
| **`ATOMIC` transactions** | ✅ Yes | ✅ Yes (replica sets) | Limited | ❌ No | ✅ Yes (with limits) |
| **`@ttl` automatic expiration** | Via scheduled cleanup | ✅ Yes | Via cleanup | ✅ Native | Via policy |
| **Vector index & `NEAREST`** | ✅ Yes (pgvector) | ✅ Yes (Atlas) | Varies | ❌ No | ✅ Yes |
| **Graph path expressions** | ✅ Yes (recursive) | ✅ Yes (graph lookup) | ✅ Yes (recursive) | ❌ No | ❌ No |
| **Time-series windows** | ✅ Yes | ✅ Yes | Basic | ❌ No | ❌ No |

---

## ⚖️ Consistency & Failure Guarantees

Colt states consistency guarantees honestly rather than pretending multiple databases can perform distributed ACID transactions:

| Operation | Guarantee | Details |
| :--- | :--- | :--- |
| **Single statement on 1 connection** | Whatever the backing engine provides | Native engine semantics (ACID on Postgres, atomic on Redis). |
| **`ATOMIC` on 1 connection** | Transactional | Runs inside a native transaction if supported; compiler error otherwise. |
| **`ATOMIC` across connections** | ❌ **Forbidden by compiler** (`COLT2025`) | No distributed two-phase commit illusion. Use `SAGA` with compensations. |
| **`LINK` read (`FETCH`)** | Point-in-time per connection | Stitched lookup; between the two engine reads, data may change. |
| **`SYNC` projection** | Eventually consistent | Rebuildable at any time from source via `colt rebuild <meld>`. |
| **`CONSTRAINT` cross-database rule** | Best-effort | Checked on write (`check_on_write`), verified by periodic scans (`colt melds check`). |

---

## 🔒 Security Model & Minimal Footprint

1. **No secrets in source**: Connections use `env("VAR")`; the compiler strictly rejects literal credentialed URLs (`COLT2023`).
2. **No injection by construction**: Values are always bound parameters; identifiers are validated against schema declarations.
3. **No arbitrary code execution**: Colt has no user-defined code, loops, or shell execution; it cannot be exploited for remote code execution.
4. **Minimal footprint (Good Manners)**: Colt creates objects only within designated namespaces and **never** inspects or alters tables outside its scope:
   - **PostgreSQL**: Dedicated `colt` schema (`colt.books`).
   - **Redis**: Key prefix `colt:` (`colt:books:101`).
   - **MongoDB / SQLite**: Table/collection prefix `colt_` (`colt_books`).
5. **Redaction**: Plans, logs, errors, and exports automatically redact connection strings and secrets.

---

## 🛠️ Tooling & CLI (`colt 0.2.0`)

The native `colt` CLI is an ultra-fast, engine-aware, zero-dependency binary written in Rust:

```bash
# Check syntax, schema, and capability rules
colt check library.colt

# Inspect the compiled multi-engine execution plan without running
colt plan library.colt

# Format source code consistently and idempotently
colt fmt library.colt

# Output AST or tokens as structured JSON
colt parse --json library.colt
colt lex --json library.colt

# Inspect supported engine capabilities
colt capabilities

# Print toolchain version
colt version
```

### Installation & Building

```bash
# Install native binary directly via Cargo
cargo install --path crates/colt-cli

# Or build the release binary locally (target/release/colt)
cargo build --release -p colt-cli
```

### Performance

| Measurement | Native Rust (`colt.exe`) | TypeScript / Node Reference | Speedup |
| :--- | :--- | :--- | :--- |
| **Cold-start check** | **23.18 ms** | 1,840 ms | **~80x faster** |
| **Binary size** | **~5.2 MB** (standalone) | ~140 MB (`node_modules`) | **Zero dependencies** |
| **Memory usage** | **< 12 MB** | ~95 MB (V8 runtime) | **~8x lower** |

---

## 💻 Local Development & Testing

ColtLang includes both the Rust-native production toolchain and differential parity validation against the reference suite:

### 1. Rust Native Workspace
```bash
# Run all unit, integration, and fuzz tests across all 8 crates (72 tests)
cargo test --workspace

# Build the release toolchain
cargo build --release -p colt-cli
```

### 2. TypeScript Reference & Differential Parity Suite
```bash
# Install dependencies
corepack pnpm install

# Run full parity and conformance test suite (147 tests)
corepack pnpm test

# Run linter and typechecker
corepack pnpm lint
corepack pnpm typecheck
```

---

## ⚖️ License & Creator

- **Language Engine & Codebase**: [Apache-2.0 License](LICENSE)
- **Colt Language Specification**: [Creative Commons Attribution 4.0 International (CC-BY-4.0)](spec/LICENSE)

### Creator
Conceived and created by:  
**Ayush Bhattacharya**  
Email: [info.cometlabs@gmail.com](mailto:info.cometlabs@gmail.com)  
GitHub: [@itsjustayush](https://github.com/itsjustayush)