# Coltane (ColtLang) Python Client & SDK

Official Python client for **ColtaneDB** and the **Colt** query language (`.colt`).

## Installation

This package has not been published to PyPI yet. From the repository root, install the local package with:

```bash
python -m pip install -e ./python
```

After a release is published, the intended PyPI installation will be:

```bash
python -m pip install coltane
```

## Quick Start

```python
import coltane

# Initialize client
client = coltane.Client("http://localhost:3000")

# Plan raw Colt query. This preview does not execute database operations.
source = """
DEFINE COLLECTION books STRICT @backend(neon) {
  id: uuid @key,
  title: text,
  views: int @default(0)
}

FIND books SELECT title, views
WHERE views > 10
ORDER BY views DESC
LIMIT 10
"""

# Plan and compile to PostgreSQL; no database writes are performed.
plan = client.plan(source)

if plan.is_valid:
    for step in plan.steps:
        print(f"Backend: {step.backend}")
        print(f"SQL: {step.parameterized_statement}")
        print(f"Parameters: {step.params}")
else:
    for diag in plan.diagnostics:
        print(f"Error [{diag.code}]: {diag.message}")
```

## Fluent Query Builder

You can also construct Colt statements in a pythonic syntax:

```python
import coltane

# Build a schema definition
schema = (
    coltane.collection("users", backend="neon")
    .field("id", "uuid", "@key")
    .field("email", "text", "@unique")
    .field("created", "time", "@default(now)")
)
print(schema.to_colt())

# Build a query
q = (
    coltane.query("users")
    .select("id", "email")
    .where("created != null")
    .order_by("created", desc=True)
    .limit(20)
)
print(q.to_colt())
```

## CLI Usage

```bash
# Plan a Colt file directly
python -m coltane plan examples/library.colt

# Parse AST
python -m coltane parse examples/library.colt
```
