use super::types::{DryRunPreview, Paradigm, RunExecutionReport, StepExecutionResult};
use serde_json::Value;

pub fn render_dry_run_preview(preview: &DryRunPreview, verbose: bool) {
    println!("\x1b[38;2;224;122;95m┌─ Dry Run Execution Preview \x1b[90m(0 operations executed)\x1b[38;2;224;122;95m ──────────────────────────┐\x1b[0m");
    println!(
        "\x1b[38;2;224;122;95m│\x1b[0m Source: \x1b[1m{}\x1b[0m",
        preview.source
    );
    println!(
        "\x1b[38;2;224;122;95m│\x1b[0m Planned Operations: \x1b[38;2;221;161;94m{}\x1b[0m | Database Mutations: \x1b[90m0 (Preview Mode)\x1b[0m",
        preview.planned_steps_count
    );
    println!("\x1b[38;2;224;122;95m├───────────────────────────────────────────────────────────────────────────────┤\x1b[0m");

    for step in &preview.steps {
        let paradigm_badge = format!("\x1b[38;2;221;161;94m[{}]\x1b[0m", step.paradigm.as_str());
        println!(
            "\x1b[38;2;224;122;95m│\x1b[0m {:2}. {:<14} \x1b[1m{:<8}\x1b[0m on collection \x1b[36m{}\x1b[0m via \x1b[90m{}\x1b[0m",
            step.index,
            paradigm_badge,
            step.operation,
            step.collection,
            step.backend
        );

        if let Some(ref stmt) = step.parameterized_statement {
            println!("     \x1b[90mStatement: {}\x1b[0m", stmt);
        }

        if verbose {
            if let Some(ref params) = step.parameters {
                if let Some(arr) = params.as_array() {
                    if !arr.is_empty() {
                        println!("     \x1b[90mBound Parameters: {}\x1b[0m", serde_json::to_string(params).unwrap_or_default());
                    }
                }
            }
        }
    }

    println!("\x1b[38;2;224;122;95m└───────────────────────────────────────────────────────────────────────────────┘\x1b[0m");
    println!(
        "\x1b[32m✔\x1b[0m Whole-file validation & planning successful. Zero mutations performed."
    );
}

pub fn render_execution_report(report: &RunExecutionReport, verbose: bool) {
    if report.status == "failed" {
        eprintln!(
            "\x1b[31m✖ Execution Failed\x1b[0m: {}",
            report.error.as_deref().unwrap_or("Unknown runtime error")
        );
        if let Some(ref hint) = report.hint {
            eprintln!("  \x1b[38;2;221;161;94mHint:\x1b[0m {}", hint);
        }
        return;
    }

    println!(
        "\x1b[32m✔\x1b[0m Executed \x1b[1m{}\x1b[0m ({} operations completed in {}ms)",
        report.source, report.completed_operations, report.duration_ms
    );

    for result in &report.results {
        render_step_result(result, verbose);
    }

    if let Some(ref usage) = report.usage {
        println!(
            "\x1b[90mTenant Resource Usage: {} rows read/written, {} bytes transferred.\x1b[0m",
            usage.rows, usage.bytes
        );
    }
}

pub fn render_step_result(step: &StepExecutionResult, verbose: bool) {
    println!();
    let badge = match step.paradigm {
        Paradigm::Relational => "\x1b[34m[RELATIONAL]\x1b[0m",
        Paradigm::Document => "\x1b[35m[DOCUMENT]\x1b[0m",
        Paradigm::KeyValue => "\x1b[33m[KEY-VALUE]\x1b[0m",
        Paradigm::Vector => "\x1b[36m[VECTOR]\x1b[0m",
        Paradigm::Graph => "\x1b[32m[GRAPH]\x1b[0m",
        Paradigm::TimeSeries => "\x1b[38;2;221;161;94m[TIME-SERIES]\x1b[0m",
        Paradigm::Mutation => "\x1b[38;2;224;122;95m[MUTATION]\x1b[0m",
        Paradigm::Schema => "\x1b[90m[SCHEMA]\x1b[0m",
    };

    println!(
        "{} \x1b[1m{} {}\x1b[0m on \x1b[36m{}\x1b[0m ({}, {}ms)",
        badge, step.operation, step.collection, step.backend, step.status, step.duration_ms
    );

    if verbose {
        if let Some(ref sql) = step.sql_statement {
            println!("  \x1b[90mSQL: {}\x1b[0m", sql);
        }
    }

    if let Some(ref payload) = step.payload {
        match step.paradigm {
            Paradigm::Relational => {
                if let Some(rows) = payload.as_array() {
                    render_table_rows(rows);
                } else {
                    println!("  {}", serde_json::to_string_pretty(payload).unwrap_or_default());
                }
            }
            Paradigm::Document => {
                println!("{}", render_json_document(payload, 2));
            }
            Paradigm::KeyValue => {
                render_kv_card(payload);
            }
            Paradigm::Vector => {
                render_vector_matches(payload);
            }
            Paradigm::Graph => {
                render_graph_traversal(payload);
            }
            Paradigm::Mutation => {
                if let Some(affected) = step.affected_rows {
                    println!("  \x1b[32m✔\x1b[0m Affected records: \x1b[1m{}\x1b[0m", affected);
                } else if !payload.is_null() {
                    println!("  {}", serde_json::to_string_pretty(payload).unwrap_or_default());
                }
            }
            Paradigm::TimeSeries | Paradigm::Schema => {
                println!("  {}", serde_json::to_string_pretty(payload).unwrap_or_default());
            }
        }
    } else if let Some(affected) = step.affected_rows {
        println!("  \x1b[32m✔\x1b[0m Affected records: \x1b[1m{}\x1b[0m", affected);
    }
}

fn render_table_rows(rows: &[Value]) {
    if rows.is_empty() {
        println!("  \x1b[90m(Empty result set: 0 records returned)\x1b[0m");
        return;
    }

    let first = &rows[0];
    let obj = match first.as_object() {
        Some(o) => o,
        None => {
            println!("  {}", serde_json::to_string_pretty(&rows).unwrap_or_default());
            return;
        }
    };

    let columns: Vec<String> = obj.keys().cloned().collect();
    if columns.is_empty() {
        println!("  \x1b[90m(0 columns in result)\x1b[0m");
        return;
    }

    let mut col_widths: Vec<usize> = columns.iter().map(|c| c.len().max(4)).collect();

    for row in rows {
        if let Some(r_obj) = row.as_object() {
            for (i, col) in columns.iter().enumerate() {
                let val_str = r_obj
                    .get(col)
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Null => "NULL".to_string(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_else(|| "NULL".to_string());
                if val_str.len() > col_widths[i] {
                    col_widths[i] = val_str.len().min(40);
                }
            }
        }
    }

    // Top border
    print!("  ┌");
    for (i, w) in col_widths.iter().enumerate() {
        print!("{}", "─".repeat(w + 2));
        if i + 1 < col_widths.len() {
            print!("┬");
        }
    }
    println!("┐");

    // Header row
    print!("  │");
    for (i, col) in columns.iter().enumerate() {
        print!(" \x1b[1m{:<width$}\x1b[0m │", col, width = col_widths[i]);
    }
    println!();

    // Separator
    print!("  ├");
    for (i, w) in col_widths.iter().enumerate() {
        print!("{}", "─".repeat(w + 2));
        if i + 1 < col_widths.len() {
            print!("┼");
        }
    }
    println!("┤");

    // Data rows
    for row in rows {
        print!("  │");
        if let Some(r_obj) = row.as_object() {
            for (i, col) in columns.iter().enumerate() {
                let val_str = r_obj
                    .get(col)
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Null => "\x1b[90mNULL\x1b[0m".to_string(),
                        _ => v.to_string(),
                    })
                    .unwrap_or_else(|| "\x1b[90mNULL\x1b[0m".to_string());

                let truncated = if val_str.len() > col_widths[i] {
                    format!("{}…", &val_str[..col_widths[i] - 1])
                } else {
                    val_str
                };

                print!(" {:<width$} │", truncated, width = col_widths[i]);
            }
        }
        println!();
    }

    // Bottom border
    print!("  └");
    for (i, w) in col_widths.iter().enumerate() {
        print!("{}", "─".repeat(w + 2));
        if i + 1 < col_widths.len() {
            print!("┴");
        }
    }
    println!("┘");
    println!("  \x1b[90m({} records)\x1b[0m", rows.len());
}

fn render_json_document(val: &Value, indent: usize) -> String {
    let spaces = " ".repeat(indent);
    match val {
        Value::Object(map) => {
            let mut out = String::from("{\n");
            let mut items: Vec<_> = map.iter().collect();
            items.sort_by_key(|(k, _)| *k);
            for (i, (k, v)) in items.iter().enumerate() {
                let comma = if i + 1 < items.len() { "," } else { "" };
                out.push_str(&format!(
                    "{}  \x1b[36m\"{}\"\x1b[0m: {}{}\n",
                    spaces,
                    k,
                    render_json_document(v, indent + 2),
                    comma
                ));
            }
            out.push_str(&format!("{}}}", spaces));
            out
        }
        Value::Array(arr) => {
            let mut out = String::from("[\n");
            for (i, item) in arr.iter().enumerate() {
                let comma = if i + 1 < arr.len() { "," } else { "" };
                out.push_str(&format!(
                    "{}  {}{}\n",
                    spaces,
                    render_json_document(item, indent + 2),
                    comma
                ));
            }
            out.push_str(&format!("{}]", spaces));
            out
        }
        Value::String(s) => format!("\x1b[38;2;221;161;94m\"{}\"\x1b[0m", s),
        Value::Number(n) => format!("\x1b[32m{}\x1b[0m", n),
        Value::Bool(b) => format!("\x1b[35m{}\x1b[0m", b),
        Value::Null => "\x1b[90mnull\x1b[0m".to_string(),
    }
}

fn render_kv_card(val: &Value) {
    if let Some(obj) = val.as_object() {
        let key = obj.get("key").and_then(|v| v.as_str()).unwrap_or("<unknown>");
        let value = obj.get("value").map(|v| v.to_string()).unwrap_or_else(|| "null".to_string());
        let ttl = obj.get("ttl").and_then(|v| v.as_str()).unwrap_or("no-expiration");

        println!("  ┌── Key-Value Entry ─────────────────────────────┐");
        println!("  │ Key:   \x1b[1m{:<40}\x1b[0m│", key);
        println!("  │ Value: {:<40}│", value);
        println!("  │ TTL:   \x1b[90m{:<40}\x1b[0m│", ttl);
        println!("  └────────────────────────────────────────────────┘");
    } else {
        println!("  {}", val);
    }
}

fn render_vector_matches(val: &Value) {
    let matches = if let Some(arr) = val.as_array() {
        arr
    } else if let Some(m) = val.get("matches").and_then(|v| v.as_array()) {
        m
    } else {
        println!("  {}", val);
        return;
    };

    println!("  ┌─ Vector Similarity Matches ──────────────────────────────────────────────┐");
    println!("  │ Rank │ ID                                   │ Similarity │ Distance Metric │");
    println!("  ├──────┼──────────────────────────────────────┼────────────┼─────────────────┤");

    for (i, m) in matches.iter().enumerate() {
        let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("<uuid>");
        let score = m
            .get("score")
            .or_else(|| m.get("similarity"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let metric = m.get("metric").and_then(|v| v.as_str()).unwrap_or("cosine");

        println!(
            "  │ {:<4} │ {:<36} │ \x1b[32m{:<10.4}\x1b[0m │ {:<15} │",
            i + 1,
            id,
            score,
            metric
        );
    }
    println!("  └──────┴──────────────────────────────────────┴────────────┴─────────────────┘");
}

fn render_graph_traversal(val: &Value) {
    if let Some(arr) = val.as_array() {
        println!("  ┌─ Graph Relationship Path ────────────────────────────────────────┐");
        for step in arr {
            let from = step.get("from").and_then(|v| v.as_str()).unwrap_or("");
            let edge = step.get("edge").and_then(|v| v.as_str()).unwrap_or("-->");
            let to = step.get("to").and_then(|v| v.as_str()).unwrap_or("");
            println!("  │  \x1b[1m{}\x1b[0m ──[\x1b[36m{}\x1b[0m]──> \x1b[1m{}\x1b[0m", from, edge, to);
        }
        println!("  └──────────────────────────────────────────────────────────────────┘");
    } else {
        println!("  {}", val);
    }
}
