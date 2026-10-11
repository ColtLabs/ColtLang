use colt_ast::*;
use colt_diagnostics::codes::*;
use colt_diagnostics::ColtDiagnostic;
use colt_lexer::{lex, ColtToken, LexResult, TokenKind};
use colt_span::SourceSpan;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParseResult {
    pub program: Program,
    pub diagnostics: Vec<ColtDiagnostic>,
}

const RESERVED_STATEMENTS: &[&str] = &["LIVE", "SET", "GET", "RELATE", "MELD"];
const RESERVED_CLAUSES: &[&str] = &["FETCH", "NEAREST", "SINCE", "WINDOW"];
const STATEMENT_KEYWORDS: &[&str] = &[
    "DEFINE", "FIND", "PUT", "CREATE", "DELETE", "ATOMIC", "CONNECT", "DEFAULT",
];

fn precedence(op: &str) -> u8 {
    match op {
        "OR" => 1,
        "AND" => 2,
        "==" | "!=" | "<" | "<=" | ">" | ">=" | "IN" => 3,
        "+" | "-" => 4,
        "*" | "/" | "%" => 5,
        _ => 0,
    }
}

struct ParseFailure {
    diagnostic: ColtDiagnostic,
}

impl ParseFailure {
    fn new(code: &'static str, message: impl Into<String>, span: SourceSpan) -> Self {
        Self {
            diagnostic: ColtDiagnostic::new(code, message, span),
        }
    }
}

struct Parser {
    tokens: Vec<ColtToken>,
    diagnostics: Vec<ColtDiagnostic>,
    current: usize,
}

impl Parser {
    fn new(result: LexResult) -> Self {
        Self {
            tokens: result.tokens,
            diagnostics: result.diagnostics,
            current: 0,
        }
    }

    fn run(mut self) -> ParseResult {
        let mut statements = Vec::new();
        let start = self.peek().span.start;
        let mut version = None;

        while !self.check(TokenKind::Eof) {
            if self.check(TokenKind::Pragma) {
                version = Some(self.advance().value.clone());
                continue;
            }
            let previous = self.current;
            match self.statement() {
                Ok(stmt) => statements.push(stmt),
                Err(failure) => {
                    self.diagnostics.push(failure.diagnostic);
                    self.synchronize();
                }
            }
            if self.current == previous && !self.check(TokenKind::Eof) {
                self.advance();
            }
            self.match_value(";");
        }

        let eof = self.peek();
        let end = eof.span.end;
        ParseResult {
            program: Program::new(version, statements, SourceSpan::new(start, end)),
            diagnostics: self.diagnostics,
        }
    }

    fn statement(&mut self) -> Result<Statement, ParseFailure> {
        if self.check_value("CONNECT") {
            return self.connect_statement();
        }
        if self.check_value("DEFAULT") {
            return self.default_connection_statement();
        }
        if self.check_value("DEFINE") {
            let next_val = self.peek_next().value.clone();
            if next_val == "MELD" || next_val == "SYNC" || next_val == "CONSTRAINT" {
                self.advance();
                let peeked = self.peek().clone();
                return Err(self.reserved(&peeked));
            }
            return self.define_collection();
        }
        if self.check_value("FIND") {
            return self.find_statement();
        }
        if self.check_value("PUT") {
            return self.put_statement();
        }
        if self.check_value("CREATE") {
            return self.create_statement();
        }
        if self.check_value("DELETE") {
            return self.delete_statement();
        }
        if self.check_value("ATOMIC") {
            return self.atomic_statement();
        }

        let peeked = self.peek().clone();
        if RESERVED_STATEMENTS.contains(&peeked.value.as_str()) {
            return Err(self.reserved(&peeked));
        }
        if RESERVED_CLAUSES.contains(&peeked.value.as_str()) {
            return Err(self.reserved(&peeked));
        }
        if self.check_value("EDGE") || self.check_value("POLICY") || self.check_value("MELD") {
            return Err(self.reserved(&peeked));
        }

        let desc = self.describe(&peeked);
        Err(self.failure(COLT1101, format!("Expected a statement, found {}.", desc)))
    }

    fn connect_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("CONNECT")?.span.start;
        let alias = self.consume_identifier("Expected connection alias after CONNECT.")?;
        self.consume_value("AS", "Expected AS after connection alias.")?;
        let engine_token = self.consume_name("Expected engine name after AS.")?;
        let engine = engine_token.value.to_lowercase();
        self.consume_value("(", "Expected ( after engine name.")?;

        if self.check(TokenKind::String) {
            let string_token = self.advance().clone();
            if self.check_value(")") {
                self.advance();
            }
            return Err(ParseFailure::new(
                COLT2023,
                "connection strings must use env(\"VAR\"), not a literal URL",
                string_token.span,
            ));
        }

        self.consume_value("ENV", "Expected env(\"VAR\") for connection string.")?;
        self.consume_value("(", "Expected ( after env.")?;
        let env_var = self.consume_string("Expected environment variable name in env(\"...\").")?;
        self.consume_value(")", "Expected ) after environment variable name.")?;
        let end = self
            .consume_value(")", "Expected ) after engine configuration.")?
            .span
            .end;

        Ok(Statement::Connect {
            alias,
            engine,
            env_var,
            span: SourceSpan::new(start, end),
        })
    }

    fn default_connection_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("DEFAULT")?.span.start;
        self.consume_value("CONNECTION", "Expected CONNECTION after DEFAULT.")?;
        let alias =
            self.consume_identifier("Expected connection alias after DEFAULT CONNECTION.")?;
        let end = self.previous().span.end;

        Ok(Statement::DefaultConnection {
            alias,
            span: SourceSpan::new(start, end),
        })
    }

    fn define_collection(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("DEFINE")?.span.start;
        if self.match_value("EDGE")
            || self.match_value("POLICY")
            || self.match_value("MELD")
            || self.match_value("SYNC")
            || self.match_value("CONSTRAINT")
        {
            let prev = self.previous().clone();
            return Err(self.reserved(&prev));
        }

        self.consume_value("COLLECTION", "Expected COLLECTION after DEFINE.")?;
        let name = self.consume_identifier("Expected a collection name.")?;
        let mode = if self.match_value("FLEXIBLE") {
            CollectionMode::FLEXIBLE
        } else {
            self.match_value("STRICT");
            CollectionMode::STRICT
        };
        let annotations = self.annotations()?;
        self.consume_value("{", "Expected { before collection fields.")?;

        let mut fields = Vec::new();
        while !self.check_value("}") && !self.check(TokenKind::Eof) {
            fields.push(self.field_definition()?);
            if !self.match_value(",") {
                break;
            }
        }

        let end = self
            .consume_value("}", "Expected } after collection fields.")?
            .span
            .end;

        Ok(Statement::DefineCollection {
            name,
            mode,
            annotations,
            fields,
            span: SourceSpan::new(start, end),
        })
    }

    fn field_definition(&mut self) -> Result<FieldDefinition, ParseFailure> {
        let start = self.peek().span.start;
        let name = self.consume_identifier("Expected a field name.")?;
        self.consume_value(":", "Expected : after field name.")?;
        let value_type = self.type_definition()?;
        let optional = self.match_value("?");
        let annotations = self.annotations()?;
        let end = self.previous().span.end;

        Ok(FieldDefinition::new(
            name,
            value_type,
            optional,
            annotations,
            SourceSpan::new(start, end),
        ))
    }

    fn type_definition(&mut self) -> Result<TypeDefinition, ParseFailure> {
        let token = self.peek().clone();
        let name = &token.value;

        if matches!(
            name.as_str(),
            "UUID" | "TEXT" | "INT" | "FLOAT" | "BOOL" | "TIME" | "DURATION" | "DOC"
        ) {
            self.advance();
            return Ok(TypeDefinition::primitive(name.to_lowercase(), token.span));
        }

        if name == "LIST" {
            let start = self.advance().span.start;
            self.consume_value("<", "Expected < after LIST.")?;
            let item_type = self.type_definition()?;
            let end = self
                .consume_value(">", "Expected > after list item type.")?
                .span
                .end;
            return Ok(TypeDefinition::list(item_type, SourceSpan::new(start, end)));
        }

        if name == "LINK" {
            let start = self.advance().span.start;
            self.consume_value("<", "Expected < after LINK.")?;
            let target_collection =
                self.consume_identifier("Expected a collection name in LINK type.")?;
            let end = self
                .consume_value(">", "Expected > after linked collection.")?
                .span
                .end;
            return Ok(TypeDefinition::link(
                target_collection,
                SourceSpan::new(start, end),
            ));
        }

        if name == "VECTOR" {
            let start = self.advance().span.start;
            self.consume_value("(", "Expected ( after VECTOR.")?;
            let dim_token = self.consume_integer("Expected vector dimension.")?;
            let dimension = dim_token.value.parse::<usize>().unwrap_or(0);
            let end = self
                .consume_value(")", "Expected ) after vector dimension.")?
                .span
                .end;
            return Ok(TypeDefinition::vector(
                dimension,
                SourceSpan::new(start, end),
            ));
        }

        let desc = self.describe(&token);
        Err(self.failure(COLT1102, format!("Expected a type, found {}.", desc)))
    }

    fn annotations(&mut self) -> Result<Vec<Annotation>, ParseFailure> {
        let mut annotations = Vec::new();
        while self.match_value("@") {
            let start = self.previous().span.start;
            let name_token = self.consume_name("Expected an annotation name after @.")?;
            let mut args = Vec::new();
            let mut end = name_token.span.end;

            if self.match_value("(") {
                if !self.check_value(")") {
                    loop {
                        args.push(self.annotation_argument()?);
                        if !self.match_value(",") {
                            break;
                        }
                    }
                }
                end = self
                    .consume_value(")", "Expected ) after annotation arguments.")?
                    .span
                    .end;
            }

            annotations.push(Annotation::new(
                name_token.value.to_lowercase(),
                args,
                SourceSpan::new(start, end),
            ));
        }
        Ok(annotations)
    }

    fn annotation_argument(&mut self) -> Result<Expression, ParseFailure> {
        if self.check(TokenKind::Identifier) && self.peek_next().value == ":" {
            let name = self.advance().clone();
            self.advance(); // consume ':'
            let value = self.expression(1)?;
            let span = SourceSpan::new(name.span.start, value.span().end);
            return Ok(Expression::NamedArgument {
                name: name.value,
                value: Box::new(value),
                span,
            });
        }
        self.expression(1)
    }

    fn find_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("FIND")?.span.start;
        let collection = self.consume_identifier("Expected a collection name after FIND.")?;
        self.consume_value("SELECT", "Expected SELECT after collection name.")?;

        let mut projection = vec![self.field_path()?];
        while self.match_value(",") {
            projection.push(self.field_path()?);
        }

        let mut where_ = None;
        let mut order_by = None;
        let mut limit = None;
        let mut offset = None;

        if self.match_value("WHERE") {
            where_ = Some(Box::new(self.expression(1)?));
        }

        if self.match_value("ORDER") {
            self.consume_value("BY", "Expected BY after ORDER.")?;
            let field = self.field_path()?;
            let direction = if self.match_value("DESC") {
                OrderDirection::DESC
            } else {
                self.match_value("ASC");
                OrderDirection::ASC
            };
            order_by = Some(OrderByClause { field, direction });
        }

        if self.match_value("LIMIT") {
            let tok = self.consume_integer("Expected integer after LIMIT.")?;
            limit = Some(tok.value.parse::<usize>().unwrap_or(0));
        }

        if self.match_value("OFFSET") {
            let tok = self.consume_integer("Expected integer after OFFSET.")?;
            offset = Some(tok.value.parse::<usize>().unwrap_or(0));
        }

        let end = self.previous().span.end;
        Ok(Statement::Find {
            collection,
            projection,
            where_,
            order_by,
            limit,
            offset,
            span: SourceSpan::new(start, end),
        })
    }

    fn put_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("PUT")?.span.start;
        let id = self.record_id()?;
        let fields = self.object_literal()?;
        let end = self.previous().span.end;

        Ok(Statement::Put {
            id,
            fields,
            span: SourceSpan::new(start, end),
        })
    }

    fn create_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("CREATE")?.span.start;
        let first = self.consume_identifier("Expected a collection name after CREATE.")?;
        let id = if self.match_value(":") {
            Some(self.record_id_after_collection(&first)?)
        } else {
            None
        };
        let fields = self.object_literal()?;
        let end = self.previous().span.end;

        Ok(Statement::Create {
            id,
            collection: first,
            fields,
            span: SourceSpan::new(start, end),
        })
    }

    fn delete_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("DELETE")?.span.start;
        let collection = self.consume_identifier("Expected a collection name after DELETE.")?;

        if self.match_value(":") {
            let id = self.record_id_after_collection(&collection)?;
            let end = id.span.end;
            return Ok(Statement::Delete {
                target: DeleteTarget::Record { id },
                span: SourceSpan::new(start, end),
            });
        }

        if !self.match_value("WHERE") {
            return Err(self.failure(
                COLT1103,
                "DELETE requires a record id or WHERE clause; bare collection deletes are forbidden.",
            ));
        }

        let expr = self.expression(1)?;
        let end = expr.span().end;
        Ok(Statement::Delete {
            target: DeleteTarget::Where {
                collection,
                expression: expr,
            },
            span: SourceSpan::new(start, end),
        })
    }

    fn atomic_statement(&mut self) -> Result<Statement, ParseFailure> {
        let start = self.consume_val("ATOMIC")?.span.start;
        self.consume_value("{", "Expected { after ATOMIC.")?;

        let mut statements = Vec::new();
        while !self.check_value("}") && !self.check(TokenKind::Eof) {
            if self.check_value("PUT") {
                statements.push(self.put_statement()?);
            } else if self.check_value("CREATE") {
                statements.push(self.create_statement()?);
            } else if self.check_value("DELETE") {
                statements.push(self.delete_statement()?);
            } else {
                let peeked = self.peek().clone();
                if RESERVED_STATEMENTS.contains(&peeked.value.as_str()) {
                    return Err(self.reserved(&peeked));
                }
                return Err(self.failure(
                    COLT1104,
                    "ATOMIC supports PUT, CREATE, and DELETE statements in M1.",
                ));
            }
            self.match_value(";");
        }

        let end = self
            .consume_value("}", "Expected } after ATOMIC statements.")?
            .span
            .end;

        Ok(Statement::Atomic {
            statements,
            span: SourceSpan::new(start, end),
        })
    }

    fn object_literal(&mut self) -> Result<Vec<ObjectField>, ParseFailure> {
        self.consume_value("{", "Expected { before record fields.")?;
        let mut fields = Vec::new();

        while !self.check_value("}") && !self.check(TokenKind::Eof) {
            let start = self.peek().span.start;
            let name = self.consume_identifier("Expected a field name in record literal.")?;
            self.consume_value(":", "Expected : after record field name.")?;
            let value = self.expression(1)?;
            let end = value.span().end;
            fields.push(ObjectField::new(name, value, SourceSpan::new(start, end)));
            if !self.match_value(",") {
                break;
            }
        }

        self.consume_value("}", "Expected } after record fields.")?;
        Ok(fields)
    }

    fn record_id(&mut self) -> Result<RecordId, ParseFailure> {
        let collection = self.consume_identifier("Expected a collection name.")?;
        self.consume_value(":", "Expected : before record key.")?;
        self.record_id_after_collection(&collection)
    }

    fn record_id_after_collection(
        &mut self,
        collection: &str,
    ) -> Result<RecordId, ParseFailure> {
        let key = self.advance().clone();
        if !matches!(
            key.kind,
            TokenKind::Identifier | TokenKind::String | TokenKind::Integer | TokenKind::Uuid
        ) {
            return Err(self.failure_token(
                COLT1105,
                "Record keys must be identifiers, strings, or integers.",
                &key,
            ));
        }

        let start = if self.current >= 2 {
            self.tokens[self.current - 2].span.start
        } else {
            key.span.start
        };

        Ok(RecordId::new(
            collection,
            key.value,
            SourceSpan::new(start, key.span.end),
        ))
    }

    fn field_path(&mut self) -> Result<FieldPath, ParseFailure> {
        let root_token = self
            .consume_identifier_token("Expected a field name.")?
            .clone();
        let mut segments = Vec::new();
        let mut end = root_token.span.end;

        loop {
            if self.match_value(".") {
                let seg = self
                    .consume_identifier_token("Expected a document field after .")?
                    .clone();
                segments.push(PathSegment::Field(seg.value));
                end = seg.span.end;
            } else if self.match_value("[") {
                let idx_token = self
                    .consume_integer("Expected an integer index inside [].")?
                    .clone();
                self.consume_value("]", "Expected ] after document index.")?;
                let idx = idx_token.value.parse::<usize>().unwrap_or(0);
                segments.push(PathSegment::Index(idx));
                end = self.previous().span.end;
            } else {
                break;
            }
        }

        Ok(FieldPath::new(
            root_token.value,
            segments,
            SourceSpan::new(root_token.span.start, end),
        ))
    }

    fn expression(&mut self, min_precedence: u8) -> Result<Expression, ParseFailure> {
        let mut left = self.unary()?;

        loop {
            let op = self.peek().value.clone();
            let op_prec = precedence(&op);
            if op_prec == 0 || op_prec < min_precedence {
                break;
            }
            self.advance();
            let right = self.expression(op_prec + 1)?;
            let span = SourceSpan::new(left.span().start, right.span().end);
            left = Expression::Binary {
                operator: op,
                left: Box::new(left),
                right: Box::new(right),
                span,
            };
        }

        Ok(left)
    }

    fn unary(&mut self) -> Result<Expression, ParseFailure> {
        if self.match_value("NOT") || self.match_value("-") {
            let operator = self.previous().clone();
            let operand = self.unary()?;
            let span = SourceSpan::new(operator.span.start, operand.span().end);
            return Ok(Expression::Unary {
                operator: operator.value,
                operand: Box::new(operand),
                span,
            });
        }
        self.primary()
    }

    fn primary(&mut self) -> Result<Expression, ParseFailure> {
        let token = self.peek().clone();

        if self.match_kind(TokenKind::Integer) || self.match_kind(TokenKind::Float) {
            let kind = match token.kind {
                TokenKind::Integer => "integer".to_string(),
                _ => "float".to_string(),
            };
            return Ok(Expression::NumberLiteral {
                kind,
                raw: token.value,
                span: token.span,
            });
        }

        if self.match_kind(TokenKind::Uuid) {
            return Ok(Expression::Literal {
                kind: "uuid".to_string(),
                value: LiteralValue::String(token.value),
                raw: token.lexeme,
                span: token.span,
            });
        }

        if self.match_kind(TokenKind::Duration) {
            return Ok(Expression::DurationLiteral {
                raw: token.value,
                span: token.span,
            });
        }

        if self.match_kind(TokenKind::Time) {
            return Ok(Expression::TimeLiteral {
                raw: token.value,
                span: token.span,
            });
        }

        if self.match_kind(TokenKind::String) {
            return Ok(Expression::Literal {
                kind: "string".to_string(),
                value: LiteralValue::String(token.value),
                raw: token.lexeme,
                span: token.span,
            });
        }

        if self.match_kind(TokenKind::Parameter) {
            return Ok(Expression::Parameter {
                name: token.value,
                span: token.span,
            });
        }

        if self.match_value("TRUE") {
            return Ok(Expression::Literal {
                kind: "bool".to_string(),
                value: LiteralValue::Bool(true),
                raw: token.lexeme,
                span: token.span,
            });
        }

        if self.match_value("FALSE") {
            return Ok(Expression::Literal {
                kind: "bool".to_string(),
                value: LiteralValue::Bool(false),
                raw: token.lexeme,
                span: token.span,
            });
        }

        if self.match_value("NULL") {
            return Ok(Expression::Literal {
                kind: "null".to_string(),
                value: LiteralValue::Null,
                raw: token.lexeme,
                span: token.span,
            });
        }

        if self.match_value("(") {
            let expr = self.expression(1)?;
            self.consume_value(")", "Expected ) after expression.")?;
            return Ok(expr);
        }

        if self.check_value("{") {
            let start = self.peek().span.start;
            let fields = self.object_literal()?;
            let end = self.previous().span.end;
            return Ok(Expression::ObjectLiteral {
                fields,
                span: SourceSpan::new(start, end),
            });
        }

        if self.match_value("[") {
            let start = token.span.start;
            let mut items = Vec::new();
            if !self.check_value("]") {
                loop {
                    items.push(self.expression(1)?);
                    if !self.match_value(",") {
                        break;
                    }
                }
            }
            let end = self
                .consume_value("]", "Expected ] after list literal.")?
                .span
                .end;
            return Ok(Expression::ListLiteral {
                items,
                span: SourceSpan::new(start, end),
            });
        }

        if token.kind == TokenKind::Identifier
            || (token.kind == TokenKind::Keyword
                && !["AND", "OR", "IN", "NOT"].contains(&token.value.as_str()))
        {
            let name = self.advance().clone();
            if self.match_value(":") {
                let id = self.record_id_after_collection(&name.value)?;
                return Ok(Expression::RecordReference {
                    span: id.span,
                    id,
                });
            }

            if name.value == "NOW" && !self.check_value("(") {
                return Ok(Expression::Call {
                    name: "now".to_string(),
                    args: vec![],
                    span: name.span,
                });
            }

            if self.match_value("(") {
                let mut args = Vec::new();
                if !self.check_value(")") {
                    loop {
                        args.push(self.expression(1)?);
                        if !self.match_value(",") {
                            break;
                        }
                    }
                }
                let end = self
                    .consume_value(")", "Expected ) after function arguments.")?
                    .span
                    .end;
                return Ok(Expression::Call {
                    name: name.value,
                    args,
                    span: SourceSpan::new(name.span.start, end),
                });
            }

            let mut segments = Vec::new();
            let mut end = name.span.end;
            loop {
                if self.match_value(".") {
                    let seg = self.consume_identifier("Expected a field path segment after .")?;
                    segments.push(PathSegment::Field(seg));
                    end = self.previous().span.end;
                } else if self.match_value("[") {
                    let idx_token = self
                        .consume_integer("Expected an integer index inside [].")?
                        .clone();
                    end = self
                        .consume_value("]", "Expected ] after document index.")?
                        .span
                        .end;
                    let idx = idx_token.value.parse::<usize>().unwrap_or(0);
                    segments.push(PathSegment::Index(idx));
                } else {
                    break;
                }
            }

            return Ok(Expression::FieldPath {
                root: name.value,
                segments,
                span: SourceSpan::new(name.span.start, end),
            });
        }

        if RESERVED_CLAUSES.contains(&token.value.as_str())
            || RESERVED_STATEMENTS.contains(&token.value.as_str())
        {
            return Err(self.reserved(&token));
        }

        let desc = self.describe(&token);
        Err(self.failure(COLT1106, format!("Expected an expression, found {}.", desc)))
    }

    fn consume_identifier(&mut self, message: &'static str) -> Result<String, ParseFailure> {
        Ok(self.consume_identifier_token(message)?.value.clone())
    }

    fn consume_identifier_token(
        &mut self,
        message: &'static str,
    ) -> Result<ColtToken, ParseFailure> {
        if self.check(TokenKind::Identifier) {
            Ok(self.advance().clone())
        } else {
            Err(self.failure(COLT1107, message))
        }
    }

    fn consume_name(&mut self, message: &'static str) -> Result<ColtToken, ParseFailure> {
        if self.check(TokenKind::Identifier) || self.check(TokenKind::Keyword) {
            Ok(self.advance().clone())
        } else {
            Err(self.failure(COLT1108, message))
        }
    }

    fn consume_integer(&mut self, message: &'static str) -> Result<ColtToken, ParseFailure> {
        if self.check(TokenKind::Integer) {
            Ok(self.advance().clone())
        } else {
            Err(self.failure(COLT1109, message))
        }
    }

    fn consume_string(&mut self, message: &'static str) -> Result<String, ParseFailure> {
        if self.check(TokenKind::String) {
            Ok(self.advance().value.clone())
        } else {
            Err(self.failure(COLT1106, message))
        }
    }

    fn consume_val(&mut self, value: &str) -> Result<ColtToken, ParseFailure> {
        let msg = format!("Expected {}.", value);
        self.consume_value(value, msg)
    }

    fn consume_value(
        &mut self,
        value: &str,
        message: impl Into<String>,
    ) -> Result<ColtToken, ParseFailure> {
        if self.match_value(value) {
            Ok(self.previous().clone())
        } else {
            Err(self.failure(COLT1110, message))
        }
    }

    fn match_value(&mut self, value: &str) -> bool {
        if !self.check_value(value) {
            return false;
        }
        self.advance();
        true
    }

    fn match_kind(&mut self, kind: TokenKind) -> bool {
        if !self.check(kind) {
            return false;
        }
        self.advance();
        true
    }

    fn check(&self, kind: TokenKind) -> bool {
        self.peek().kind == kind
    }

    fn check_value(&self, value: &str) -> bool {
        self.peek().value == value
    }

    fn advance(&mut self) -> &ColtToken {
        if !self.check(TokenKind::Eof) {
            self.current += 1;
        }
        self.previous()
    }

    fn previous(&self) -> &ColtToken {
        let idx = if self.current > 0 { self.current - 1 } else { 0 };
        &self.tokens[idx]
    }

    fn peek(&self) -> &ColtToken {
        if self.current < self.tokens.len() {
            &self.tokens[self.current]
        } else {
            &self.tokens[self.tokens.len() - 1]
        }
    }

    fn peek_next(&self) -> &ColtToken {
        if self.current + 1 < self.tokens.len() {
            &self.tokens[self.current + 1]
        } else {
            &self.tokens[self.tokens.len() - 1]
        }
    }

    fn failure(&self, code: &'static str, message: impl Into<String>) -> ParseFailure {
        ParseFailure::new(code, message, self.peek().span)
    }

    fn failure_token(
        &self,
        code: &'static str,
        message: impl Into<String>,
        token: &ColtToken,
    ) -> ParseFailure {
        ParseFailure::new(code, message, token.span)
    }

    fn reserved(&self, token: &ColtToken) -> ParseFailure {
        let milestone = if token.value == "FETCH" || token.value == "RELATE" {
            "M10"
        } else {
            "a later milestone"
        };
        ParseFailure::new(
            COLT2003,
            format!("Construct {} is reserved for {}.", token.value, milestone),
            token.span,
        )
    }

    fn describe(&self, token: &ColtToken) -> String {
        if token.kind == TokenKind::Eof {
            "end of input".to_string()
        } else {
            format!("\"{}\"", token.lexeme)
        }
    }

    fn synchronize(&mut self) {
        while !self.check(TokenKind::Eof) {
            if self.previous().value == ";" || STATEMENT_KEYWORDS.contains(&self.peek().value.as_str()) {
                return;
            }
            self.advance();
        }
    }
}

pub fn parse(source: &str) -> ParseResult {
    let lex_result = lex(source);
    Parser::new(lex_result).run()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_library_example() {
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

        let res = parse(source);
        assert_eq!(res.diagnostics, vec![]);
        assert_eq!(res.program.statements.len(), 8);
        assert_eq!(res.program.version, Some("0.2".to_string()));
    }

    #[test]
    fn test_parse_conformance_cases() {
        // Reserved syntax
        let res = parse("FIND users SELECT id FETCH author");
        assert_eq!(res.diagnostics.len(), 1);
        assert_eq!(res.diagnostics[0].code, "COLT2003");
        assert!(res.diagnostics[0].message.contains("M10"));

        // Precedence
        let res = parse("FIND users SELECT id WHERE a AND b OR c == d + e * f");
        assert_eq!(res.diagnostics, vec![]);
        match &res.program.statements[0] {
            Statement::Find { where_, .. } => {
                let w = where_.as_ref().unwrap();
                match &**w {
                    Expression::Binary { operator, left, right, .. } => {
                        assert_eq!(operator, "OR");
                        match &**left {
                            Expression::Binary { operator: op_l, .. } => assert_eq!(op_l, "AND"),
                            _ => panic!("expected AND left"),
                        }
                        match &**right {
                            Expression::Binary { operator: op_r, right: r_inner, .. } => {
                                assert_eq!(op_r, "==");
                                match &**r_inner {
                                    Expression::Binary { operator: op_add, right: r_mul, .. } => {
                                        assert_eq!(op_add, "+");
                                        match &**r_mul {
                                            Expression::Binary { operator: op_mul, .. } => {
                                                assert_eq!(op_mul, "*");
                                            }
                                            _ => panic!("expected *"),
                                        }
                                    }
                                    _ => panic!("expected +"),
                                }
                            }
                            _ => panic!("expected =="),
                        }
                    }
                    _ => panic!("expected OR binary"),
                }
            }
            _ => panic!("expected Find"),
        }

        // Bare delete
        let res = parse("DELETE users");
        assert_eq!(res.diagnostics.len(), 1);
        assert_eq!(res.diagnostics[0].code, "COLT1103");
    }

    #[test]
    fn test_all_conformance_parse_cases() {
        struct Case {
            source: &'static str,
            codes: &'static [&'static str],
            statement_types: &'static [&'static str],
        }

        let cases: &[Case] = &[
            Case {
                source: "DEFINE COLLECTION books @backend(neon) { id: uuid @key, isbn: text @unique, cached: doc @readonly, expires: time? @ttl(30d), embedding: vector(1536) @index(hnsw, metric: cosine), series: list<text>, author: link<authors> }",
                codes: &[],
                statement_types: &["DefineCollection"],
            },
            Case {
                source: "DEFINE COLLECTION logs FLEXIBLE { id: uuid @key }",
                codes: &[],
                statement_types: &["DefineCollection"],
            },
            Case {
                source: "DEFINE COLLECTION logs { id: uuid @key }",
                codes: &[],
                statement_types: &["DefineCollection"],
            },
            Case {
                source: "DEFINE COLLECTION a { nickname: text? @key }",
                codes: &[],
                statement_types: &["DefineCollection"],
            },
            Case {
                source: "DEFINE COLLECTION {",
                codes: &["COLT1107"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE COLLECTION a { id: money @key }",
                codes: &["COLT1102"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE COLLECTION a { id: uuid @key",
                codes: &["COLT1110"],
                statement_types: &[],
            },
            Case {
                source: "FIND users WHERE id == 1",
                codes: &["COLT1110"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id, email WHERE score > $minimum AND active == true ORDER BY created DESC LIMIT 10 OFFSET 5",
                codes: &[],
                statement_types: &["Find"],
            },
            Case {
                source: "FIND users SELECT id ORDER BY created",
                codes: &[],
                statement_types: &["Find"],
            },
            Case {
                source: "FIND users SELECT profile.city",
                codes: &[],
                statement_types: &["Find"],
            },
            Case {
                source: "FIND users SELECT profile.tags[0]",
                codes: &[],
                statement_types: &["Find"],
            },
            Case {
                source: "PUT users:alice { email: \"a@x.com\" }",
                codes: &[],
                statement_types: &["Put"],
            },
            Case {
                source: "PUT users:11111111-1111-4111-8111-111111111111 { email: \"a@x.com\" }",
                codes: &[],
                statement_types: &["Put"],
            },
            Case {
                source: "PUT users:{ }",
                codes: &["COLT1105"],
                statement_types: &[],
            },
            Case {
                source: "CREATE users { email: \"a@x.com\" }",
                codes: &[],
                statement_types: &["Create"],
            },
            Case {
                source: "CREATE users:bob { email: \"b@x.com\" }",
                codes: &[],
                statement_types: &["Create"],
            },
            Case {
                source: "DELETE users:alice",
                codes: &[],
                statement_types: &["Delete"],
            },
            Case {
                source: "DELETE users WHERE email == $email",
                codes: &[],
                statement_types: &["Delete"],
            },
            Case {
                source: "DELETE users",
                codes: &["COLT1103"],
                statement_types: &[],
            },
            Case {
                source: "ATOMIC { PUT users:a { email: \"x\" }; CREATE users { email: \"y\" }; DELETE users:b }",
                codes: &[],
                statement_types: &["Atomic"],
            },
            Case {
                source: "ATOMIC { FIND users SELECT id }",
                codes: &["COLT1104"],
                statement_types: &[],
            },
            Case {
                source: "LIVE FIND docs WHERE author == users:alice",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id FETCH author",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id NEAREST profile",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE EDGE follows { from: users, to: users }",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE POLICY owners { FOR READ WHEN true }",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "SET users:alice { email: \"a@x.com\" }",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "GET users:alice",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "RELATE users:a -> users:b",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id WINDOW 5m",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id SINCE 1h",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "FIND users SELECT id; FIND users SELECT email;",
                codes: &[],
                statement_types: &["Find", "Find"],
            },
            Case {
                source: "DEFINE COLLECTION a { id: uuid @key, name: text, }",
                codes: &[],
                statement_types: &["DefineCollection"],
            },
            Case {
                source: "#colt 0.2\nCONNECT main AS postgres(env(\"DATABASE_URL\"))\nDEFAULT CONNECTION main\nDEFINE COLLECTION users { id: uuid @key }",
                codes: &[],
                statement_types: &["Connect", "DefaultConnection", "DefineCollection"],
            },
            Case {
                source: "DEFINE MELD book_reviews LINK reviews.book -> books.id",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE MELD hot_books SYNC books TO cache KEY id TTL 10m",
                codes: &["COLT2003"],
                statement_types: &[],
            },
            Case {
                source: "DEFINE MELD review_book CONSTRAINT reviews.book REFERENCES books.id MODE check_on_write",
                codes: &["COLT2003"],
                statement_types: &[],
            },
        ];

        for c in cases {
            let res = parse(c.source);
            if !c.codes.is_empty() {
                let actual_codes: Vec<&str> = res.diagnostics.iter().map(|d| d.code.as_str()).collect();
                for expected in c.codes {
                    assert!(
                        actual_codes.contains(expected),
                        "Source '{}' expected code '{}' in {:?}",
                        c.source,
                        expected,
                        actual_codes
                    );
                }
            }
            if !c.statement_types.is_empty() {
                assert_eq!(
                    res.diagnostics,
                    vec![],
                    "Source '{}' had unexpected diagnostics: {:?}",
                    c.source,
                    res.diagnostics
                );
                let actual_types: Vec<&str> = res
                    .program
                    .statements
                    .iter()
                    .map(|s| match s {
                        Statement::Connect { .. } => "Connect",
                        Statement::DefaultConnection { .. } => "DefaultConnection",
                        Statement::DefineCollection { .. } => "DefineCollection",
                        Statement::Find { .. } => "Find",
                        Statement::Put { .. } => "Put",
                        Statement::Create { .. } => "Create",
                        Statement::Delete { .. } => "Delete",
                        Statement::Atomic { .. } => "Atomic",
                    })
                    .collect();
                assert_eq!(actual_types, c.statement_types, "Source: {}", c.source);
            }
        }
    }

    #[test]
    fn test_parse_never_throws() {
        let malformed = [
            "DEFINE COLLECTION {",
            "FIND users WHERE (",
            "ATOMIC { RELATE a -> b }",
            "$",
            "/*",
        ];
        for src in malformed {
            let res = parse(src);
            assert_eq!(res.program.r#type, "Program");
        }
    }
}
