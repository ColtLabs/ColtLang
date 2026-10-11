use colt_ast::{Annotation, CollectionMode, FieldDefinition};
use colt_diagnostics::ColtDiagnostic;
use colt_span::SourceSpan;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineType {
    Postgres,
    Redis,
    Mongodb,
    Sqlite,
    Libsql,
    Firestore,
    D1,
}

impl EngineType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Postgres => "postgres",
            Self::Redis => "redis",
            Self::Mongodb => "mongodb",
            Self::Sqlite => "sqlite",
            Self::Libsql => "libsql",
            Self::Firestore => "firestore",
            Self::D1 => "d1",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "postgres" => Some(Self::Postgres),
            "redis" => Some(Self::Redis),
            "mongodb" => Some(Self::Mongodb),
            "sqlite" => Some(Self::Sqlite),
            "libsql" => Some(Self::Libsql),
            "firestore" => Some(Self::Firestore),
            "d1" => Some(Self::D1),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionModel {
    pub alias: String,
    pub engine: EngineType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_var: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_env: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub span: Option<SourceSpan>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BindingKind {
    Constant,
    Parameter,
    Default,
    Path,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterBinding {
    pub kind: BindingKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expression: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transform: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub backend: String,
    pub operation: String,
    pub collection: String,
    #[serde(rename = "parameterizedStatement", skip_serializing_if = "Option::is_none")]
    pub parameterized_statement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Vec<ParameterBinding>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub substeps: Option<Vec<PlanStep>>,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionPlan {
    pub steps: Vec<PlanStep>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub joins: bool,
    pub transactions: bool,
    pub doc_paths: bool,
    pub vector: bool,
    pub graph: bool,
    pub time_series: bool,
    pub full_text: bool,
    pub ttl: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CollectionModel {
    pub name: String,
    pub backend: String,
    pub engine: EngineType,
    pub mode: CollectionMode,
    pub annotations: Vec<Annotation>,
    pub fields: Vec<FieldDefinition>,
    pub span: SourceSpan,
}

pub type Catalog = HashMap<String, CollectionModel>;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOptions {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub connections: Vec<ConnectionModel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toml_config: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_connection: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan: Option<ExecutionPlan>,
    pub diagnostics: Vec<ColtDiagnostic>,
}
