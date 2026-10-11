from __future__ import annotations

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional
from dataclasses import dataclass


@dataclass
class Diagnostic:
    code: str
    message: str
    span: Dict[str, Any]
    hint: Optional[str] = None


@dataclass
class PlanStep:
    backend: str
    operation: str
    parameterized_statement: str
    params: List[Any]
    collection: Optional[str] = None


@dataclass
class PlanResult:
    steps: List[PlanStep]
    diagnostics: List[Diagnostic]
    raw: Dict[str, Any]

    @property
    def is_valid(self) -> bool:
        return len(self.diagnostics) == 0


@dataclass
class ParseResult:
    ast: Dict[str, Any]
    diagnostics: List[Diagnostic]


class ColtError(Exception):
    """Raised when ColtaneDB returns an error or invalid query."""
    pass


class Client:
    """Client for connecting to a ColtaneDB server instance or local web IDE."""

    def __init__(self, base_url: str = "http://localhost:3000", api_key: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "coltane-python/0.1.0",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as err:
            err_body = err.read().decode("utf-8")
            try:
                err_json = json.loads(err_body)
                raise ColtError(err_json.get("error", f"HTTP {err.code}: {err.reason}"))
            except json.JSONDecodeError:
                raise ColtError(f"HTTP {err.code}: {err_body or err.reason}")
        except urllib.error.URLError as err:
            raise ColtError(f"Connection failed to {self.base_url}: {err.reason}")

    def plan(self, source: str) -> PlanResult:
        """Compile and plan a Colt script to backend target statements."""
        res = self._post("/api/plan", {"source": source})
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
                    backend=s.get("backend", "neon"),
                    operation=s.get("operation", "query"),
                    parameterized_statement=s.get("parameterizedStatement", ""),
                    params=s.get("params", []),
                    collection=s.get("collection"),
                )
            )
        return PlanResult(steps=steps, diagnostics=diags, raw=res)

    def parse(self, source: str) -> ParseResult:
        """Parse Colt source code into its Abstract Syntax Tree (AST)."""
        res = self._post("/api/parse", {"source": source})
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

    def execute(self, source: str) -> PlanResult:
        """Compile and plan a Colt script; alias for plan()."""
        return self.plan(source)

    def execute_project(
        self,
        tenant_id: str,
        source: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute a Colt query against a specific tenant project via ColtaneDB API."""
        return self._post(
            f"/api/v1/projects/{tenant_id}/execute",
            {"source": source, "parameters": parameters or {}},
        )
