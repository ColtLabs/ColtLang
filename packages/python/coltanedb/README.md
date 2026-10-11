# ColtaneDB Python SDK (`coltanedb`)

Official Python client and query SDK for **ColtaneDB** and the **Colt** (`.colt`, ColtLang) declarative query language, powered by the **Meld Model** (Multi-Engine Link Declaration).

*Conceived and created by **Ayush Bhattacharya**.*

---

## Installation

Install the package from PyPI:

```bash
pip install coltanedb
```

---

## Features

- **The Meld Model**: Query, link, and stitch records seamlessly across PostgreSQL, Redis, MongoDB, and SQLite.
- **Declarative Query Execution**: Execute `.colt` statements with injection-proof parameter binding.
- **Multi-Engine Planning**: Inspect native parameterized query plans before executing (`client.plan`).
- **Interactive Language Guide**: Export the complete Colt Language Reference via `coltanedb.guide(file=True)`.
- **Author & Project Metadata**: Inspect author credentials and repository links via `coltanedb.author()`.

---

## Quickstart

### 1. Initialize the Client

```python
import coltanedb
from coltanedb import ColtaneClient

# Initialize from an app.colt file (resolves connections via environment)
db = ColtaneClient.from_file("app.colt")

# Or connect to a running ColtaneDB bridge (colt serve) or server
client = ColtaneClient(
    base_url="http://localhost:3000",
    api_key="clt_live_demo",
)
```

### 2. Execute a Colt Query

```python
# Run with bound parameters
result = client.run("FIND books WHERE views > $min LIMIT 10", min=10)

print("Query success:", result.success)
for row in result.rows:
    print(f"Book: {row['title']}")

# Inspect execution metadata and cross-engine status
print(result.meta)
```

### 3. Generate the Complete Colt Language Guide

```python
# Creates a COLT_GUIDE.md file in the current working directory
coltanedb.guide(file=True)

# Or print readable plain text directly to the console
coltanedb.guide(file=False)
```

### 4. Author & Attribution

```python
# Prints author info with clickable terminal hyperlinks
coltanedb.author()
```

### 5. Inspect Execution Plans

```python
plan = client.plan("""
    FIND reviews FETCH book 
    WHERE book.views > 10 
    LIMIT 20
""")

for step in plan.steps:
    print(f"Backend: {step.backend}, Op: {step.operation}")
```

---

## License

Apache-2.0 © Ayush Bhattacharya & ColtaneDB Team
