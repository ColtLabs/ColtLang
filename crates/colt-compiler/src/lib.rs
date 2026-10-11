pub mod capabilities;
pub mod config;
pub mod postgres;
pub mod semantic;
pub mod types;

pub use capabilities::*;
pub use config::parse_colt_toml;
pub use semantic::compile;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;

    const USERS: &str = r#"DEFINE COLLECTION users STRICT @backend(neon) {
  id: uuid @key,
  email: text,
  nickname: text?,
  created: time @default(now)
}"#;

    #[test]
    fn test_compiler_keeps_query_values_out_of_sql() {
        let src = format!("{}\nFIND users SELECT email WHERE email == $email", USERS);
        let res = compile(&src, None, None);
        assert_eq!(res.diagnostics, vec![]);
        let query = &res.plan.as_ref().unwrap().steps[1];
        let stmt = query.parameterized_statement.as_ref().unwrap();
        assert!(!stmt.contains("secret@example.com"));
        assert!(stmt.contains("IS NOT DISTINCT FROM $1"));
        assert_eq!(
            query.params.as_ref().unwrap(),
            &[ParameterBinding {
                kind: BindingKind::Parameter,
                value: None,
                name: Some("email".to_string()),
                expression: None,
                transform: None,
            }]
        );
    }

    #[test]
    fn test_compiler_binds_numeric_literals() {
        let res = compile(
            "DEFINE COLLECTION scores { id: uuid @key, score: int } FIND scores SELECT score WHERE score > 10",
            None,
            None,
        );
        assert_eq!(res.diagnostics, vec![]);
        let params = res.plan.as_ref().unwrap().steps[1].params.as_ref().unwrap();
        assert_eq!(
            params,
            &[ParameterBinding {
                kind: BindingKind::Constant,
                value: Some(serde_json::json!(10)),
                name: None,
                expression: None,
                transform: None,
            }]
        );
    }

    #[test]
    fn test_compiler_put_and_readonly() {
        let src = format!(
            "{}\nPUT users:00000000-0000-4000-8000-000000000001 {{ email: \"a@example.com\" }}",
            USERS
        );
        let res = compile(&src, None, None);
        assert_eq!(res.diagnostics, vec![]);
        let step = &res.plan.as_ref().unwrap().steps[1];
        let stmt = step.parameterized_statement.as_ref().unwrap();
        assert!(stmt.contains("\"nickname\""));
        assert!(stmt.contains("ON CONFLICT"));
    }

    #[test]
    fn test_compiler_constant_true_delete_rejected() {
        let src = format!("{} DELETE users WHERE true", USERS);
        let res = compile(&src, None, None);
        assert!(res.plan.is_none());
        assert!(res.diagnostics.iter().any(|d| d.code == "COLT2005"));
    }

    #[test]
    fn test_compiler_atomic_spanning_backends_rejected() {
        let src = format!(
            r#"{}
DEFINE COLLECTION events STRICT @backend(supabase) {{ id: uuid @key }}
ATOMIC {{
  PUT users:00000000-0000-4000-8000-000000000001 {{ email: "a@example.com" }}
  PUT events:00000000-0000-4000-8000-000000000002 {{}}
}}"#,
            USERS
        );
        let res = compile(&src, None, None);
        assert!(res.plan.is_none());
        assert!(res.diagnostics.iter().any(|d| d.code == "COLT2016"));
    }

    #[test]
    fn test_compiler_empty_atomic_rejected() {
        let res = compile("ATOMIC {}", None, None);
        assert!(res.plan.is_none());
        assert!(res.diagnostics.iter().any(|d| d.code == "COLT2020"));
    }

    #[test]
    fn test_compiler_library_example() {
        let source = r#"#colt 0.2
CONNECT main AS postgres(env("DATABASE_URL"))
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
  embedding: vector(3) @index(hnsw),
  views: int @default(0)
}

FIND books SELECT title, author, metadata.edition
WHERE views > 10 AND published != null
ORDER BY views DESC
LIMIT 20 OFFSET 0

PUT books:11111111-1111-4111-8111-111111111111 {
  title: "The Left Hand of Darkness",
  author: authors:22222222-2222-4222-8222-222222222222,
  tags: ["science-fiction", "classic"],
  metadata: { edition: 3, language: "en" },
  embedding: [0.12, -0.4, 0.88]
}

CREATE books {
  title: "Untitled Draft",
  author: authors:22222222-2222-4222-8222-222222222222,
  tags: [],
  metadata: {},
  embedding: [0.0, 0.0, 0.0]
}

ATOMIC {
  DELETE books:33333333-3333-4333-8333-333333333333;
  PUT authors:22222222-2222-4222-8222-222222222222 { name: "Ursula K. Le Guin" }
}
"#;
        let res = compile(source, None, None);
        assert_eq!(res.diagnostics, vec![]);
        assert!(res.plan.is_some());
        let plan = res.plan.unwrap();
        assert_eq!(plan.steps.len(), 6); // 2 schema + 1 find + 1 put + 1 create + 1 atomic
    }
}
