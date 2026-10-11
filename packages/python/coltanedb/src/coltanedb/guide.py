"""
Colt Language Reference Guide and Author Metadata Module
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Provides built-in access to the complete Colt language reference specification
and creator attribution metadata.
"""

from __future__ import annotations

import os
import re
import sys
from typing import Optional

COLT_GUIDE_MARKDOWN = """# The Colt Language Reference

Colt is a unified query and data-definition language for working with many kinds of
databases through one syntax. Created by Ayush Bhattacharya.

| Property | Value |
| :--- | :--- |
| **Language** | Colt (also written ColtLang) |
| **File extension** | `.colt` (for example `app.colt`, `main.colt`, `sampledb.colt`) |
| **Product built on Colt** | ColtaneDB |
| **Python package** | `coltanedb` |
| **Specification version** | 0.2 (draft) |
| **Core concept** | The Meld Model (MELD = Multi-Engine Link Declaration) |
| **License** | Apache-2.0 (Code) / CC-BY-4.0 (Specification) |

---

## How to Read the Status Tags
This document is a language specification. Each feature carries a status tag:
- **`[core]`**: The stable core of version 0.2. Fully implemented and verified.
- **`[proposed]`**: Designed and documented; details may still evolve.
- **`[reserved]`**: The keyword or syntax is reserved so later versions will not break existing programs. Using it produces a "reserved construct" error (`COLT2003`).

The implementation status is tracked in `docs/STATUS.md` and the conformance suite in `spec/conformance`.

---

## 1. Introduction

### 1.1 The Problem
Real applications use several kinds of databases at once: relational tables for business data, a key-value store for caching and sessions, a document store for flexible content, sometimes a vector index for AI search. Each has its own language (SQL, Redis commands, MongoDB's query language), its own drivers, and its own idea of consistency. The relationships between these stores usually live in scattered glue code that nobody can inspect.

### 1.2 What Colt Is
Colt is one declarative language for:
1. Describing data (`DEFINE COLLECTION`),
2. Querying and changing data (`FIND`, `PUT`, `CREATE`, `DELETE`),
3. Declaring connections to the databases that hold it (`CONNECT`), and
4. Declaring relationships between databases (`DEFINE MELD`), which is Colt's distinguishing feature.

A Colt program is compiled into the native operations of each database it targets. Colt does not replace those databases. It sits in front of the ones you already run and gives them a common language.

### 1.3 What Colt Is Not
- **It is not a database engine**: It stores nothing by itself.
- **It is not a general-purpose programming language**: It has no loops, user-defined functions, or arbitrary code execution.
- **It does not make several databases behave like one ACID database**: Where a guarantee is weaker, Colt says so explicitly in the language, in error messages, and in documentation.

### 1.4 Prior Art and Positioning
Systems that put one interface over several databases are called polystores. Multi-model databases (e.g. SurrealDB, ArangoDB) offer several data models inside one engine. Colt takes a different route: it compiles to engines the user already operates, and it makes the relationship between them a first-class, declared part of the language: the Meld Model.

### 1.5 Creator
Colt, the Meld Model, and ColtaneDB were conceived and created by **Ayush Bhattacharya**.

---

## 2. Design Principles

1. **One language, many engines**: Learn one syntax. The compiler handles dialect differences.
2. **Declarative**: You state what you want; the planner decides how. Programs can be explained (`colt plan`) before they run.
3. **Beginner-friendly, expert-capable**: A newcomer can read `FIND books WHERE views > 10` without training. An expert can inspect the generated native queries.
4. **Honest about consistency**: Every operation that spans databases states its guarantee.
5. **Secrets stay out of source**: Connection strings never appear in `.colt` files.
6. **Engine-aware**: The compiler knows what each engine can do and refuses what it cannot do with a clear message.
7. **Extensible**: New engines, statements, and annotations can be added without breaking old programs.
8. **Readable**: Keywords are plain English words; code reads close to a sentence.

---

## 3. The Meld Model

**MELD stands for Multi-Engine Link Declaration.**

A meld is a declared, named relationship between data that lives in two or more connections. The connections can use different engines (Postgres and Redis) or the same engine (two separate Postgres databases).

### The Three Layers:
- **Layer 3: MELDS** — How data on different connections relates, and what must be kept true (`DEFINE MELD`).
- **Layer 2: COLLECTIONS** — What the data looks like, and which connection holds it (`DEFINE COLLECTION`).
- **Layer 1: CONNECTIONS** — Where data lives: an engine plus an endpoint, referenced by alias (`CONNECT`).

### The Three Kinds of Melds:
- **`LINK`**: A reference from a record on one connection to a record on another (e.g. reviews in MongoDB pointing to books in Postgres). Resolved at read time via stitched lookup; non-transactional.
- **`SYNC`**: A projection that copies data from a source to a target (e.g. popular books in Redis for 10 minutes). Eventually consistent; rebuildable from source. Modes: `write_through`, `reconcile`, `cdc`.
- **`CONSTRAINT`**: A rule that must hold across connections (e.g. review must reference existing book). Checked on write, verified by reconciliation; not atomic. Modes: `check_on_write`, `flag`, `reject`.

---

## 4. A Tour of Colt

```colt
#colt 0.2

CONNECT main  AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))
DEFAULT CONNECTION main

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

DEFINE COLLECTION reviews FLEXIBLE @backend(notes) {
  id: uuid @key,
  book: link<books>,
  body: text,
  meta: doc
}

DEFINE COLLECTION sessions @backend(cache) @ttl(30m) {
  value: text
}

-- Melds
DEFINE MELD book_reviews LINK       reviews.book -> books.id
DEFINE MELD hot_books    SYNC       books TO cache KEY id TTL 10m
DEFINE MELD review_book  CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write

-- Stitched cross-engine query
FIND reviews FETCH book WHERE book.views > 10 LIMIT 20

-- Atomic single-connection transaction
ATOMIC {
  DELETE books:33333333-3333-4333-8333-333333333333;
  PUT authors:22222222-2222-4222-8222-222222222222 { name: "Ursula K. Le Guin" }
}
```

---

## 5. Engines and Capabilities

| Capability | postgres | mongodb | sqlite / libsql / d1 | redis | firestore |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`FIND` with filters** | Yes | Yes | Yes | Key access & indexes | Limited |
| **Nested document paths**| Yes (JSONB) | Native | Partial | No | Native |
| **`ATOMIC` blocks** | Yes | Yes (replica sets)| Limited | No | Yes (limits) |
| **`@ttl` expiration** | Via cleanup | Yes | Via cleanup | Native | Via policy |
| **Vector index** | Yes (pgvector)| Yes (Atlas) | Varies | No | Yes |

---

## 6. Consistency Summary

- **Single statement on one connection**: Native engine guarantee.
- **`ATOMIC` on one connection**: Transactional if the engine supports it.
- **`ATOMIC` across connections**: **Forbidden** (compiler diagnostic `COLT2025`).
- **`LINK` read (`FETCH`)**: Point-in-time per connection, stitched in memory.
- **`SYNC` projection**: Eventually consistent; rebuildable from source.
- **`CONSTRAINT` rule**: Checked on write, verified by reconciliation scan.

---

## 7. Colt at a Glance (Paradigm Comparison)

| Task | SQL | MongoDB | Redis | Colt (ColtLang) |
| :--- | :--- | :--- | :--- | :--- |
| **Read with filter** | `SELECT title FROM books WHERE views > 10;` | `db.books.find({views: {$gt: 10}})` | Key lookup | `FIND books SELECT title WHERE views > 10` |
| **Upsert by ID** | `INSERT ... ON CONFLICT DO UPDATE` | `replaceOne({_id}, doc, {upsert: true})` | `SET key val` | `PUT books:<id> { ... }` |
| **Insert only** | `INSERT INTO books ...` | `insertOne(doc)` | `SETNX key val`| `CREATE books { ... }` |
| **Delete by ID** | `DELETE FROM books WHERE id = ...` | `deleteOne({_id})` | `DEL key` | `DELETE books:<id>` |
| **Expire records** | Manual cleanup job | TTL Index | `EXPIRE key 1800` | `@ttl(30m)` on collection |
| **Relate 2 stores** | Application glue code | Application glue code | Application code | `DEFINE MELD ...` |
"""


def guide(file: bool = True) -> str:
    """Access or export the official Colt Language Reference specification.

    Parameters:
        file (bool):
            If True (default), writes the complete Colt Language Reference into
            a 'COLT_GUIDE.md' file in the current working directory.
            If False, strips markdown formatting and prints the full reference
            as readable plain text directly to standard output.

    Returns:
        str:
            If file=True, returns the absolute path of the created 'COLT_GUIDE.md' file.
            If file=False, returns the plain-text guide output.

    Example:
        >>> import coltanedb
        >>> # Generate reference guide file in project directory
        >>> coltanedb.guide(file=True)
        'E:/Projects/MyProject/COLT_GUIDE.md'

        >>> # Display guide in terminal
        >>> coltanedb.guide(file=False)
    """
    if file:
        target_path = os.path.abspath(os.path.join(os.getcwd(), "COLT_GUIDE.md"))
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(COLT_GUIDE_MARKDOWN.strip() + "\n")
        print(f"Colt Language Reference written to: {target_path}")
        return target_path
    else:
        # Strip markdown syntax for clean terminal display
        plain_text = COLT_GUIDE_MARKDOWN
        # Remove markdown headers
        plain_text = re.sub(r"^#{1,6}\s*", "", plain_text, flags=re.MULTILINE)
        # Remove bold / italic markers
        plain_text = re.sub(r"\*\*([^*]+)\*\*", r"\1", plain_text)
        plain_text = re.sub(r"\*([^*]+)\*", r"\1", plain_text)
        # Remove inline backticks
        plain_text = re.sub(r"`([^`]+)`", r"\1", plain_text)
        # Remove code block markers
        plain_text = re.sub(r"```[a-z]*\n", "", plain_text)
        plain_text = re.sub(r"```", "", plain_text)
        # Strip horizontal rules
        plain_text = re.sub(r"^\s*---\s*$", "", plain_text, flags=re.MULTILINE)
        plain_text = plain_text.strip()
        print(plain_text)
        return plain_text


def author() -> str:
    """Print author, contact, project, and version metadata with clickable terminal hyperlinks.

    Uses ANSI OSC 8 terminal hyperlink escape sequences where supported,
    with standard URL fallback for universal terminal compatibility.

    Returns:
        str: The formatted author and project metadata block.

    Example:
        >>> import coltanedb
        >>> coltanedb.author()
    """
    try:
        from . import __version__
    except ImportError:
        __version__ = "0.2.0"

    author_name = "Ayush Bhattacharya"
    author_url = "https://github.com/itsjustayush"
    email = "info.cometlabs@gmail.com"
    email_url = f"mailto:{email}"
    project_name = "ColtaneDB"
    project_url = "https://github.com/itsjustayush/ColtaneDB"

    # OSC 8 Hyperlink formatting: \033]8;;URL\033\TEXT\033]8;;\033\
    link_author = f"\033]8;;{author_url}\033\\{author_name}\033]8;;\033\\ ({author_url})"
    link_email = f"\033]8;;{email_url}\033\\{email}\033]8;;\033\\ ({email_url})"
    link_project = f"\033]8;;{project_url}\033\\{project_name}\033]8;;\033\\ ({project_url})"

    lines = [
        link_author,
        link_email,
        link_project,
        f"Version: {__version__}",
    ]
    output = "\n".join(lines)
    print(output)
    return output
