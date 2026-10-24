pub mod http;
pub mod render;
pub mod types;

use colt_compiler::types::{ExecutionPlan, PlanStep};
use std::env;
use std::time::Instant;
use types::{DryRunPreview, DryRunStep, Paradigm, RunExecutionReport, StepExecutionResult, UsageReport};

/// Maps a plan step's operation, collection, and backend to its underlying paradigm.
pub fn classify_paradigm(step: &PlanStep) -> Paradigm {
    let op = step.operation.to_uppercase();
    let backend = step.backend.to_lowercase();
    let col = step.collection.to_lowercase();

    if backend == "redis" || backend == "cache" || col.contains("session") || col.contains("cache") {
        return Paradigm::KeyValue;
    }

    if op == "FIND" {
        if col.contains("vector") || col.contains("embedding") {
            return Paradigm::Vector;
        }
        if backend == "firestore" || backend == "mongodb" {
            return Paradigm::Document;
        }
        return Paradigm::Relational;
    }

    if op == "PUT" || op == "CREATE" || op == "DELETE" {
        return Paradigm::Mutation;
    }

    if op.starts_with("DEFINE") || op == "CONNECT" || op == "DEFAULT CONNECTION" {
        return Paradigm::Schema;
    }

    Paradigm::Relational
}

/// Creates a deterministic offline dry-run preview of the execution plan.
pub fn execute_dry_run(source_name: &str, plan: &ExecutionPlan) -> DryRunPreview {
    let mut steps = Vec::new();

    for (i, step) in plan.steps.iter().enumerate() {
        let paradigm = classify_paradigm(step);
        let params_val = step.params.as_ref().and_then(|p| serde_json::to_value(p).ok());

        steps.push(DryRunStep {
            index: i + 1,
            operation: step.operation.clone(),
            collection: step.collection.clone(),
            backend: step.backend.clone(),
            paradigm,
            parameterized_statement: step.parameterized_statement.clone(),
            parameters: params_val,
        });
    }

    DryRunPreview {
        status: "preview".to_string(),
        source: source_name.to_string(),
        dry_run: true,
        executed_count: 0,
        planned_steps_count: plan.steps.len(),
        steps,
        summary: format!("Dry run preview: {} operations planned, 0 executed.", plan.steps.len()),
    }
}

/// Executes a Colt source program live against the ColtaneDB runtime service.
/// If the runtime is unavailable, returns a structured error explaining the issue
/// and actionable remedies (such as starting the server or using --dry-run).
pub fn execute_live(
    source_name: &str,
    source_text: &str,
    plan: &ExecutionPlan,
) -> Result<RunExecutionReport, RunExecutionReport> {
    let start_time = Instant::now();
    let api_url = env::var("COLTANE_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:3000".to_string())
        .trim_end_matches('/')
        .to_string();

    let endpoint = format!("{}/api/v1/query", api_url);
    let auth_token = env::var("COLTANE_API_KEY").or_else(|_| env::var("COLT_AUTH_TOKEN")).ok();

    let payload = serde_json::json!({
        "source": source_text,
        "parameters": {}
    });

    let payload_str = serde_json::to_string(&payload).unwrap_or_default();

    let http_res = match http::post_json(&endpoint, &payload_str, auth_token.as_deref()) {
        Ok(res) => res,
        Err(err) => {
            return Err(RunExecutionReport {
                source: source_name.to_string(),
                status: "failed".to_string(),
                dry_run: false,
                duration_ms: start_time.elapsed().as_millis() as u64,
                total_operations: plan.steps.len(),
                completed_operations: 0,
                failed_operations: plan.steps.len(),
                results: vec![],
                usage: None,
                error: Some(format!("Cannot connect to ColtaneDB execution runtime at {}: {}", endpoint, err)),
                hint: Some(
                    "Ensure ColtaneDB is running (e.g., run 'pnpm dev' in ColtaneDB) or configure COLTANE_URL. \
To preview the compiled plan offline without connecting to a database, run with '--dry-run'.".to_string(),
                ),
            });
        }
    };

    if http_res.status != 200 {
        return Err(RunExecutionReport {
            source: source_name.to_string(),
            status: "failed".to_string(),
            dry_run: false,
            duration_ms: start_time.elapsed().as_millis() as u64,
            total_operations: plan.steps.len(),
            completed_operations: 0,
            failed_operations: plan.steps.len(),
            results: vec![],
            usage: None,
            error: Some(format!("ColtaneDB query endpoint returned HTTP {}: {}", http_res.status, http_res.body)),
            hint: Some("Verify your Colt query parameters, permissions, and tenant database configurations.".to_string()),
        });
    }

    let parsed: serde_json::Value = match serde_json::from_str(&http_res.body) {
        Ok(v) => v,
        Err(e) => {
            return Err(RunExecutionReport {
                source: source_name.to_string(),
                status: "failed".to_string(),
                dry_run: false,
                duration_ms: start_time.elapsed().as_millis() as u64,
                total_operations: plan.steps.len(),
                completed_operations: 0,
                failed_operations: plan.steps.len(),
                results: vec![],
                usage: None,
                error: Some(format!("Invalid JSON response from ColtaneDB: {}", e)),
                hint: None,
            });
        }
    };

    let success = parsed.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    if !success {
        let err_msg = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("Query execution reported failure");
        return Err(RunExecutionReport {
            source: source_name.to_string(),
            status: "failed".to_string(),
            dry_run: false,
            duration_ms: start_time.elapsed().as_millis() as u64,
            total_operations: plan.steps.len(),
            completed_operations: 0,
            failed_operations: plan.steps.len(),
            results: vec![],
            usage: None,
            error: Some(err_msg.to_string()),
            hint: None,
        });
    }

    // Process step results
    let mut step_results = Vec::new();
    let data_val = parsed.get("data").cloned().unwrap_or(serde_json::Value::Null);

    for (i, step) in plan.steps.iter().enumerate() {
        let paradigm = classify_paradigm(step);
        let step_payload = if data_val.is_array() && data_val.as_array().map(|a| a.len() == plan.steps.len()).unwrap_or(false) {
            data_val.as_array().and_then(|a| a.get(i)).cloned()
        } else if i == 0 {
            Some(data_val.clone())
        } else {
            None
        };

        let affected = if paradigm == Paradigm::Mutation {
            Some(1)
        } else {
            None
        };

        step_results.push(StepExecutionResult {
            step_index: i + 1,
            operation: step.operation.clone(),
            collection: step.collection.clone(),
            backend: step.backend.clone(),
            paradigm,
            status: "completed".to_string(),
            duration_ms: (start_time.elapsed().as_millis() / (plan.steps.len().max(1) as u128)) as u64,
            affected_rows: affected,
            sql_statement: step.parameterized_statement.clone(),
            payload: step_payload,
            error: None,
        });
    }

    let usage = parsed.get("usage").and_then(|u| {
        let rows = u.get("rows").and_then(|r| r.as_u64()).unwrap_or(0) as usize;
        let bytes = u.get("bytes").and_then(|b| b.as_u64()).unwrap_or(0) as usize;
        Some(UsageReport { rows, bytes })
    });

    Ok(RunExecutionReport {
        source: source_name.to_string(),
        status: "success".to_string(),
        dry_run: false,
        duration_ms: start_time.elapsed().as_millis() as u64,
        total_operations: plan.steps.len(),
        completed_operations: plan.steps.len(),
        failed_operations: 0,
        results: step_results,
        usage,
        error: None,
        hint: None,
    })
}
