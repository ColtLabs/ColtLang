use crate::config::parse_colt_toml;
use crate::postgres::{backend_for, generate_statement};
use crate::types::*;
use colt_ast::*;
use colt_diagnostics::codes::*;
use colt_diagnostics::ColtDiagnostic;
use colt_parser::parse;
use colt_span::SourceSpan;
use std::collections::{HashMap, HashSet};

const KNOWN_ANNOTATIONS: &[&str] = &[
    "key",
    "unique",
    "default",
    "index",
    "ttl",
    "storage",
    "timeseries",
    "backend",
    "readonly",
];

const ALLOWED_ENGINES: &[&str] = &[
    "postgres", "redis", "mongodb", "sqlite", "libsql", "firestore", "d1",
];

fn diagnostic(
    diagnostics: &mut Vec<ColtDiagnostic>,
    code: &'static str,
    message: impl Into<String>,
    span: SourceSpan,
    hint: Option<String>,
) {
    let mut d = ColtDiagnostic::new(code, message, span);
    d.hint = hint;
    diagnostics.push(d);
}

fn field_for<'a>(
    model: &'a CollectionModel,
    name: &str,
) -> Option<&'a FieldDefinition> {
    model.fields.iter().find(|f| f.name == name)
}

fn validate_annotations(
    model: &CollectionModel,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    let mut names = HashSet::new();

    for annotation in &model.annotations {
        if !KNOWN_ANNOTATIONS.contains(&annotation.name.as_str()) {
            diagnostic(
                diagnostics,
                COLT2008,
                format!("Unknown annotation @{}.", annotation.name),
                annotation.span,
                None,
            );
        }
    }

    for field in &model.fields {
        if names.contains(&field.name) {
            diagnostic(
                diagnostics,
                COLT2007,
                format!("Duplicate field {}.", field.name),
                field.span,
                None,
            );
        }
        names.insert(field.name.clone());

        let mut annotation_names = HashSet::new();
        for annotation in &field.annotations {
            if !KNOWN_ANNOTATIONS.contains(&annotation.name.as_str()) {
                diagnostic(
                    diagnostics,
                    COLT2008,
                    format!("Unknown annotation @{}.", annotation.name),
                    annotation.span,
                    None,
                );
            }
            if annotation_names.contains(&annotation.name) {
                diagnostic(
                    diagnostics,
                    COLT2009,
                    format!("Duplicate annotation @{}.", annotation.name),
                    annotation.span,
                    None,
                );
            }
            annotation_names.insert(annotation.name.clone());

            if annotation.name == "index" {
                let is_hnsw = annotation.args.iter().any(|arg| match arg {
                    Expression::FieldPath { root, .. } => root.eq_ignore_ascii_case("hnsw"),
                    Expression::NamedArgument { name, value, .. } => {
                        if name.eq_ignore_ascii_case("type") {
                            if let Expression::FieldPath { root, .. } = value.as_ref() {
                                root.eq_ignore_ascii_case("hnsw")
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    }
                    _ => false,
                });
                if is_hnsw && model.engine == EngineType::Redis {
                    diagnostic(
                        diagnostics,
                        COLT2026,
                        format!(
                            "HNSW indexes are not supported on redis connection '{}'",
                            model.backend
                        ),
                        annotation.span,
                        None,
                    );
                }
            }
        }

        if field.value_type.kind == TypeKind::Vector
            && field.value_type.dimension.unwrap_or(0) < 1
        {
            diagnostic(
                diagnostics,
                COLT2010,
                "Vector dimensions must be a positive integer.",
                field.value_type.span,
                None,
            );
        }
    }

    let key_fields: Vec<_> = model
        .fields
        .iter()
        .filter(|f| f.annotations.iter().any(|ann| ann.name == "key"))
        .collect();

    if key_fields.len() != 1 {
        diagnostic(
            diagnostics,
            COLT2011,
            "A collection must declare exactly one @key field.",
            model.span,
            None,
        );
    }
}

fn validate_path<'a>(
    path: &FieldPath,
    model: &'a CollectionModel,
    diagnostics: &mut Vec<ColtDiagnostic>,
) -> Option<&'a FieldDefinition> {
    let field = field_for(model, &path.root);
    if field.is_none() {
        diagnostic(
            diagnostics,
            COLT2004,
            format!("Unknown field {} on collection {}.", path.root, model.name),
            path.span,
            None,
        );
        return None;
    }
    let f = field.unwrap();
    if !path.segments.is_empty()
        && !(f.value_type.kind == TypeKind::Primitive
            && f.value_type.name.as_deref() == Some("doc"))
    {
        diagnostic(
            diagnostics,
            COLT2012,
            format!("Document path {} is only valid on a doc field.", path.root),
            path.span,
            None,
        );
    }
    Some(f)
}

fn validate_expression(
    expression: &Expression,
    model: &CollectionModel,
    catalog: &Catalog,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    match expression {
        Expression::FieldPath {
            root,
            segments,
            span,
        } => {
            let fp = FieldPath {
                r#type: "FieldPath".to_string(),
                root: root.clone(),
                segments: segments.clone(),
                span: *span,
            };
            validate_path(&fp, model, diagnostics);
        }
        Expression::RecordReference { id, span } => {
            if !catalog.contains_key(&id.collection) {
                diagnostic(
                    diagnostics,
                    COLT2002,
                    format!("Unknown collection {}.", id.collection),
                    *span,
                    None,
                );
            }
        }
        Expression::Unary { operand, .. } => {
            validate_expression(operand, model, catalog, diagnostics);
        }
        Expression::Binary { left, right, .. } => {
            validate_expression(left, model, catalog, diagnostics);
            validate_expression(right, model, catalog, diagnostics);
        }
        Expression::Call { name, args, span } => {
            if !name.eq_ignore_ascii_case("now") || !args.is_empty() {
                diagnostic(
                    diagnostics,
                    COLT2013,
                    format!("Function {} is not available in the M1 subset.", name),
                    *span,
                    None,
                );
            }
            for arg in args {
                validate_expression(arg, model, catalog, diagnostics);
            }
        }
        Expression::ObjectLiteral { fields, .. } => {
            for f in fields {
                validate_expression(&f.value, model, catalog, diagnostics);
            }
        }
        Expression::ListLiteral { items, .. } => {
            for it in items {
                validate_expression(it, model, catalog, diagnostics);
            }
        }
        Expression::NamedArgument { value, .. } => {
            validate_expression(value, model, catalog, diagnostics);
        }
        _ => {}
    }
}

fn literal_type_name(kind: &str) -> &str {
    match kind {
        "integer" => "int",
        "float" => "float",
        "string" => "text",
        "bool" => "bool",
        "null" => "null",
        "uuid" => "uuid",
        _ => kind,
    }
}

fn expression_type(expression: &Expression, model: &CollectionModel) -> Option<String> {
    match expression {
        Expression::Literal { kind, .. } => Some(literal_type_name(kind).to_string()),
        Expression::NumberLiteral { kind, .. } => Some(literal_type_name(kind).to_string()),
        Expression::DurationLiteral { .. } => Some("duration".to_string()),
        Expression::TimeLiteral { .. } => Some("time".to_string()),
        Expression::ObjectLiteral { .. } => Some("doc".to_string()),
        Expression::ListLiteral { .. } => Some("list".to_string()),
        Expression::RecordReference { id, .. } => Some(format!("link<{}>", id.collection)),
        Expression::Parameter { .. } => None,
        Expression::FieldPath { root, segments, .. } => {
            let field = field_for(model, root)?;
            if !segments.is_empty() {
                return Some("doc".to_string());
            }
            Some(type_name(&field.value_type))
        }
        Expression::Call { name, .. } if name.eq_ignore_ascii_case("now") => {
            Some("time".to_string())
        }
        Expression::Unary {
            operator, operand, ..
        } => {
            if operator == "NOT" {
                Some("bool".to_string())
            } else {
                expression_type(operand, model)
            }
        }
        Expression::Binary {
            operator, left, ..
        } => {
            if matches!(
                operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">=" | "AND" | "OR" | "IN"
            ) {
                Some("bool".to_string())
            } else {
                expression_type(left, model)
            }
        }
        Expression::NamedArgument { value, .. } => expression_type(value, model),
        _ => None,
    }
}

fn type_name(value_type: &TypeDefinition) -> String {
    match value_type.kind {
        TypeKind::Primitive => value_type.name.clone().unwrap_or_else(|| "unknown".to_string()),
        TypeKind::List => "list".to_string(),
        TypeKind::Link => format!(
            "link<{}>",
            value_type.name.as_deref().unwrap_or("unknown")
        ),
        TypeKind::Vector => "vector".to_string(),
    }
}

fn validate_assignment(
    field: &FieldDefinition,
    expression: &Expression,
    model: &CollectionModel,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    if matches!(expression, Expression::Parameter { .. }) {
        return;
    }
    if let Expression::Literal { value, span, .. } = expression {
        if *value == LiteralValue::Null {
            if !field.optional {
                diagnostic(
                    diagnostics,
                    COLT2018,
                    format!("Required field {} cannot be null.", field.name),
                    *span,
                    None,
                );
            }
            return;
        }
    }

    let expected = type_name(&field.value_type);
    let inferred = expression_type(expression, model);
    let actual = inferred.map(|s| if s == "string" { "text".to_string() } else { s });

    let compatible = actual.is_none()
        || actual.as_ref() == Some(&expected)
        || (field.value_type.kind == TypeKind::Primitive
            && field.value_type.name.as_deref() == Some("doc")
            && actual.as_deref() == Some("doc"))
        || (field.value_type.kind == TypeKind::List && actual.as_deref() == Some("list"))
        || (field.value_type.kind == TypeKind::Vector && actual.as_deref() == Some("list"));

    if !compatible {
        diagnostic(
            diagnostics,
            COLT2018,
            format!(
                "Value for {} has type {}; expected {}.",
                field.name,
                actual.unwrap_or_else(|| "unknown".to_string()),
                expected
            ),
            expression.span(),
            None,
        );
    }

    if field.value_type.kind == TypeKind::Vector {
        if let Expression::ListLiteral { items, span } = expression {
            let dim = field.value_type.dimension.unwrap_or(0);
            if items.len() != dim {
                diagnostic(
                    diagnostics,
                    COLT2019,
                    format!("Vector field {} requires {} values.", field.name, dim),
                    *span,
                    None,
                );
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
enum ConstantValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Unknown,
}

fn constant_value(expression: &Expression) -> ConstantValue {
    match expression {
        Expression::Literal { value, .. } => match value {
            LiteralValue::Null => ConstantValue::Null,
            LiteralValue::Bool(b) => ConstantValue::Bool(*b),
            LiteralValue::String(s) => ConstantValue::String(s.clone()),
        },
        Expression::NumberLiteral { raw, .. } => {
            if let Ok(f) = raw.parse::<f64>() {
                ConstantValue::Number(f)
            } else {
                ConstantValue::Unknown
            }
        }
        Expression::Unary {
            operator, operand, ..
        } => {
            let val = constant_value(operand);
            if operator == "NOT" {
                if let ConstantValue::Bool(b) = val {
                    return ConstantValue::Bool(!b);
                }
            } else if operator == "-" {
                if let ConstantValue::Number(n) = val {
                    return ConstantValue::Number(-n);
                }
            }
            ConstantValue::Unknown
        }
        Expression::Binary {
            operator, left, right, ..
        } => {
            let l = constant_value(left);
            let r = constant_value(right);
            if l == ConstantValue::Unknown || r == ConstantValue::Unknown {
                return ConstantValue::Unknown;
            }
            match operator.as_str() {
                "==" => ConstantValue::Bool(l == r),
                "!=" => ConstantValue::Bool(l != r),
                "AND" => match (l, r) {
                    (ConstantValue::Bool(a), ConstantValue::Bool(b)) => ConstantValue::Bool(a && b),
                    _ => ConstantValue::Unknown,
                },
                "OR" => match (l, r) {
                    (ConstantValue::Bool(a), ConstantValue::Bool(b)) => ConstantValue::Bool(a || b),
                    _ => ConstantValue::Unknown,
                },
                _ => ConstantValue::Unknown,
            }
        }
        _ => ConstantValue::Unknown,
    }
}

fn validate_record_fields(
    fields: &[ObjectField],
    model: &CollectionModel,
    catalog: &Catalog,
    diagnostics: &mut Vec<ColtDiagnostic>,
    span: SourceSpan,
    externally_supplied: &HashSet<String>,
) {
    let mut supplied = HashSet::new();

    for item in fields {
        if supplied.contains(&item.name) {
            diagnostic(
                diagnostics,
                COLT2007,
                format!("Field {} is assigned more than once.", item.name),
                item.span,
                None,
            );
        }
        supplied.insert(item.name.clone());

        if field_for(model, &item.name).is_none() {
            diagnostic(
                diagnostics,
                COLT2004,
                format!("Unknown field {} on collection {}.", item.name, model.name),
                item.span,
                None,
            );
        }
        validate_expression(&item.value, model, catalog, diagnostics);
    }

    for field in &model.fields {
        let has_default = field.annotations.iter().any(|a| a.name == "default");
        if !field.optional
            && !has_default
            && !supplied.contains(&field.name)
            && !externally_supplied.contains(&field.name)
        {
            diagnostic(
                diagnostics,
                COLT2014,
                format!("Required field {} is missing.", field.name),
                span,
                None,
            );
        }
    }
}

fn validate_record_id(
    id: &RecordId,
    model: &CollectionModel,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    let key = model.fields.iter().find(|f| f.annotations.iter().any(|a| a.name == "key"));
    if let Some(k) = key {
        if k.value_type.kind == TypeKind::Primitive
            && k.value_type.name.as_deref() == Some("uuid")
        {
            let is_uuid = id.key.len() == 36
                && id.key.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
            if !is_uuid {
                diagnostic(
                    diagnostics,
                    COLT2015,
                    format!("Record key for {} must be a UUID.", id.collection),
                    id.span,
                    None,
                );
            }
        }
    }
}

fn validate_write(
    statement: &Statement,
    model: &CollectionModel,
    catalog: &Catalog,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    let (is_put, id_opt, fields, span) = match statement {
        Statement::Put { id, fields, span } => (true, Some(id), fields, *span),
        Statement::Create {
            id, fields, span, ..
        } => (false, id.as_ref(), fields, *span),
        _ => return,
    };

    let primary = model.fields.iter().find(|f| f.annotations.iter().any(|a| a.name == "key"));
    let generated_key = !is_put
        && id_opt.is_none()
        && primary.is_some()
        && primary.unwrap().value_type.kind == TypeKind::Primitive
        && primary.unwrap().value_type.name.as_deref() == Some("uuid");

    let mut external_key = HashSet::new();
    if is_put || id_opt.is_some() || generated_key {
        if let Some(p) = primary {
            external_key.insert(p.name.clone());
        }
    }

    validate_record_fields(fields, model, catalog, diagnostics, span, &external_key);

    for item in fields {
        if let Some(f) = field_for(model, &item.name) {
            validate_assignment(f, &item.value, model, diagnostics);
        }
    }

    if is_put {
        if let Some(id) = id_opt {
            validate_record_id(id, model, diagnostics);
        }
    } else if let Some(id) = id_opt {
        validate_record_id(id, model, diagnostics);
    } else if !generated_key {
        diagnostic(
            diagnostics,
            COLT2017,
            "CREATE without a record id requires a UUID key field.",
            span,
            None,
        );
    }
}

fn validate_operation(
    statement: &Statement,
    model: &CollectionModel,
    catalog: &Catalog,
    diagnostics: &mut Vec<ColtDiagnostic>,
) {
    match statement {
        Statement::Find {
            projection,
            where_,
            order_by,
            ..
        } => {
            for path in projection {
                validate_path(path, model, diagnostics);
            }
            if let Some(ob) = order_by {
                validate_path(&ob.field, model, diagnostics);
            }
            if let Some(w) = where_ {
                validate_expression(w, model, catalog, diagnostics);
            }
        }
        Statement::Put { .. } | Statement::Create { .. } => {
            validate_write(statement, model, catalog, diagnostics);
        }
        Statement::Delete { target, .. } => match target {
            DeleteTarget::Record { id } => {
                validate_record_id(id, model, diagnostics);
            }
            DeleteTarget::Where { expression, .. } => {
                validate_expression(expression, model, catalog, diagnostics);
                if constant_value(expression) == ConstantValue::Bool(true) {
                    diagnostic(
                        diagnostics,
                        COLT2005,
                        "DELETE WHERE cannot be a constant expression that evaluates to true.",
                        expression.span(),
                        None,
                    );
                }
            }
        },
        _ => {}
    }
}

fn collection_for(statement: &Statement) -> Option<&str> {
    match statement {
        Statement::Find { collection, .. } => Some(collection),
        Statement::Put { id, .. } => Some(&id.collection),
        Statement::Create { collection, .. } => Some(collection),
        Statement::Delete { target, .. } => match target {
            DeleteTarget::Record { id } => Some(&id.collection),
            DeleteTarget::Where { collection, .. } => Some(collection),
        },
        _ => None,
    }
}

fn validate_atomic<'a>(
    statements: &[Statement],
    span: SourceSpan,
    catalog: &'a Catalog,
    diagnostics: &mut Vec<ColtDiagnostic>,
) -> Option<&'a CollectionModel> {
    if statements.is_empty() {
        diagnostic(
            diagnostics,
            COLT2020,
            "ATOMIC requires at least one supported statement.",
            span,
            None,
        );
        return None;
    }

    let mut models = Vec::new();
    let mut missing = false;

    for child in statements {
        let name = collection_for(child);
        if let Some(n) = name {
            if let Some(m) = catalog.get(n) {
                models.push(m);
            } else {
                missing = true;
                diagnostic(
                    diagnostics,
                    COLT2002,
                    format!("Unknown collection {}.", n),
                    child.span(),
                    None,
                );
            }
        }
    }

    if missing || models.len() != statements.len() {
        return None;
    }

    let first = models[0];
    let differing = models.iter().find(|m| m.backend != first.backend);
    if let Some(diff) = differing {
        diagnostic(
            diagnostics,
            COLT2025,
            format!(
                "ATOMIC block spans connections '{}' and '{}'",
                first.backend, diff.backend
            ),
            span,
            None,
        );
        diagnostic(
            diagnostics,
            COLT2016,
            "ATOMIC cannot span multiple primary backends.",
            span,
            None,
        );
        return None;
    }

    if first.engine == EngineType::Redis {
        diagnostic(
            diagnostics,
            COLT2001,
            format!(
                "ATOMIC transactions are not supported on redis connection '{}'.",
                first.backend
            ),
            span,
            None,
        );
        return None;
    }

    for child in statements {
        let child_model = catalog.get(collection_for(child).unwrap()).unwrap();
        validate_operation(child, child_model, catalog, diagnostics);
    }

    Some(first)
}

fn compile_atomic(
    statements: &[Statement],
    span: SourceSpan,
    catalog: &Catalog,
    model: &CollectionModel,
) -> PlanStep {
    let substeps = statements
        .iter()
        .map(|child| {
            let child_model = catalog.get(collection_for(child).unwrap()).unwrap();
            generate_statement(child, child_model)
        })
        .collect();

    PlanStep {
        backend: model.backend.clone(),
        operation: "transaction".to_string(),
        collection: model.name.clone(),
        parameterized_statement: None,
        params: None,
        substeps: Some(substeps),
        span,
    }
}

pub fn compile(
    source: &str,
    initial_catalog: Option<&Catalog>,
    options: Option<&CompileOptions>,
) -> CompileResult {
    let parsed = parse(source);
    let mut diagnostics = parsed.diagnostics;
    let mut catalog: Catalog = initial_catalog.cloned().unwrap_or_default();
    let mut steps = Vec::new();

    let mut connections = HashMap::new();

    // 1. Seed connections from options
    if let Some(opts) = options {
        for conn in &opts.connections {
            connections.insert(conn.alias.clone(), conn.clone());
        }
        if let Some(toml) = &opts.toml_config {
            let toml_conns = parse_colt_toml(toml);
            for conn in toml_conns {
                if !connections.contains_key(&conn.alias) {
                    connections.insert(conn.alias.clone(), conn);
                }
            }
        }
    }

    let is_v02 = parsed.program.version.as_deref() == Some("0.2");
    let has_connect_statements = parsed
        .program
        .statements
        .iter()
        .any(|s| matches!(s, Statement::Connect { .. }));

    // If not v0.2 and no CONNECT statements, provide legacy v0.1 neon/supabase presets
    if !is_v02 && !has_connect_statements && connections.is_empty() {
        connections.insert(
            "neon".to_string(),
            ConnectionModel {
                alias: "neon".to_string(),
                engine: EngineType::Postgres,
                env_var: None,
                url_env: None,
                span: None,
            },
        );
        connections.insert(
            "supabase".to_string(),
            ConnectionModel {
                alias: "supabase".to_string(),
                engine: EngineType::Postgres,
                env_var: None,
                url_env: None,
                span: None,
            },
        );
    }

    // 2. Scan statements for CONNECT and DEFAULT CONNECTION
    let mut declared_default_alias = options.and_then(|o| o.default_connection.clone());

    for stmt in &parsed.program.statements {
        match stmt {
            Statement::Connect {
                alias,
                engine,
                env_var,
                span,
            } => {
                if !ALLOWED_ENGINES.contains(&engine.as_str()) {
                    diagnostic(
                        &mut diagnostics,
                        COLT2027,
                        format!(
                            "Unknown engine '{}'. Allowed engines are: postgres, redis, mongodb, sqlite, libsql, firestore, d1.",
                            engine
                        ),
                        *span,
                        None,
                    );
                }
                if connections.contains_key(alias) {
                    diagnostic(
                        &mut diagnostics,
                        COLT2022,
                        format!("connection '{}' is declared twice", alias),
                        *span,
                        None,
                    );
                } else if let Some(engine_type) = EngineType::from_str_loose(engine) {
                    connections.insert(
                        alias.clone(),
                        ConnectionModel {
                            alias: alias.clone(),
                            engine: engine_type,
                            env_var: Some(env_var.clone()),
                            url_env: None,
                            span: Some(*span),
                        },
                    );
                }
            }
            Statement::DefaultConnection { alias, .. } => {
                declared_default_alias = Some(alias.clone());
            }
            _ => {}
        }
    }

    // Validate declared default connection if specified
    if let Some(default_alias) = &declared_default_alias {
        if !connections.contains_key(default_alias) {
            let default_stmt = parsed
                .program
                .statements
                .iter()
                .find(|s| matches!(s, Statement::DefaultConnection { .. }));
            let span = default_stmt.map(|s| s.span()).unwrap_or(parsed.program.span);
            diagnostic(
                &mut diagnostics,
                COLT2021,
                format!(
                    "unknown connection '{}'. Declare it with CONNECT {} AS ...",
                    default_alias, default_alias
                ),
                span,
                None,
            );
        }
    }

    // Exactly one connection declared = implicit default
    let effective_default = declared_default_alias.or_else(|| {
        if connections.len() == 1 {
            connections.keys().next().cloned()
        } else {
            None
        }
    });

    for statement in &parsed.program.statements {
        if matches!(
            statement,
            Statement::Connect { .. } | Statement::DefaultConnection { .. }
        ) {
            continue;
        }

        if let Statement::DefineCollection {
            name,
            mode,
            annotations,
            fields,
            span,
        } = statement
        {
            let backend_annotation = annotations.iter().find(|a| a.name == "backend");
            let declared_backend = backend_for(statement);
            let mut target_alias: Option<String> = None;

            if let Some(ann) = backend_annotation {
                if declared_backend.is_none() {
                    diagnostic(
                        &mut diagnostics,
                        COLT1106,
                        "Malformed @backend annotation.",
                        ann.span,
                        None,
                    );
                    continue;
                }
                let backend_str = declared_backend.unwrap();
                if !connections.contains_key(&backend_str) {
                    if backend_str == "neon" || backend_str == "supabase" {
                        diagnostic(
                            &mut diagnostics,
                            COLT2021,
                            format!(
                                "unknown connection '{}'. Declare it with CONNECT {} AS postgres(env(\"DATABASE_URL\"))",
                                backend_str, backend_str
                            ),
                            ann.span,
                            Some("In Colt 0.2, @backend requires a declared connection alias instead of a provider name.".to_string()),
                        );
                    } else {
                        diagnostic(
                            &mut diagnostics,
                            COLT2021,
                            format!(
                                "unknown connection '{}'. Declare it with CONNECT {} AS <engine>(env(\"...\"))",
                                backend_str, backend_str
                            ),
                            ann.span,
                            Some("In Colt 0.2, @backend requires a declared connection alias instead of a provider name.".to_string()),
                        );
                        diagnostic(
                            &mut diagnostics,
                            COLT2001,
                            format!("unsupported backend '{}'.", backend_str),
                            ann.span,
                            None,
                        );
                    }
                    continue;
                }
                target_alias = Some(backend_str);
            } else if let Some(eff) = &effective_default {
                if connections.contains_key(eff) {
                    target_alias = Some(eff.clone());
                }
            } else if connections.len() > 1 {
                if !is_v02 && !has_connect_statements && connections.contains_key("neon") {
                    target_alias = Some("neon".to_string());
                } else {
                    diagnostic(
                        &mut diagnostics,
                        COLT2024,
                        format!(
                            "{} connections declared and no default. Add DEFAULT CONNECTION or @backend(...)",
                            connections.len()
                        ),
                        *span,
                        None,
                    );
                    continue;
                }
            } else if connections.len() == 1 {
                target_alias = connections.keys().next().cloned();
            } else {
                target_alias = Some("neon".to_string());
                connections.insert(
                    "neon".to_string(),
                    ConnectionModel {
                        alias: "neon".to_string(),
                        engine: EngineType::Postgres,
                        env_var: None,
                        url_env: None,
                        span: None,
                    },
                );
            }

            if catalog.contains_key(name) {
                diagnostic(
                    &mut diagnostics,
                    COLT2006,
                    format!("Collection {} is already defined.", name),
                    *span,
                    None,
                );
                continue;
            }

            let alias = target_alias.unwrap_or_else(|| "neon".to_string());
            let conn = connections.get(&alias);
            let engine = conn.map(|c| c.engine).unwrap_or(EngineType::Postgres);
            let model = CollectionModel {
                name: name.clone(),
                backend: alias,
                engine,
                mode: *mode,
                annotations: annotations.clone(),
                fields: fields.clone(),
                span: *span,
            };

            let diag_count = diagnostics.len();
            validate_annotations(&model, &mut diagnostics);
            if diagnostics.len() != diag_count {
                continue;
            }
            catalog.insert(model.name.clone(), model.clone());
            steps.push(generate_statement(statement, &model));
            continue;
        }

        if let Statement::Atomic { statements, span } = statement {
            let diag_count = diagnostics.len();
            let model = validate_atomic(statements, *span, &catalog, &mut diagnostics);
            if let Some(m) = model {
                if diagnostics.len() == diag_count {
                    steps.push(compile_atomic(statements, *span, &catalog, m));
                }
            }
            continue;
        }

        let name = collection_for(statement);
        let model = name.and_then(|n| catalog.get(n));
        if name.is_none() || model.is_none() {
            let n = name.unwrap_or("");
            diagnostic(
                &mut diagnostics,
                COLT2002,
                format!("Unknown collection {}.", n).trim(),
                statement.span(),
                None,
            );
            continue;
        }

        let m = model.unwrap().clone();
        let diag_count = diagnostics.len();
        validate_operation(statement, &m, &catalog, &mut diagnostics);

        if diagnostics.len() == diag_count {
            steps.push(generate_statement(statement, &m));
        }
    }

    if !diagnostics.is_empty() || steps.is_empty() {
        CompileResult {
            plan: None,
            diagnostics,
        }
    } else {
        CompileResult {
            plan: Some(ExecutionPlan { steps }),
            diagnostics,
        }
    }
}
