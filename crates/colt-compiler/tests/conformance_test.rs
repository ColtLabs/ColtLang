use colt_compiler::compile;
use colt_compiler::types::BindingKind;

const METRICS: &str = r#"DEFINE COLLECTION metrics STRICT @backend(neon) {
  id: uuid @key,
  name: text @unique,
  count: int @default(0),
  payload: doc
}"#;

const ACCOUNTS: &str = r#"DEFINE COLLECTION accounts STRICT @backend(neon) {
  id: uuid @key,
  owner: text @readonly,
  balance: int
}"#;

const USERS: &str = r#"DEFINE COLLECTION users STRICT @backend(neon) {
  id: uuid @key,
  email: text @unique,
  nickname: text?,
  created: time @default(now),
  profile: doc,
  score: int
}"#;

const ACCOUNT_KEY: &str = "00000000-0000-4000-8000-000000000009";

#[test]
fn test_unknown_projection_field() {
    let src = format!("{} FIND metrics SELECT nam", METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2004"));
}

#[test]
fn test_document_path_on_doc_field() {
    let src = format!("{} FIND metrics SELECT payload.deep.value", METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_document_path_on_scalar_field() {
    let src = format!("{} FIND metrics SELECT name.deep", METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2012"));
}

#[test]
fn test_duplicate_field_name() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key, id: text }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2007"));
}

#[test]
fn test_duplicate_annotation() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key @key }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2009"));
}

#[test]
fn test_unknown_field_annotation() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key @nope }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2008"));
}

#[test]
fn test_collection_without_key_field() {
    let res = compile("DEFINE COLLECTION a { id: uuid }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2011"));
}

#[test]
fn test_collection_with_two_key_fields() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key, other: uuid @key }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2011"));
}

#[test]
fn test_redefining_collection() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key }\nDEFINE COLLECTION a { id: uuid @key }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2006"));
}

#[test]
fn test_querying_unknown_collection() {
    let res = compile("FIND nope SELECT id", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2002"));
}

#[test]
fn test_missing_required_field() {
    let src = format!(r#"{} CREATE metrics {{ name: "a" }}"#, METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2014"));
}

#[test]
fn test_null_in_required_field() {
    let src = format!(r#"{} CREATE metrics {{ name: null, payload: {{}} }}"#, METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2018"));
}

#[test]
fn test_mismatched_literal_type() {
    let src = format!(r#"{} CREATE metrics {{ name: 7, payload: {{}} }}"#, METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2018"));
}

#[test]
fn test_vector_wrong_length() {
    let res = compile("DEFINE COLLECTION v { id: uuid @key, embedding: vector(3) }\nCREATE v { embedding: [1.0, 2.0] }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2019"));
}

#[test]
fn test_create_without_id_needs_uuid_key() {
    let res = compile(r#"DEFINE COLLECTION k { name: text @key }
CREATE k { name: "a" }"#, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2017"));
}

#[test]
fn test_non_uuid_record_key() {
    let src = format!(r#"{} PUT metrics:abc {{ name: "a", payload: {{}} }}"#, METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2015"));
}

#[test]
fn test_constant_true_delete_where() {
    let src = format!("{} DELETE metrics WHERE true", METRICS);
    let res = compile(&src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2005"));
}

#[test]
fn test_atomic_spanning_primary_backends() {
    let res = compile("DEFINE COLLECTION a { id: uuid @key }\nDEFINE COLLECTION b @backend(supabase) { id: uuid @key }\nATOMIC { PUT a:1 { }; PUT b:2 { } }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2016"));
}

#[test]
fn test_unsupported_backend_annotation() {
    let res = compile("DEFINE COLLECTION a @backend(turso) { id: uuid @key }", None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2001"));
}

#[test]
fn test_query_params_separate_from_sql() {
    let src = format!("{} FIND metrics SELECT name WHERE name == $name", METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_literals_bound_never_embedded() {
    let src = format!(r#"{} FIND metrics SELECT name WHERE name == "secret@example.com""#, METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_ordered_comparisons_emulate_two_valued_logic() {
    let src = format!("{} FIND metrics SELECT count WHERE count > null", METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_heterogeneous_comparisons_fold_to_false() {
    let src = format!(r#"{} FIND metrics SELECT count WHERE count == "two""#, METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_order_by_emits_nulls_last() {
    let src = format!("{} FIND metrics SELECT name ORDER BY count DESC", METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    let plan = res.plan.unwrap();
    assert_eq!(plan.steps.len(), 2);
    let stmt = plan.steps[1].parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("NULLS LAST"));
}

#[test]
fn test_limit_and_offset_bound_parameters() {
    let src = format!("{} FIND metrics SELECT name LIMIT 5 OFFSET 2", METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_put_plans_upsert() {
    let src = format!(r#"{} PUT metrics:{} {{ name: "a", payload: {{}} }}"#, METRICS, ACCOUNT_KEY);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_put_preserves_readonly_fields() {
    let src = format!(r#"{} PUT accounts:{} {{ owner: "root", balance: 10 }}"#, ACCOUNTS, ACCOUNT_KEY);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_create_plans_insert_only_guard() {
    let src = format!(r#"{} CREATE metrics {{ name: "a", payload: {{}} }}"#, METRICS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 2);
}

#[test]
fn test_multi_store_meld_schema() {
    let src = r#"#colt 0.2
CONNECT main AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))
DEFAULT CONNECTION main

DEFINE COLLECTION authors STRICT { id: uuid @key, name: text @unique }
DEFINE COLLECTION books STRICT { id: uuid @key, title: text, author: link<authors>, views: int @default(0) }
DEFINE COLLECTION reviews FLEXIBLE @backend(notes) { id: uuid @key, book: link<books>, body: text, meta: doc }
DEFINE COLLECTION sessions @backend(cache) @ttl(30m) { value: text, id: uuid @key }
"#;
    let res = compile(src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    assert_eq!(res.plan.unwrap().steps.len(), 4);
}

#[test]
fn test_unknown_connection_alias() {
    let src = "#colt 0.2\nDEFINE COLLECTION books @backend(neon) { id: uuid @key }";
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2021"));
}

#[test]
fn test_duplicate_connection_alias() {
    let src = r#"CONNECT main AS postgres(env("DB1"))
CONNECT main AS redis(env("DB2"))
DEFINE COLLECTION books { id: uuid @key }"#;
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2022"));
}

#[test]
fn test_literal_credentials_rejected() {
    let src = r#"CONNECT main AS postgres("postgresql://user:pass@localhost:5432/db")"#;
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2023"));
}

#[test]
fn test_ambiguous_default_connection() {
    let src = r#"CONNECT a AS postgres(env("DB1"))
CONNECT b AS redis(env("DB2"))
DEFINE COLLECTION books { id: uuid @key }"#;
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2024"));
}

#[test]
fn test_mixed_atomic_block_across_connections() {
    let src = r#"CONNECT a AS postgres(env("DB1"))
CONNECT b AS postgres(env("DB2"))
DEFINE COLLECTION x @backend(a) { id: uuid @key }
DEFINE COLLECTION y @backend(b) { id: uuid @key }
ATOMIC { PUT x:11111111-1111-4111-8111-111111111111 {}; PUT y:22222222-2222-4222-8222-222222222222 {} }"#;
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2025"));
}

#[test]
fn test_unsupported_capability_on_engine() {
    let src = r#"CONNECT cache AS redis(env("REDIS_URL"))
DEFINE COLLECTION v @backend(cache) { id: uuid @key, emb: vector(3) @index(hnsw) }"#;
    let res = compile(src, None, None);
    assert!(res.diagnostics.iter().any(|d| d.code == "COLT2026"));
}

#[test]
fn test_substitutes_placeholders_and_bindings() {
    let src = format!("{} FIND metrics SELECT name WHERE name == $name", METRICS);
    let res = compile(&src, None, None);
    let query = &res.plan.unwrap().steps[1];
    let stmt = query.parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("IS NOT DISTINCT FROM $1"));
    assert!(stmt.contains("\"name\""));
    assert_eq!(query.params.as_ref().unwrap().len(), 1);
    let p = &query.params.as_ref().unwrap()[0];
    assert_eq!(p.kind, BindingKind::Parameter);
    assert_eq!(p.name.as_deref(), Some("name"));
}

#[test]
fn test_never_embeds_literal_value() {
    let src = format!(r#"{} FIND metrics SELECT name WHERE name == "secret@example.com""#, METRICS);
    let res = compile(&src, None, None);
    let query = &res.plan.unwrap().steps[1];
    let stmt = query.parameterized_statement.as_deref().unwrap();
    assert!(!stmt.contains("secret@example.com"));
    let params = query.params.as_ref().unwrap();
    assert!(params.iter().any(|p| p.kind == BindingKind::Constant && p.value.as_ref().unwrap().as_str() == Some("secret@example.com")));
}

#[test]
fn test_reads_document_paths_through_jsonb_extract_path() {
    let src = format!("{} FIND metrics SELECT payload.deep.value", METRICS);
    let res = compile(&src, None, None);
    let query = &res.plan.unwrap().steps[1];
    let stmt = query.parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("jsonb_extract_path("));
    let params = query.params.as_ref().unwrap();
    assert!(params.iter().any(|p| p.kind == BindingKind::Path));
}

#[test]
fn test_binds_default_now_as_statement_time_param() {
    let src = format!(r#"{} CREATE users {{ email: "a@x.com", profile: {{}}, score: 1 }}"#, USERS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    let create = &res.plan.unwrap().steps[1];
    let stmt = create.parameterized_statement.as_deref().unwrap();
    assert!(!stmt.contains("now()"));
    let params = create.params.as_ref().unwrap();
    assert!(params.iter().any(|p| p.kind == BindingKind::Default && p.expression.as_deref() == Some("now")));
}

#[test]
fn test_excludes_readonly_fields_from_put_update() {
    let src = format!(r#"{} PUT accounts:{} {{ owner: "root", balance: 10 }}"#, ACCOUNTS, ACCOUNT_KEY);
    let res = compile(&src, None, None);
    let plan = res.plan.unwrap();
    let stmt = plan.steps[1].parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("ON CONFLICT"));
    assert!(stmt.contains(r#""balance" = EXCLUDED."balance""#));
    assert!(!stmt.contains(r#""owner" = EXCLUDED."owner""#));
}

#[test]
fn test_generates_uuid_key_for_create() {
    let src = format!(r#"{} CREATE metrics {{ name: "a", payload: {{}} }}"#, METRICS);
    let res = compile(&src, None, None);
    let plan = res.plan.unwrap();
    let stmt = plan.steps[1].parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("gen_random_uuid()"));
    assert!(stmt.contains(r#"ON CONFLICT ("id") DO NOTHING"#));
    assert!(stmt.contains("RETURNING *"));
}

#[test]
fn test_declares_every_collection_field_with_postgres_type() {
    let res = compile(METRICS, None, None);
    let plan = res.plan.unwrap();
    let stmt = plan.steps[0].parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains(r#""id" uuid NOT NULL"#));
    assert!(stmt.contains(r#""name" text NOT NULL UNIQUE"#));
    assert!(stmt.contains(r#""count" integer NOT NULL"#));
    assert!(stmt.contains(r#""payload" jsonb NOT NULL"#));
    assert!(stmt.contains(r#"PRIMARY KEY ("id")"#));
}

#[test]
fn test_rejects_changed_readonly_value_through_conflict_predicate() {
    let src = format!(r#"DEFINE COLLECTION users STRICT @backend(neon) {{
  id: uuid @key,
  email: text,
  owner: text @readonly,
  nickname: text?,
  created: time @default(now)
}}
PUT users:00000000-0000-4000-8000-000000000001 {{ email: "a@example.com", owner: "alice" }}"#);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    let plan = res.plan.unwrap();
    let stmt = plan.steps[1].parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains(r#""users"."owner" IS NOT DISTINCT FROM EXCLUDED."owner""#));
    assert!(!stmt.contains(r#""owner" = EXCLUDED."owner""#));
}

#[test]
fn test_uses_explicit_uuid_key_for_create() {
    let src = format!(r#"{} CREATE users {{
      id: 11111111-1111-4111-8111-111111111111,
      email: "a@example.com",
      profile: {{}},
      score: 1
    }}"#, USERS);
    let res = compile(&src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    let plan = res.plan.unwrap();
    let stmt = plan.steps[1].parameterized_statement.as_deref().unwrap();
    assert!(!stmt.contains("gen_random_uuid()"));
    assert!(!stmt.contains(r#"("id", "id""#));
}

#[test]
fn test_encodes_transforms_for_list_vector_doc() {
    let src = r#"DEFINE COLLECTION samples {
      id: uuid @key,
      tags: list<text>,
      embedding: vector(3),
      metadata: doc
    }
    PUT samples:11111111-1111-4111-8111-111111111111 {
      tags: ["one", "two"],
      embedding: [0.12, -0.4, 0.88],
      metadata: { label: "sample" }
    }"#;
    let res = compile(src, None, None);
    assert_eq!(res.diagnostics, vec![]);
    let plan = res.plan.unwrap();
    let step = &plan.steps[1];
    let stmt = step.parameterized_statement.as_deref().unwrap();
    assert!(stmt.contains("::vector(3)"));
    assert!(!stmt.contains(r#"embedding" = $3::jsonb"#));
    let params = step.params.as_ref().unwrap();
    assert!(params.iter().any(|p| p.transform.as_deref() == Some("array")));
    assert!(params.iter().any(|p| p.transform.as_deref() == Some("vector") && p.value.as_ref().unwrap().as_str() == Some("[0.12,-0.4,0.88]")));
    assert!(params.iter().any(|p| p.transform.as_deref() == Some("json") && p.value.as_ref().unwrap().as_str() == Some(r#"{"label":"sample"}"#)));
}

