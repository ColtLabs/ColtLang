use serde::{Deserialize, Serialize};

/// High-level database paradigms supported across the Colt ecosystem.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Paradigm {
    Relational,
    Document,
    KeyValue,
    Vector,
    Graph,
    TimeSeries,
    Mutation,
    Schema,
}

impl Paradigm {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Relational => "relational",
            Self::Document => "document",
            Self::KeyValue => "key-value",
            Self::Vector => "vector",
            Self::Graph => "graph",
            Self::TimeSeries => "time-series",
            Self::Mutation => "mutation",
            Self::Schema => "schema",
        }
    }
}

/// A structured, typed execution step outcome.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepExecutionResult {
    pub step_index: usize,
    pub operation: String,
    pub collection: String,
    pub backend: String,
    pub paradigm: Paradigm,
    pub status: String,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_rows: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sql_statement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Overall execution result model for Colt operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunExecutionReport {
    pub source: String,
    pub status: String,
    pub dry_run: bool,
    pub duration_ms: u64,
    pub total_operations: usize,
    pub completed_operations: usize,
    pub failed_operations: usize,
    pub results: Vec<StepExecutionResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub rows: usize,
    pub bytes: usize,
}

/// Offline dry-run execution preview model.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunPreview {
    pub status: String,
    pub source: String,
    pub dry_run: bool,
    pub executed_count: usize,
    pub planned_steps_count: usize,
    pub steps: Vec<DryRunStep>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunStep {
    pub index: usize,
    pub operation: String,
    pub collection: String,
    pub backend: String,
    pub paradigm: Paradigm,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameterized_statement: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}
