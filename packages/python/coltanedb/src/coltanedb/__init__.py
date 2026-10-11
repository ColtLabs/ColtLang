"""
ColtaneDB Python SDK (`coltanedb`)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Official Python client and query tooling for ColtaneDB and the Colt query language (ColtLang).
Powered by the Meld Model (Multi-Engine Link Declaration).

Basic usage:

    import coltanedb
    from coltanedb import ColtaneClient, query

    # Connect to local bridge or hosted ColtaneDB runner
    client = ColtaneClient("http://localhost:3000", api_key="clt_live_demo")

    # Execute a Colt query across engines
    res = client.run("FIND books WHERE views > $min LIMIT 10", min=10)
    for row in res.rows:
        print(row["title"])

    # Export the official Colt Language Reference Guide to COLT_GUIDE.md
    coltanedb.guide(file=True)

    # Print author and project metadata with clickable terminal hyperlinks
    coltanedb.author()
"""

from .client import (
    ColtaneClient,
    Client,
    QueryResult,
    PlanResult,
    ParseResult,
    Diagnostic,
    PlanStep,
    ColtaneError,
    ColtaneAuthError,
    ColtaneConnectionError,
    ColtaneQueryError,
)
from .builder import query, collection, QueryBuilder, CollectionBuilder
from .guide import guide, author, COLT_GUIDE_MARKDOWN

__version__ = "0.2.0"
__author__ = "Ayush Bhattacharya"
__email__ = "info.cometlabs@gmail.com"

__all__ = [
    "ColtaneClient",
    "Client",
    "QueryResult",
    "PlanResult",
    "ParseResult",
    "Diagnostic",
    "PlanStep",
    "ColtaneError",
    "ColtaneAuthError",
    "ColtaneConnectionError",
    "ColtaneQueryError",
    "query",
    "collection",
    "QueryBuilder",
    "CollectionBuilder",
    "guide",
    "author",
    "COLT_GUIDE_MARKDOWN",
    "__version__",
    "__author__",
    "__email__",
]
