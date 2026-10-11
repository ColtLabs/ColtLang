import unittest
from unittest.mock import patch

from coltane import Client, collection, query


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
            collection("users")
            .field("id", "uuid", "@key")
            .field("email", "text", "@unique")
            .to_colt()
        )

        self.assertIn("DEFINE COLLECTION users STRICT @backend(neon)", source)
        self.assertIn("id: uuid @key", source)
        self.assertIn("email: text @unique", source)


class ClientTests(unittest.TestCase):
    def test_execute_is_a_plan_only_alias(self):
        response = {
            "plan": {
                "steps": [
                    {
                        "backend": "neon",
                        "operation": "query",
                        "collection": "users",
                        "parameterizedStatement": 'SELECT "id" FROM "users"',
                        "params": [],
                    }
                ]
            },
            "diagnostics": [],
        }
        client = Client("http://localhost:3000")
        with patch.object(client, "_post", return_value=response) as post:
            result = client.execute("FIND users SELECT id")

        self.assertTrue(result.is_valid)
        self.assertEqual(result.steps[0].backend, "neon")
        post.assert_called_once_with("/api/plan", {"source": "FIND users SELECT id"})

    def test_diagnostics_make_plan_invalid(self):
        client = Client("http://localhost:3000")
        with patch.object(
            client,
            "_post",
            return_value={"diagnostics": [{"code": "COLT2002", "message": "Unknown collection"}]},
        ):
            result = client.plan("FIND missing SELECT id")

        self.assertFalse(result.is_valid)
        self.assertEqual(result.diagnostics[0].code, "COLT2002")


if __name__ == "__main__":
    unittest.main()
