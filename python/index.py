from http.server import BaseHTTPRequestHandler
import json
from coltane import collection, query


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        payload = {
            "service": "coltane-python-worker",
            "status": "healthy",
            "version": "0.1.0",
        }
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""

        try:
            data = json.loads(raw_body) if raw_body else {}
            action = data.get("action", "ping")
            result = {"action": action, "status": "ok"}

            if action == "build_schema":
                col_name = data.get("collection", "items")
                backend = data.get("backend", "neon")
                strict = data.get("strict", True)
                builder = collection(col_name, backend=backend, strict=strict)
                for f in data.get("fields", []):
                    builder.field(f["name"], f["type"], *f.get("annotations", []))
                result["colt"] = builder.to_colt()

            elif action == "build_query":
                col_name = data.get("collection", "items")
                qb = query(col_name)
                if "select" in data:
                    qb.select(*data["select"])
                if "where" in data:
                    qb.where(data["where"])
                if "order_by" in data:
                    qb.order_by(data["order_by"], desc=data.get("desc", False))
                if "limit" in data:
                    qb.limit(data["limit"])
                if "offset" in data:
                    qb.offset(data["offset"])
                result["colt"] = qb.to_colt()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
        except Exception as exc:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}).encode('utf-8'))
