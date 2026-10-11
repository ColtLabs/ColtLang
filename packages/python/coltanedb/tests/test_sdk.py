import os
import sys
import unittest
from unittest.mock import patch, MagicMock

# Ensure local source tree is imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

import coltanedb
from coltanedb import (
    ColtaneClient,
    Client,
    query,
    collection,
    guide,
    author,
    ColtaneAuthError,
    ColtaneQueryError,
)


class QueryBuilderTests(unittest.TestCase):
    def test_query_builder_serializes_order_and_pagination(self):
        source = (
            query("users")
            .select("id", "email")
            .where("active == true")
            .order_by("created", desc=True)
            .limit(20)
            .offset(5)
            .to_colt()
        )

        self.assertEqual(
            source,
            "FIND users SELECT id, email\n"
            "WHERE active == true\n"
            "ORDER BY created DESC\n"
            "LIMIT 20\n"
            "OFFSET 5",
        )

    def test_collection_builder_emits_schema(self):
        source = (
            collection("users", backend="main")
            .field("id", "uuid", "@key")
            .field("email", "text", "@unique")
            .to_colt()
        )

        self.assertIn("DEFINE COLLECTION users STRICT @backend(main)", source)
        self.assertIn("id: uuid @key", source)
        self.assertIn("email: text @unique", source)


class ColtaneClientTests(unittest.TestCase):
    def test_client_alias_matches_coltane_client(self):
        self.assertIs(Client, ColtaneClient)

    def test_plan_sends_post_request(self):
        response = {
            "plan": {
                "steps": [
                    {
                        "backend": "main",
                        "operation": "query",
                        "collection": "users",
                        "parameterizedStatement": 'SELECT "id" FROM "users"',
                        "params": [],
                    }
                ]
            },
            "diagnostics": [],
        }
        client = ColtaneClient("http://localhost:3000")
        with patch.object(client, "_request", return_value=response) as req:
            result = client.plan("FIND users SELECT id")

        self.assertTrue(result.is_valid)
        self.assertEqual(result.steps[0].backend, "main")
        req.assert_called_once_with("POST", "/api/plan", {"source": "FIND users SELECT id"})

    def test_execute_sends_to_project_endpoint(self):
        client = ColtaneClient(
            base_url="http://localhost:3000",
            api_key="clt_live_test_secret",
            tenant_id="tnt_mytesttenant",
        )
        fake_response = {
            "success": True,
            "tenantId": "tnt_mytesttenant",
            "results": [[{"id": "u1", "title": "Test Book"}]],
            "diagnostics": [],
            "meta": {"connections": [{"alias": "main", "status": "ok"}], "partial": False},
        }

        with patch.object(client, "_request", return_value=fake_response) as req:
            result = client.execute("FIND books SELECT title")

        self.assertTrue(result.success)
        self.assertEqual(len(result.rows), 1)
        self.assertEqual(result.rows[0]["title"], "Test Book")
        self.assertEqual(result.meta["connections"][0]["alias"], "main")
        req.assert_called_once_with(
            "POST",
            "/api/v1/projects/tnt_mytesttenant/execute",
            {"source": "FIND books SELECT title", "parameters": {}},
        )

    def test_run_helper_maps_kwargs_to_parameters(self):
        client = ColtaneClient("http://localhost:3000", tenant_id="tnt_default")
        fake_response = {"success": True, "results": [], "diagnostics": []}

        with patch.object(client, "_request", return_value=fake_response) as req:
            result = client.run("FIND books WHERE views > $min", min=10)

        self.assertTrue(result.success)
        req.assert_called_once_with(
            "POST",
            "/api/v1/projects/tnt_default/execute",
            {"source": "FIND books WHERE views > $min", "parameters": {"min": 10}},
        )

    def test_from_file_initializes_client(self):
        test_file = "test_temp_config.colt"
        with open(test_file, "w", encoding="utf-8") as f:
            f.write("#colt 0.2\nCONNECT main AS postgres(env(\"DATABASE_URL\"))\n")
        try:
            client = ColtaneClient.from_file(test_file, api_key="clt_test")
            self.assertEqual(client.api_key, "clt_test")
            self.assertEqual(client.base_url, "http://localhost:3000")
        finally:
            if os.path.exists(test_file):
                os.remove(test_file)

    def test_from_file_raises_if_missing(self):
        with self.assertRaises(FileNotFoundError):
            ColtaneClient.from_file("non_existent_file_xyz.colt")

    def test_status_calls_system_endpoint(self):
        client = ColtaneClient("http://localhost:3000")
        with patch.object(client, "_request", return_value={"healthy": True}) as req:
            status = client.status()

        self.assertTrue(status.get("healthy"))
        req.assert_called_once_with("GET", "/api/v1/system/status")


class GuideAndAuthorTests(unittest.TestCase):
    def test_author_function_returns_and_prints_metadata(self):
        info = author()
        self.assertIn("Ayush Bhattacharya", info)
        self.assertIn("https://github.com/itsjustayush", info)
        self.assertIn("info.cometlabs@gmail.com", info)
        self.assertIn("ColtaneDB", info)
        self.assertIn("https://github.com/itsjustayush/ColtaneDB", info)
        self.assertIn("Version: 0.2.0", info)

    def test_guide_function_file_true_creates_file(self):
        target = os.path.abspath("COLT_GUIDE.md")
        if os.path.exists(target):
            os.remove(target)

        path = guide(file=True)
        self.assertTrue(os.path.exists(target))
        self.assertEqual(path, target)

        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("# The Colt Language Reference", content)
        self.assertIn("The Meld Model", content)
        self.assertIn("Ayush Bhattacharya", content)
        self.assertIn("Multi-Engine Link Declaration", content)

        # Cleanup
        if os.path.exists(target):
            os.remove(target)

    def test_guide_function_file_false_prints_plain_text(self):
        text = guide(file=False)
        self.assertIsInstance(text, str)
        self.assertIn("The Colt Language Reference", text)
        self.assertIn("The Meld Model", text)
        self.assertIn("Ayush Bhattacharya", text)


if __name__ == "__main__":
    unittest.main()
