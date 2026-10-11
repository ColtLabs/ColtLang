use colt_ast::*;
use colt_diagnostics::ColtDiagnostic;
use colt_parser::parse;

/// Formats Colt source code into canonical formatting.
/// Returns an error if the source contains syntax errors.
pub fn format_source(source: &str) -> Result<String, Vec<ColtDiagnostic>> {
    let parse_result = parse(source);
    if !parse_result.diagnostics.is_empty() {
        return Err(parse_result.diagnostics);
    }
    Ok(format_program(&parse_result.program))
}

/// Formats an AST Program into canonical Colt source string.
pub fn format_program(program: &Program) -> String {
    let mut out = String::new();

    if let Some(v) = &program.version {
        out.push_str(&format!("#colt {}\n", v));
    }

    let mut first = true;
    for stmt in &program.statements {
        if !first || program.version.is_some() {
            out.push('\n');
        }
        first = false;
        out.push_str(&format_statement(stmt, 0));
        out.push('\n');
    }

    if out.is_empty() {
        out.push('\n');
    }

    out
}

fn format_statement(stmt: &Statement, indent_level: usize) -> String {
    let indent = "  ".repeat(indent_level);
    match stmt {
        Statement::Connect {
            alias,
            engine,
            env_var,
            ..
        } => {
            format!("{}CONNECT {} AS {}(env(\"{}\"))", indent, alias, engine, env_var)
        }
        Statement::DefaultConnection { alias, .. } => {
            format!("{}DEFAULT CONNECTION {}", indent, alias)
        }
        Statement::DefineCollection {
            name,
            mode,
            annotations,
            fields,
            ..
        } => {
            let mut s = format!("{}DEFINE COLLECTION {}", indent, name);
            match mode {
                CollectionMode::STRICT => s.push_str(" STRICT"),
                CollectionMode::FLEXIBLE => s.push_str(" FLEXIBLE"),
            }
            for ann in annotations {
                s.push(' ');
                s.push_str(&format_annotation(ann));
            }
            s.push_str(" {\n");

            let field_indent = "  ".repeat(indent_level + 1);
            let field_strs: Vec<String> = fields
                .iter()
                .map(|f| {
                    let mut f_str = format!("{}{}: {}", field_indent, f.name, format_type(&f.value_type));
                    if f.optional {
                        f_str.push('?');
                    }
                    for ann in &f.annotations {
                        f_str.push(' ');
                        f_str.push_str(&format_annotation(ann));
                    }
                    f_str
                })
                .collect();

            s.push_str(&field_strs.join(",\n"));
            s.push('\n');
            s.push_str(&format!("{}}}", indent));
            s
        }
        Statement::Find {
            collection,
            projection,
            where_,
            order_by,
            limit,
            offset,
            ..
        } => {
            let proj_strs: Vec<String> = projection.iter().map(format_field_path).collect();
            let mut s = format!("{}FIND {} SELECT {}", indent, collection, proj_strs.join(", "));
            if let Some(w) = where_ {
                s.push_str(&format!("\n{}WHERE {}", indent, format_expression(w, 0)));
            }
            if let Some(ob) = order_by {
                let dir_str = match ob.direction {
                    OrderDirection::ASC => "ASC",
                    OrderDirection::DESC => "DESC",
                };
                s.push_str(&format!(
                    "\n{}ORDER BY {} {}",
                    indent,
                    format_field_path(&ob.field),
                    dir_str
                ));
            }
            if limit.is_some() || offset.is_some() {
                s.push_str(&format!("\n{}", indent));
                if let Some(l) = limit {
                    s.push_str(&format!("LIMIT {}", l));
                }
                if let Some(o) = offset {
                    if limit.is_some() {
                        s.push(' ');
                    }
                    s.push_str(&format!("OFFSET {}", o));
                }
            }
            s
        }
        Statement::Put {
            id,
            fields,
            ..
        } => {
            let mut s = format!("{}PUT {}:{}", indent, id.collection, id.key);
            if fields.is_empty() {
                s.push_str(" {}");
            } else {
                s.push_str(" {\n");
                let field_indent = "  ".repeat(indent_level + 1);
                let f_strs: Vec<String> = fields
                    .iter()
                    .map(|f| format!("{}{}: {}", field_indent, f.name, format_expression(&f.value, 0)))
                    .collect();
                s.push_str(&f_strs.join(",\n"));
                s.push('\n');
                s.push_str(&format!("{}}}", indent));
            }
            s
        }
        Statement::Create {
            collection,
            fields,
            ..
        } => {
            let mut s = format!("{}CREATE {}", indent, collection);
            if fields.is_empty() {
                s.push_str(" {}");
            } else {
                s.push_str(" {\n");
                let field_indent = "  ".repeat(indent_level + 1);
                let f_strs: Vec<String> = fields
                    .iter()
                    .map(|f| format!("{}{}: {}", field_indent, f.name, format_expression(&f.value, 0)))
                    .collect();
                s.push_str(&f_strs.join(",\n"));
                s.push('\n');
                s.push_str(&format!("{}}}", indent));
            }
            s
        }
        Statement::Delete {
            target,
            ..
        } => match target {
            DeleteTarget::Record { id } => {
                format!("{}DELETE {}:{}", indent, id.collection, id.key)
            }
            DeleteTarget::Where { collection, expression } => {
                format!("{}DELETE {} WHERE {}", indent, collection, format_expression(expression, 0))
            }
        },
        Statement::Atomic { statements, .. } => {
            let mut s = format!("{}ATOMIC {{\n", indent);
            let body_indent = indent_level + 1;
            for stmt in statements {
                let stmt_str = format_atomic_stmt(stmt, body_indent);
                s.push_str(&stmt_str);
                s.push_str(";\n");
            }
            s.push_str(&format!("{}}}", indent));
            s
        }
    }
}

fn format_atomic_stmt(stmt: &Statement, indent_level: usize) -> String {
    let indent = "  ".repeat(indent_level);
    match stmt {
        Statement::Put {
            id,
            fields,
            ..
        } => {
            if fields.is_empty() {
                format!("{}PUT {}:{} {{}}", indent, id.collection, id.key)
            } else if fields.len() == 1 {
                format!(
                    "{}PUT {}:{} {{ {}: {} }}",
                    indent,
                    id.collection,
                    id.key,
                    fields[0].name,
                    format_expression(&fields[0].value, 0)
                )
            } else {
                format_statement(stmt, indent_level)
            }
        }
        Statement::Create {
            collection,
            fields,
            ..
        } => {
            if fields.is_empty() {
                format!("{}CREATE {} {{}}", indent, collection)
            } else if fields.len() == 1 {
                format!(
                    "{}CREATE {} {{ {}: {} }}",
                    indent,
                    collection,
                    fields[0].name,
                    format_expression(&fields[0].value, 0)
                )
            } else {
                format_statement(stmt, indent_level)
            }
        }
        _ => format_statement(stmt, indent_level),
    }
}

fn format_type(t: &TypeDefinition) -> String {
    match t.kind {
        TypeKind::Primitive => t.name.as_deref().unwrap_or("doc").to_string(),
        TypeKind::List => {
            let elem = t
                .item_type
                .as_ref()
                .map(|e| format_type(e))
                .unwrap_or_else(|| "text".to_string());
            format!("list<{}>", elem)
        }
        TypeKind::Link => {
            let target = t.name.as_deref().unwrap_or("doc");
            format!("link<{}>", target)
        }
        TypeKind::Vector => {
            let dim = t.dimension.unwrap_or(0);
            format!("vector({})", dim)
        }
    }
}

fn format_annotation(ann: &Annotation) -> String {
    if ann.args.is_empty() {
        format!("@{}", ann.name)
    } else {
        let args: Vec<String> = ann
            .args
            .iter()
            .map(|arg| format_expression(arg, 0))
            .collect();
        format!("@{}({})", ann.name, args.join(", "))
    }
}

fn format_field_path(fp: &FieldPath) -> String {
    let mut s = fp.root.clone();
    for seg in &fp.segments {
        match seg {
            PathSegment::Field(f) => {
                s.push('.');
                s.push_str(f);
            }
            PathSegment::Index(i) => {
                s.push('[');
                s.push_str(&i.to_string());
                s.push(']');
            }
        }
    }
    s
}

fn op_precedence(op: &str) -> u8 {
    match op {
        "OR" => 1,
        "AND" => 2,
        "==" | "!=" | "<" | "<=" | ">" | ">=" | "IN" => 3,
        "+" | "-" => 4,
        "*" | "/" | "%" => 5,
        _ => 0,
    }
}

pub fn format_expression(expr: &Expression, parent_prec: u8) -> String {
    match expr {
        Expression::Literal { value, .. } => match value {
            LiteralValue::String(s) => format!("\"{}\"", s.replace('"', "\\\"")),
            LiteralValue::Bool(b) => b.to_string(),
            LiteralValue::Null => "null".to_string(),
        },
        Expression::NumberLiteral { raw, .. } => raw.clone(),
        Expression::DurationLiteral { raw, .. } => raw.clone(),
        Expression::TimeLiteral { raw, .. } => raw.clone(),
        Expression::Parameter { name, .. } => format!("${}", name),
        Expression::NamedArgument { name, value, .. } => {
            format!("{}: {}", name, format_expression(value, 0))
        }
        Expression::FieldPath { root, segments, .. } => {
            let fp = FieldPath::new(root.clone(), segments.clone(), expr.span());
            format_field_path(&fp)
        }
        Expression::RecordReference { id, .. } => format!("{}:{}", id.collection, id.key),
        Expression::ListLiteral { items, .. } => {
            let it_strs: Vec<String> = items.iter().map(|it| format_expression(it, 0)).collect();
            format!("[{}]", it_strs.join(", "))
        }
        Expression::ObjectLiteral { fields, .. } => {
            if fields.is_empty() {
                "{}".to_string()
            } else {
                let f_strs: Vec<String> = fields
                    .iter()
                    .map(|f| format!("{}: {}", f.name, format_expression(&f.value, 0)))
                    .collect();
                format!("{{ {} }}", f_strs.join(", "))
            }
        }
        Expression::Unary { operator, operand, .. } => {
            let op_str = if operator == "NOT" { "NOT " } else { operator };
            format!("{}{}", op_str, format_expression(operand, 6))
        }
        Expression::Binary {
            operator,
            left,
            right,
            ..
        } => {
            let my_prec = op_precedence(operator);
            let l_str = format_expression(left, my_prec);
            let r_str = format_expression(right, my_prec + 1);
            let s = format!("{} {} {}", l_str, operator, r_str);
            if parent_prec > 0 && my_prec < parent_prec {
                format!("({})", s)
            } else {
                s
            }
        }
        Expression::Call { name, args, .. } => {
            if name.eq_ignore_ascii_case("now") && args.is_empty() {
                "now".to_string()
            } else {
                let arg_strs: Vec<String> = args.iter().map(|a| format_expression(a, 0)).collect();
                format!("{}({})", name, arg_strs.join(", "))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_library_example() {
        let original = include_str!("../../../examples/library.colt");
        let formatted = format_source(original).expect("formatting should succeed");
        let re_formatted = format_source(&formatted).expect("re-formatting should succeed");
        // Idempotence test
        assert_eq!(formatted, re_formatted);

        // Parse round-trip test: AST statements count matches
        let p_orig = parse(original);
        let p_fmt = parse(&formatted);
        assert_eq!(p_orig.diagnostics, vec![]);
        assert_eq!(p_fmt.diagnostics, vec![]);
        assert_eq!(p_orig.program.statements.len(), p_fmt.program.statements.len());
    }

    #[test]
    fn test_format_expressions_and_operators() {
        let src = "FIND books SELECT id WHERE views > 10 AND title != null OR count == 0";
        let formatted = format_source(src).unwrap();
        assert_eq!(
            formatted.trim(),
            "FIND books SELECT id\nWHERE views > 10 AND title != null OR count == 0"
        );
        let re = format_source(&formatted).unwrap();
        assert_eq!(formatted, re);
    }

    #[test]
    fn test_format_meld_schema() {
        let src = r#"#colt 0.2
CONNECT main AS postgres(env("DATABASE_URL"))
CONNECT cache AS redis(env("REDIS_URL"))
CONNECT notes AS mongodb(env("MONGO_URL"))
DEFAULT CONNECTION main

DEFINE COLLECTION authors STRICT {
  id: uuid @key,
  name: text @unique
}

DEFINE COLLECTION books STRICT {
  id: uuid @key,
  title: text,
  author: link<authors>,
  views: int @default(0)
}

DEFINE COLLECTION reviews FLEXIBLE @backend(notes) {
  id: uuid @key,
  book: link<books>,
  body: text,
  meta: doc
}

DEFINE COLLECTION sessions @backend(cache) @ttl(30m) {
  value: text,
  id: uuid @key
}
"#;
        let formatted = format_source(src).unwrap();
        let re = format_source(&formatted).unwrap();
        assert_eq!(formatted, re);

        let p1 = parse(src);
        let p2 = parse(&formatted);
        assert_eq!(p1.program.statements.len(), p2.program.statements.len());
    }

    #[test]
    fn test_format_delete_where() {
        let src = "DELETE users WHERE age < 18 AND status == \"inactive\"";
        let formatted = format_source(src).unwrap();
        assert_eq!(formatted.trim(), src);
        let re = format_source(&formatted).unwrap();
        assert_eq!(formatted, re);
    }
}
