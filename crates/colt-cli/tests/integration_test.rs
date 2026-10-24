use colt_cli::exit_code::ExitCode;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixture_path(name: &str) -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir.join("../../fixtures/integration").join(name)
}


#[test]
fn test_version_json_contract() {
    // Test that version command with --json outputs valid protocol JSON
    let args = vec!["version", "--json"];
    let opts = colt_cli::args::parse_args(args).expect("parse_args");
    assert_eq!(opts.command, colt_cli::args::CommandName::Version);
    assert!(opts.json);

    let code = colt_cli::run(["version", "--json"]);
    assert_eq!(code, ExitCode::SUCCESS);
}

#[test]
fn test_check_valid_fixture() {
    let path = fixture_path("valid.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["check", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::check::run_check(&source, &opts);
    assert_eq!(code, ExitCode::SUCCESS);
}

#[test]
fn test_check_invalid_syntax_fixture() {
    let path = fixture_path("invalid_syntax.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["check", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::check::run_check(&source, &opts);
    assert_eq!(code, ExitCode::DIAGNOSTICS);
}

#[test]
fn test_check_invalid_semantic_fixture() {
    let path = fixture_path("invalid_semantic.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["check", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::check::run_check(&source, &opts);
    assert_eq!(code, ExitCode::DIAGNOSTICS);
}

#[test]
fn test_check_invalid_capability_fixture() {
    let path = fixture_path("invalid_capability.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["check", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::check::run_check(&source, &opts);
    assert_eq!(code, ExitCode::DIAGNOSTICS);
}

#[test]
fn test_plan_valid_fixture() {
    let path = fixture_path("valid.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["plan", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::plan::run_plan(&source, &opts);
    assert_eq!(code, ExitCode::SUCCESS);
}

#[test]
fn test_plan_invalid_fixture() {
    let path = fixture_path("invalid_semantic.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["plan", "--json", path_str]).expect("opts");

    let code = colt_cli::commands::plan::run_plan(&source, &opts);
    assert_eq!(code, ExitCode::DIAGNOSTICS);
}

#[test]
fn test_fmt_json_contract() {
    let path = fixture_path("valid.colt");
    let content = fs::read_to_string(&path).expect("read");
    let source = colt_cli::source::SourceUnit {
        name: "<stdin>".to_string(),
        text: content,
    };
    let opts = colt_cli::args::parse_args(["fmt", "--stdin", "--json"]).expect("opts");

    let code = colt_cli::commands::fmt::run_fmt(&source, &opts);
    assert_eq!(code, ExitCode::SUCCESS);
}

#[test]
fn test_missing_file_exit_code_2() {
    let code = colt_cli::run(["check", "non_existent_file_xyz_123.colt"]);
    assert_eq!(code, ExitCode::USAGE_ERROR);
}

#[test]
fn test_structured_diagnostic_schema() {
    use colt_compiler::compile;
    let path = fixture_path("invalid_syntax.colt");
    let path_str = path.to_str().expect("valid path");
    let text = fs::read_to_string(&path).expect("read");

    let result = compile(&text, None, None);
    assert!(!result.diagnostics.is_empty());

    let json_str = colt_cli::diagnostics::format_diagnostics_as_json(&result.diagnostics, path_str);
    let v: Value = serde_json::from_str(&json_str).expect("parse json");

    assert_eq!(v["source"], path_str);
    let diags = v["diagnostics"].as_array().expect("array");
    assert!(!diags.is_empty());

    let first = &diags[0];
    assert_eq!(first["file"], path_str);
    assert_eq!(first["severity"], "error");
    assert!(first["line"].is_number());
    assert!(first["column"].is_number());
    assert!(first["endLine"].is_number());
    assert!(first["endColumn"].is_number());
    assert!(first["code"].is_string());
    assert!(first["message"].is_string());
    assert!(first["span"]["start"]["line"].is_number());
}

#[test]
fn test_run_dry_run_json_contract() {
    let path = fixture_path("valid.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["run", "--dry-run", "--json", path_str]).expect("opts");
    assert_eq!(opts.command, colt_cli::args::CommandName::Run);
    assert!(opts.dry_run);
    assert!(opts.json);

    let code = colt_cli::commands::run::run_run(&source, &opts);
    assert_eq!(code, ExitCode::SUCCESS);
}

#[test]
fn test_run_invalid_syntax_returns_diagnostics_code_1() {
    let path = fixture_path("invalid_syntax.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["run", path_str]).expect("opts");

    let code = colt_cli::commands::run::run_run(&source, &opts);
    assert_eq!(code, ExitCode::DIAGNOSTICS);
}

#[test]
fn test_run_offline_runtime_returns_usage_error_code_2() {
    let path = fixture_path("valid.colt");
    let path_str = path.to_str().expect("valid path");

    let source = colt_cli::source::read_source(Some(path_str), false).expect("read source");
    let opts = colt_cli::args::parse_args(["run", path_str]).expect("opts");

    let code = colt_cli::commands::run::run_run(&source, &opts);
    // When offline, colt run must fail with code 2, NEVER pretend execution succeeded!
    assert_eq!(code, ExitCode::USAGE_ERROR);
}

#[test]
fn test_doctor_json_contract() {
    let opts = colt_cli::args::parse_args(["doctor", "--json"]).expect("opts");
    assert_eq!(opts.command, colt_cli::args::CommandName::Doctor);
    let code = colt_cli::commands::doctor::run_doctor(&opts);
    assert_eq!(code, ExitCode::SUCCESS);
}

