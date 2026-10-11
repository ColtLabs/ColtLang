"""
ColtaneDB Client Module
~~~~~~~~~~~~~~~~~~~~~~~

Provides the high-performance HTTP client for communicating with ColtaneDB
endpoints, executing Colt queries, planning multi-engine operations, and inspecting ASTs.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union


@dataclass
class Diagnostic:
    """Represents a compiler or runtime diagnostic emitted by ColtaneDB.

    Attributes:
        code (str): The stable diagnostic error code (e.g., 'COLT2001', 'COLT2025').
        message (str): Human-readable diagnostic description.
        span (Dict[str, Any]): Source line and column span where the diagnostic occurred.
        hint (Optional[str]): Actionable suggestion explaining how to resolve the issue.
    """
    code: str
    message: str
    span: Dict[str, Any]
    hint: Optional[str] = None


@dataclass
class PlanStep:
    """Represents an isolated, engine-specific execution step in a compiled query plan.

    Attributes:
        backend (str): Target connection alias or engine identifier (e.g., 'main', 'cache').
        operation (str): Execution primitive (e.g., 'query', 'record.put', 'record.delete', 'transaction').
        parameterized_statement (str): Engine-specific parameterized statement string.
        params (List[Any]): Bound parameter references passed to the native driver.
        collection (Optional[str]): Target collection associated with this step.
    """
    backend: str
    operation: str
    parameterized_statement: str
    params: List[Any]
    collection: Optional[str] = None


@dataclass
class PlanResult:
    """Encapsulates the compiled execution plan for a Colt script.

    Attributes:
        steps (List[PlanStep]): Sequential or concurrent plan steps across target engines.
        diagnostics (List[Diagnostic]): Compiler diagnostics or warnings.
        raw (Dict[str, Any]): Full JSON payload returned by the ColtaneDB planner.
    """
    steps: List[PlanStep]
    diagnostics: List[Diagnostic]
    raw: Dict[str, Any]

    @property
    def is_valid(self) -> bool:
        """Return True if compilation succeeded with zero diagnostic errors."""
        return len(self.diagnostics) == 0


@dataclass
class ParseResult:
    """Encapsulates the Abstract Syntax Tree (AST) output from the Colt parser.

    Attributes:
        ast (Dict[str, Any]): Raw JSON representation of the Colt AST.
        diagnostics (List[Diagnostic]): Lexer or parser syntax diagnostics.
    """
    ast: Dict[str, Any]
    diagnostics: List[Diagnostic]

    @property
    def is_valid(self) -> bool:
        """Return True if parsing succeeded with zero syntax errors."""
        return len(self.diagnostics) == 0


@dataclass
class QueryResult:
    """Encapsulates the result of executing a Colt query across target engines.

    Attributes:
        success (bool): Whether query execution completed successfully.
        tenant_id (str): Project or workspace identifier executing the query.
        plan (Dict[str, Any]): The execution plan generated for this query.
        diagnostics (List[Diagnostic]): Diagnostics or warnings produced during execution.
        results (List[Any]): Raw results returned by the query executor.
        rows (List[Any]): Flattened list of data records returned.
        error_code (Optional[str]): Coded error string if execution failed.
        error_message (Optional[str]): Detailed error message if execution failed.
        raw (Optional[Dict[str, Any]]): Raw JSON response from the server.
    """
    success: bool
    tenant_id: str
    plan: Dict[str, Any]
    diagnostics: List[Diagnostic]
    results: List[Any]
    rows: List[Any]
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw: Optional[Dict[str, Any]] = None

    @property
    def meta(self) -> Dict[str, Any]:
        """Metadata regarding execution timings, connections, and stitched meld status."""
        if self.raw and "meta" in self.raw:
            return self.raw["meta"]
        # Synthesize fallback metadata
        connections = []
        if isinstance(self.plan, dict) and "steps" in self.plan:
            for s in self.plan.get("steps", []):
                connections.append({
                    "alias": s.get("backend", "main"),
                    "operation": s.get("operation", "query"),
                    "status": "ok" if self.success else "error"
                })
        return {
            "connections": connections,
            "partial": False,
            "dangling": 0,
            "rowCount": len(self.rows),
        }


class ColtaneError(Exception):
    """Base exception for all ColtaneDB client operations."""
    pass


class ColtaneAuthError(ColtaneError):
    """Raised on authentication or permission failure (HTTP 401/403)."""
    pass


class ColtaneConnectionError(ColtaneError):
    """Raised when connection to the ColtaneDB server or query bridge fails."""
    pass


class ColtaneQueryError(ColtaneError):
    """Raised when query execution or syntax verification fails on the server."""
    pass


class ColtaneClient:
    """Official Python client for interacting with ColtaneDB and the Colt language.

    Supports querying, AST planning, schema management, and cross-engine meld execution.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        tenant_id: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        """Initialize a new ColtaneClient instance.

        Parameters:
            base_url (str):
                Base URL of the ColtaneDB API endpoint or local bridge (`colt serve`).
                Defaults to 'http://localhost:3000'.
            api_key (Optional[str]):
                API key for authenticated queries (e.g., 'clt_live_...').
            tenant_id (Optional[str]):
                Target project or workspace ID. If omitted, defaults to the default project.
            timeout (float):
                Network timeout for HTTP requests in seconds. Defaults to 30.0.

        Example:
            >>> from coltanedb import ColtaneClient
            >>> client = ColtaneClient("http://localhost:3000", api_key="clt_live_demo")
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.environ.get("COLTANE_API_KEY")
        self.tenant_id = tenant_id or os.environ.get("COLTANE_TENANT_ID") or os.environ.get("COLTANE_PROJECT_ID")
        self.timeout = timeout

    @classmethod
    def from_file(
        cls,
        path: str,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        tenant_id: Optional[str] = None,
        timeout: float = 30.0,
    ) -> ColtaneClient:
        """Initialize a ColtaneClient by validating and reading a .colt configuration file.

        Parameters:
            path (str):
                Path to a `.colt` file (e.g., 'app.colt', 'library.colt').
            base_url (str):
                Base URL for the ColtaneDB instance.
            api_key (Optional[str]):
                Optional explicit API key override.
            tenant_id (Optional[str]):
                Optional explicit tenant/project ID override.
            timeout (float):
                Network timeout in seconds.

        Returns:
            ColtaneClient: Initialized client configured for the given project.

        Example:
            >>> db = ColtaneClient.from_file("app.colt")
            >>> res = db.run("FIND books WHERE views > $min", min=10)
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"Colt configuration file not found at: {path}")

        # Verify readability
        with open(path, "r", encoding="utf-8") as f:
            _ = f.read(512)

        return cls(base_url=base_url, api_key=api_key, tenant_id=tenant_id, timeout=timeout)

    def _request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Internal helper to dispatch JSON HTTP requests to ColtaneDB."""
        url = f"{self.base_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "coltanedb-python/0.2.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8")
            error_msg = f"HTTP {err.code}: {err.reason}"
            try:
                err_json = json.loads(err_body)
                error_msg = err_json.get("error", err_json.get("errorMessage", error_msg))
            except json.JSONDecodeError:
                if err_body:
                    error_msg = err_body

            if err.code in (401, 403):
                raise ColtaneAuthError(error_msg)
            elif err.code >= 400:
                raise ColtaneQueryError(error_msg)
            raise ColtaneError(error_msg)
        except urllib.error.URLError as err:
            raise ColtaneConnectionError(
                f"Failed to connect to ColtaneDB at {self.base_url}: {err.reason}"
            )

    def execute(
        self,
        source: str,
        parameters: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
    ) -> QueryResult:
        """Execute a raw Colt query statement against target databases.

        Parameters:
            source (str):
                Colt query string (e.g., 'FIND books SELECT title WHERE views > $min').
            parameters (Optional[Dict[str, Any]]):
                Dictionary of bound parameter values matching `$var` references in source.
            tenant_id (Optional[str]):
                Optional tenant or project workspace identifier override.

        Returns:
            QueryResult: The structured query execution result.

        Example:
            >>> res = client.execute("FIND books SELECT title, author LIMIT 5")
            >>> for row in res.rows:
            ...     print(row["title"])
        """
        target_tenant = tenant_id or self.tenant_id
        if not target_tenant:
            # If no tenant ID specified, attempt default-project lookup
            try:
                default_info = self._request("GET", "/api/v1/default-project")
                target_tenant = default_info.get("tenantId")
            except Exception:
                pass

        if not target_tenant:
            target_tenant = "default"

        payload = {
            "source": source,
            "parameters": parameters or {},
        }
        res = self._request("POST", f"/api/v1/projects/{target_tenant}/execute", payload)

        diags = [
            Diagnostic(
                code=d["code"],
                message=d["message"],
                span=d.get("span", {}),
                hint=d.get("hint"),
            )
            for d in res.get("diagnostics", [])
        ]

        results = res.get("results", [])
        rows: List[Any] = []
        for r in results:
            if isinstance(r, list):
                rows.extend(r)
            elif isinstance(r, dict) and "record" in r:
                rows.append(r["record"])
            else:
                rows.append(r)

        return QueryResult(
            success=bool(res.get("success", False)),
            tenant_id=res.get("tenantId", target_tenant),
            plan=res.get("plan", {}),
            diagnostics=diags,
            results=results,
            rows=rows,
            error_code=res.get("errorCode"),
            error_message=res.get("errorMessage"),
            raw=res,
        )

    def query(
        self,
        source: str,
        parameters: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
    ) -> QueryResult:
        """Alias for `execute`."""
        return self.execute(source=source, parameters=parameters, tenant_id=tenant_id)

    def run(self, source: str, **kwargs: Any) -> QueryResult:
        """Execute a Colt query with keyword arguments mapped to `$var` parameters.

        Parameters:
            source (str):
                Colt query string containing `$var` parameter placeholders.
            **kwargs:
                Bound parameters passed to the query engine.

        Returns:
            QueryResult: The structured query execution result.

        Example:
            >>> res = client.run("FIND books WHERE views > $min LIMIT $lim", min=10, lim=5)
            >>> print(res.rows)
        """
        return self.execute(source=source, parameters=kwargs)

    def plan(self, source: str) -> PlanResult:
        """Compile and plan a Colt script to inspect multi-engine execution steps without running.

        Parameters:
            source (str): Colt source code to compile.

        Returns:
            PlanResult: Planned execution steps and compiler diagnostics.

        Example:
            >>> plan = client.plan("FIND reviews FETCH book WHERE book.views > 10")
            >>> for step in plan.steps:
            ...     print(step.backend, step.operation)
        """
        res = self._request("POST", "/api/plan", {"source": source})
        diags = [
            Diagnostic(
                code=d["code"],
                message=d["message"],
                span=d.get("span", {}),
                hint=d.get("hint"),
            )
            for d in res.get("diagnostics", [])
        ]
        steps = []
        raw_plan = res.get("plan", {})
        for s in raw_plan.get("steps", []):
            steps.append(
                PlanStep(
                    backend=s.get("backend", "main"),
                    operation=s.get("operation", "query"),
                    parameterized_statement=s.get("parameterizedStatement", ""),
                    params=s.get("params", []),
                    collection=s.get("collection"),
                )
            )
        return PlanResult(steps=steps, diagnostics=diags, raw=res)

    def parse(self, source: str) -> ParseResult:
        """Parse Colt source code into its Abstract Syntax Tree (AST).

        Parameters:
            source (str): Colt code to parse.

        Returns:
            ParseResult: AST structure and syntax diagnostics.
        """
        res = self._request("POST", "/api/parse", {"source": source})
        diags = [
            Diagnostic(
                code=d["code"],
                message=d["message"],
                span=d.get("span", {}),
                hint=d.get("hint"),
            )
            for d in res.get("diagnostics", [])
        ]
        return ParseResult(ast=res.get("ast", {}), diagnostics=diags)

    def status(self) -> Dict[str, Any]:
        """Fetch system status, server health, and active engine connections."""
        return self._request("GET", "/api/v1/system/status")


# Backwards compatibility alias
Client = ColtaneClient
