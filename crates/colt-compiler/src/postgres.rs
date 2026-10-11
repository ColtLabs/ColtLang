use crate::types::{
    BindingKind, CollectionModel, ParameterBinding, PlanStep,
};
use colt_ast::*;
use colt_span::SourceSpan;
use serde_json::Value;

pub fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn parameter(binding: ParameterBinding, params: &mut Vec<ParameterBinding>) -> String {
    params.push(binding);
    format!("${}", params.len())
}

fn get_annotation<'a>(
    field: &'a FieldDefinition,
    name: &str,
) -> Option<&'a Annotation> {
    field.annotations.iter().find(|ann| ann.name == name)
}

fn key_field(model: &CollectionModel) -> FieldDefinition {
    model
        .fields
        .iter()
        .find(|f| get_annotation(f, "key").is_some())
        .cloned()
        .unwrap_or_else(|| {
            model.fields.first().cloned().unwrap_or_else(|| {
                FieldDefinition::new(
                    "id",
                    TypeDefinition::primitive("uuid", model.span),
                    false,
                    vec![],
                    model.span,
                )
            })
        })
}

fn pg_type(value_type: &TypeDefinition, model: Option<&CollectionModel>) -> String {
    if value_type.kind == TypeKind::Vector {
        return format!("vector({})", value_type.dimension.unwrap_or(0));
    }
    if value_type.kind == TypeKind::List {
        if let Some(item_type) = &value_type.item_type {
            return format!("{}[]", pg_type(item_type, model));
        }
    }
    if value_type.kind == TypeKind::Link {
        if let Some(target_name) = &value_type.name {
            if let Some(m) = model {
                if &m.name == target_name {
                    return pg_type(&key_field(m).value_type, Some(m));
                }
            }
        }
        return "uuid".to_string();
    }
    match value_type.name.as_deref() {
        Some("uuid") => "uuid".to_string(),
        Some("text") => "text".to_string(),
        Some("int") => "integer".to_string(),
        Some("float") => "double precision".to_string(),
        Some("bool") => "boolean".to_string(),
        Some("time") => "timestamptz".to_string(),
        Some("duration") => "interval".to_string(),
        Some("doc") => "jsonb".to_string(),
        _ => "text".to_string(),
    }
}

pub fn compile_schema(model: &CollectionModel) -> PlanStep {
    let mut columns = model
        .fields
        .iter()
        .map(|field| {
            let nullable = if field.optional { "" } else { " NOT NULL" };
            let unique = if get_annotation(field, "unique").is_some() {
                " UNIQUE"
            } else {
                ""
            };
            format!(
                "{} {}{}{}",
                quote_identifier(&field.name),
                pg_type(&field.value_type, Some(model)),
                nullable,
                unique
            )
        })
        .collect::<Vec<_>>();

    let primary_key = key_field(model);
    columns.push(format!(
        "PRIMARY KEY ({})",
        quote_identifier(&primary_key.name)
    ));

    PlanStep {
        backend: model.backend.clone(),
        operation: "schema.create".to_string(),
        collection: model.name.clone(),
        parameterized_statement: Some(format!(
            "CREATE TABLE {} ({})",
            quote_identifier(&model.name),
            columns.join(", ")
        )),
        params: Some(vec![]),
        substeps: None,
        span: model.span,
    }
}

pub fn compile_field_path(
    root: &str,
    segments: &[PathSegment],
    _model: &CollectionModel,
    params: &mut Vec<ParameterBinding>,
) -> String {
    let column = quote_identifier(root);
    if segments.is_empty() {
        return column;
    }
    let path_segments: Vec<String> = segments
        .iter()
        .map(|s| match s {
            PathSegment::Field(f) => f.clone(),
            PathSegment::Index(i) => i.to_string(),
        })
        .collect();

    let val = serde_json::to_value(&path_segments).unwrap_or(Value::Null);
    let marker = parameter(
        ParameterBinding {
            kind: BindingKind::Path,
            value: Some(val),
            name: None,
            expression: None,
            transform: None,
        },
        params,
    );
    format!("jsonb_extract_path({}, VARIADIC {}::text[])", column, marker)
}

pub fn json_value(expression: &Expression) -> Value {
    match expression {
        Expression::Literal { value, .. } => match value {
            LiteralValue::Null => Value::Null,
            LiteralValue::Bool(b) => Value::Bool(*b),
            LiteralValue::String(s) => Value::String(s.clone()),
        },
        Expression::NumberLiteral { raw, .. } => {
            if let Ok(i) = raw.parse::<i64>() {
                Value::Number(i.into())
            } else if let Ok(f) = raw.parse::<f64>() {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }
        Expression::Unary {
            operator, operand, ..
        } if operator == "-" => {
            let val = json_value(operand);
            if let Some(i) = val.as_i64() {
                Value::Number((-i).into())
            } else if let Some(f) = val.as_f64() {
                serde_json::Number::from_f64(-f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }
        Expression::DurationLiteral { raw, .. } | Expression::TimeLiteral { raw, .. } => {
            Value::String(raw.clone())
        }
        Expression::ObjectLiteral { fields, .. } => {
            let mut map = serde_json::Map::new();
            for f in fields {
                map.insert(f.name.clone(), json_value(&f.value));
            }
            Value::Object(map)
        }
        Expression::ListLiteral { items, .. } => {
            let arr = items.iter().map(json_value).collect();
            Value::Array(arr)
        }
        _ => Value::Null,
    }
}

fn known_type(expression: &Expression, model: &CollectionModel) -> Option<String> {
    match expression {
        Expression::NumberLiteral { kind, .. } => {
            Some(if kind == "integer" { "int".to_string() } else { "float".to_string() })
        }
        Expression::Literal { kind, .. } => Some(kind.clone()),
        Expression::DurationLiteral { .. } => Some("duration".to_string()),
        Expression::TimeLiteral { .. } => Some("time".to_string()),
        Expression::FieldPath { root, segments, .. } => {
            let field = model.fields.iter().find(|c| &c.name == root);
            if segments.is_empty() {
                field.and_then(|f| f.value_type.name.clone())
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn compile_expression(
    expression: &Expression,
    model: &CollectionModel,
    params: &mut Vec<ParameterBinding>,
) -> String {
    match expression {
        Expression::Literal { value, .. } => {
            let val = match value {
                LiteralValue::Null => Value::Null,
                LiteralValue::Bool(b) => Value::Bool(*b),
                LiteralValue::String(s) => Value::String(s.clone()),
            };
            parameter(
                ParameterBinding {
                    kind: BindingKind::Constant,
                    value: Some(val),
                    name: None,
                    expression: None,
                    transform: None,
                },
                params,
            )
        }
        Expression::NumberLiteral { raw, .. } => {
            let val = if let Ok(i) = raw.parse::<i64>() {
                Value::Number(i.into())
            } else if let Ok(f) = raw.parse::<f64>() {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            };
            parameter(
                ParameterBinding {
                    kind: BindingKind::Constant,
                    value: Some(val),
                    name: None,
                    expression: None,
                    transform: None,
                },
                params,
            )
        }
        Expression::DurationLiteral { raw, .. } | Expression::TimeLiteral { raw, .. } => {
            parameter(
                ParameterBinding {
                    kind: BindingKind::Constant,
                    value: Some(Value::String(raw.clone())),
                    name: None,
                    expression: None,
                    transform: None,
                },
                params,
            )
        }
        Expression::Parameter { name, .. } => parameter(
            ParameterBinding {
                kind: BindingKind::Parameter,
                value: None,
                name: Some(name.clone()),
                expression: None,
                transform: None,
            },
            params,
        ),
        Expression::FieldPath { root, segments, .. } => {
            compile_field_path(root, segments, model, params)
        }
        Expression::RecordReference { id, .. } => parameter(
            ParameterBinding {
                kind: BindingKind::Constant,
                value: Some(Value::String(format!("{}:{}", id.collection, id.key))),
                name: None,
                expression: None,
                transform: None,
            },
            params,
        ),
        Expression::Call { name, args, .. } => {
            if name.eq_ignore_ascii_case("now") && args.is_empty() {
                parameter(
                    ParameterBinding {
                        kind: BindingKind::Default,
                        value: None,
                        name: None,
                        expression: Some("now".to_string()),
                        transform: None,
                    },
                    params,
                )
            } else {
                panic!("Unsupported function reached code generation: {}", name);
            }
        }
        Expression::Unary {
            operator, operand, ..
        } => {
            let inner = compile_expression(operand, model, params);
            if operator == "NOT" {
                format!("(NOT {})", inner)
            } else {
                format!("(-{})", inner)
            }
        }
        Expression::Binary {
            operator,
            left,
            right,
            ..
        } => {
            if matches!(
                operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">="
            ) {
                let left_type = known_type(left, model);
                let right_type = known_type(right, model);
                let is_num = |t: &Option<String>| {
                    t.as_deref() == Some("int") || t.as_deref() == Some("float")
                };
                let incompatible = (left_type.as_deref() == Some("string") && is_num(&right_type))
                    || (right_type.as_deref() == Some("string") && is_num(&left_type));
                if incompatible {
                    return "FALSE".to_string();
                }
            }

            let left_sql = compile_expression(left, model, params);
            let right_sql = compile_expression(right, model, params);

            if operator == "==" {
                return format!("({} IS NOT DISTINCT FROM {})", left_sql, right_sql);
            }
            if operator == "!=" {
                return format!("({} IS DISTINCT FROM {})", left_sql, right_sql);
            }
            if operator == "IN" {
                return format!("({} = ANY({}))", left_sql, right_sql);
            }

            let op_str = match operator.as_str() {
                "<" => "<",
                "<=" => "<=",
                ">" => ">",
                ">=" => ">=",
                "+" => "+",
                "-" => "-",
                "*" => "*",
                "/" => "/",
                "%" => "%",
                "AND" => "AND",
                "OR" => "OR",
                _ => panic!("Unsupported operator reached code generation: {}", operator),
            };

            let is_comparison = matches!(operator.as_str(), "<" | "<=" | ">" | ">=");
            let sql = format!("({} {} {})", left_sql, op_str, right_sql);
            if is_comparison {
                format!("COALESCE({}, FALSE)", sql)
            } else {
                sql
            }
        }
        Expression::ObjectLiteral { .. } | Expression::ListLiteral { .. } => {
            let json = json_value(expression);
            let json_str = serde_json::to_string(&json).unwrap_or_else(|_| "{}".to_string());
            let marker = parameter(
                ParameterBinding {
                    kind: BindingKind::Constant,
                    value: Some(Value::String(json_str)),
                    name: None,
                    expression: None,
                    transform: Some("json".to_string()),
                },
                params,
            );
            format!("{}::jsonb", marker)
        }
        Expression::NamedArgument { .. } => {
            panic!("Named annotation argument cannot be generated as a query expression.")
        }
    }
}

pub fn compile_find(
    projection: &[FieldPath],
    where_: Option<&Expression>,
    order_by: Option<&OrderByClause>,
    limit: Option<usize>,
    offset: Option<usize>,
    span: SourceSpan,
    model: &CollectionModel,
) -> PlanStep {
    let mut params = Vec::new();
    let projection_sql = projection
        .iter()
        .map(|field| {
            let alias = if field.segments.is_empty() {
                field.root.clone()
            } else {
                let segs = field
                    .segments
                    .iter()
                    .map(|s| match s {
                        PathSegment::Field(f) => f.clone(),
                        PathSegment::Index(i) => i.to_string(),
                    })
                    .collect::<Vec<_>>()
                    .join(".");
                format!("{}.{}", field.root, segs)
            };
            format!(
                "{} AS {}",
                compile_field_path(&field.root, &field.segments, model, &mut params),
                quote_identifier(&alias)
            )
        })
        .collect::<Vec<_>>()
        .join(", ");

    let mut sql = format!("SELECT {} FROM {}", projection_sql, quote_identifier(&model.name));
    if let Some(where_expr) = where_ {
        sql.push_str(&format!(
            " WHERE {}",
            compile_expression(where_expr, model, &mut params)
        ));
    }
    if let Some(ob) = order_by {
        let dir = match ob.direction {
            OrderDirection::ASC => "ASC",
            OrderDirection::DESC => "DESC",
        };
        sql.push_str(&format!(
            " ORDER BY {} {} NULLS LAST",
            compile_field_path(&ob.field.root, &ob.field.segments, model, &mut params),
            dir
        ));
    }
    if let Some(lim) = limit {
        let marker = parameter(
            ParameterBinding {
                kind: BindingKind::Constant,
                value: Some(Value::Number(lim.into())),
                name: None,
                expression: None,
                transform: None,
            },
            &mut params,
        );
        sql.push_str(&format!(" LIMIT {}", marker));
    }
    if let Some(off) = offset {
        let marker = parameter(
            ParameterBinding {
                kind: BindingKind::Constant,
                value: Some(Value::Number(off.into())),
                name: None,
                expression: None,
                transform: None,
            },
            &mut params,
        );
        sql.push_str(&format!(" OFFSET {}", marker));
    }

    PlanStep {
        backend: model.backend.clone(),
        operation: "query".to_string(),
        collection: model.name.clone(),
        parameterized_statement: Some(sql),
        params: Some(params),
        substeps: None,
        span,
    }
}

pub fn compile_insert(
    statement: &Statement,
    model: &CollectionModel,
    mode: &str, // "put" or "create"
) -> PlanStep {
    let (id_opt, fields, span) = match statement {
        Statement::Put { id, fields, span } => (Some(id), fields, *span),
        Statement::Create {
            id, fields, span, ..
        } => (id.as_ref(), fields, *span),
        _ => unreachable!(),
    };

    let mut params = Vec::new();
    let primary = key_field(model);
    let supplied: std::collections::HashSet<String> =
        fields.iter().map(|f| f.name.clone()).collect();
    let mut values: Vec<ObjectField> = fields.clone();

    if mode == "put" || id_opt.is_some() {
        if let Some(id) = id_opt {
            if !supplied.contains(&primary.name) {
                values.insert(
                    0,
                    ObjectField::new(
                        primary.name.clone(),
                        Expression::Literal {
                            kind: "key".to_string(),
                            value: LiteralValue::String(id.key.clone()),
                            raw: id.key.clone(),
                            span: id.span,
                        },
                        id.span,
                    ),
                );
            }
        }
    } else if !supplied.contains(&primary.name) {
        values.insert(
            0,
            ObjectField::new(
                primary.name.clone(),
                Expression::Call {
                    name: "gen_random_uuid".to_string(),
                    args: vec![],
                    span,
                },
                span,
            ),
        );
    }

    for field in &model.fields {
        if supplied.contains(&field.name) || values.iter().any(|v| v.name == field.name) {
            continue;
        }
        if let Some(default_ann) = get_annotation(field, "default") {
            if let Some(default_val) = default_ann.args.first() {
                values.push(ObjectField::new(
                    field.name.clone(),
                    default_val.clone(),
                    default_ann.span,
                ));
            }
        }
    }

    if mode == "put" {
        for field in &model.fields {
            if field.optional && !values.iter().any(|v| v.name == field.name) {
                values.push(ObjectField::new(
                    field.name.clone(),
                    Expression::Literal {
                        kind: "null".to_string(),
                        value: LiteralValue::Null,
                        raw: "NULL".to_string(),
                        span,
                    },
                    span,
                ));
            }
        }
    }

    let names = values
        .iter()
        .map(|f| quote_identifier(&f.name))
        .collect::<Vec<_>>();

    let placeholders = values
        .iter()
        .map(|field| {
            if let Expression::Call { name, .. } = &field.value {
                if name == "gen_random_uuid" {
                    return "gen_random_uuid()".to_string();
                }
            }
            let def = model.fields.iter().find(|c| c.name == field.name);
            if let Some(d) = def {
                if d.value_type.kind == TypeKind::List {
                    if let Expression::ListLiteral { .. } = &field.value {
                        let json = json_value(&field.value);
                        let marker = parameter(
                            ParameterBinding {
                                kind: BindingKind::Constant,
                                value: Some(json),
                                name: None,
                                expression: None,
                                transform: Some("array".to_string()),
                            },
                            &mut params,
                        );
                        return marker;
                    }
                }
                if d.value_type.kind == TypeKind::Vector {
                    if let Expression::ListLiteral { items, .. } = &field.value {
                        let str_items: Vec<String> = items
                            .iter()
                            .map(|it| {
                                let v = json_value(it);
                                if let Some(n) = v.as_f64() {
                                    n.to_string()
                                } else {
                                    "0".to_string()
                                }
                            })
                            .collect();
                        let vector_str = format!("[{}]", str_items.join(","));
                        let marker = parameter(
                            ParameterBinding {
                                kind: BindingKind::Constant,
                                value: Some(Value::String(vector_str)),
                                name: None,
                                expression: None,
                                transform: Some("vector".to_string()),
                            },
                            &mut params,
                        );
                        return format!(
                            "{}::vector({})",
                            marker,
                            d.value_type.dimension.unwrap_or(0)
                        );
                    }
                }
                if d.value_type.kind == TypeKind::Primitive
                    && d.value_type.name.as_deref() == Some("doc")
                {
                    if let Expression::ObjectLiteral { .. } = &field.value {
                        let json = json_value(&field.value);
                        let json_str =
                            serde_json::to_string(&json).unwrap_or_else(|_| "{}".to_string());
                        let marker = parameter(
                            ParameterBinding {
                                kind: BindingKind::Constant,
                                value: Some(Value::String(json_str)),
                                name: None,
                                expression: None,
                                transform: Some("json".to_string()),
                            },
                            &mut params,
                        );
                        return format!("{}::jsonb", marker);
                    }
                }
            }
            compile_expression(&field.value, model, &mut params)
        })
        .collect::<Vec<_>>();

    let mut sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        quote_identifier(&model.name),
        names.join(", "),
        placeholders.join(", ")
    );

    if mode == "put" {
        let updates: Vec<String> = values
            .iter()
            .filter(|f| {
                f.name != primary.name
                    && get_annotation(
                        model.fields.iter().find(|c| c.name == f.name).unwrap(),
                        "readonly",
                    )
                    .is_none()
            })
            .map(|f| format!("{} = EXCLUDED.{}", quote_identifier(&f.name), quote_identifier(&f.name)))
            .collect();

        let readonly_checks: Vec<String> = values
            .iter()
            .filter(|f| {
                f.name != primary.name
                    && supplied.contains(&f.name)
                    && get_annotation(
                        model.fields.iter().find(|c| c.name == f.name).unwrap(),
                        "readonly",
                    )
                    .is_some()
            })
            .map(|f| {
                format!(
                    "{}.{} IS NOT DISTINCT FROM EXCLUDED.{}",
                    quote_identifier(&model.name),
                    quote_identifier(&f.name),
                    quote_identifier(&f.name)
                )
            })
            .collect();

        if !updates.is_empty() {
            let where_clause = if !readonly_checks.is_empty() {
                format!(" WHERE {}", readonly_checks.join(" AND "))
            } else {
                "".to_string()
            };
            sql.push_str(&format!(
                " ON CONFLICT ({}) DO UPDATE SET {}{}",
                quote_identifier(&primary.name),
                updates.join(", "),
                where_clause
            ));
        } else if !readonly_checks.is_empty() {
            sql.push_str(&format!(
                " ON CONFLICT ({}) DO UPDATE SET {} = EXCLUDED.{} WHERE {}",
                quote_identifier(&primary.name),
                quote_identifier(&primary.name),
                quote_identifier(&primary.name),
                readonly_checks.join(" AND ")
            ));
        } else {
            sql.push_str(&format!(
                " ON CONFLICT ({}) DO NOTHING",
                quote_identifier(&primary.name)
            ));
        }
    } else {
        sql.push_str(&format!(
            " ON CONFLICT ({}) DO NOTHING",
            quote_identifier(&primary.name)
        ));
    }

    sql.push_str(" RETURNING *");

    PlanStep {
        backend: model.backend.clone(),
        operation: if mode == "put" {
            "record.put".to_string()
        } else {
            "record.create".to_string()
        },
        collection: model.name.clone(),
        parameterized_statement: Some(sql),
        params: Some(params),
        substeps: None,
        span,
    }
}

pub fn compile_delete(
    target: &DeleteTarget,
    span: SourceSpan,
    model: &CollectionModel,
) -> PlanStep {
    let mut params = Vec::new();
    let primary = key_field(model);
    let mut sql = format!("DELETE FROM {}", quote_identifier(&model.name));

    match target {
        DeleteTarget::Record { id } => {
            let marker = parameter(
                ParameterBinding {
                    kind: BindingKind::Constant,
                    value: Some(Value::String(id.key.clone())),
                    name: None,
                    expression: None,
                    transform: None,
                },
                &mut params,
            );
            sql.push_str(&format!(" WHERE {} = {}", quote_identifier(&primary.name), marker));
        }
        DeleteTarget::Where { expression, .. } => {
            sql.push_str(&format!(
                " WHERE {}",
                compile_expression(expression, model, &mut params)
            ));
        }
    }

    sql.push_str(" RETURNING 1");

    PlanStep {
        backend: model.backend.clone(),
        operation: "record.delete".to_string(),
        collection: model.name.clone(),
        parameterized_statement: Some(sql),
        params: Some(params),
        substeps: None,
        span,
    }
}

pub fn generate_statement(statement: &Statement, model: &CollectionModel) -> PlanStep {
    match statement {
        Statement::DefineCollection { .. } => compile_schema(model),
        Statement::Find {
            projection,
            where_,
            order_by,
            limit,
            offset,
            span,
            ..
        } => compile_find(
            projection,
            where_.as_ref().map(|w| &**w),
            order_by.as_ref(),
            *limit,
            *offset,
            *span,
            model,
        ),
        Statement::Put { .. } => compile_insert(statement, model, "put"),
        Statement::Create { .. } => compile_insert(statement, model, "create"),
        Statement::Delete { target, span } => compile_delete(target, *span, model),
        Statement::Atomic { statements, span } => {
            let substeps = statements
                .iter()
                .map(|inner| generate_statement(inner, model))
                .collect();
            PlanStep {
                backend: model.backend.clone(),
                operation: "transaction".to_string(),
                collection: model.name.clone(),
                parameterized_statement: None,
                params: None,
                substeps: Some(substeps),
                span: *span,
            }
        }
        _ => PlanStep {
            backend: model.backend.clone(),
            operation: "transaction".to_string(),
            collection: model.name.clone(),
            parameterized_statement: None,
            params: None,
            substeps: None,
            span: statement.span(),
        },
    }
}

pub fn backend_for(statement: &Statement) -> Option<String> {
    if let Statement::DefineCollection { annotations, .. } = statement {
        let ann = annotations.iter().find(|a| a.name == "backend")?;
        let arg = ann.args.first()?;
        if let Expression::FieldPath { root, .. } = arg {
            return Some(root.clone());
        }
    }
    None
}
