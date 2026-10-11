"""
ColtaneDB Python SDK (ColtLang)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Official Python client and query tooling for ColtaneDB and Colt query language.

Basic usage:

    import coltane

    client = coltane.Client("http://localhost:3000")

    # Plan a query
    plan = client.plan('''
        FIND books SELECT title, author, views
        WHERE views > 10
        ORDER BY views DESC
        LIMIT 20
    ''')

    for step in plan.steps:
        print(step.sql, step.params)
"""

from .client import Client, PlanResult, ParseResult, Diagnostic
from .builder import query, collection

__version__ = "0.1.0"
__all__ = ["Client", "PlanResult", "ParseResult", "Diagnostic", "query", "collection"]
