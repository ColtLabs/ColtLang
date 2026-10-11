use colt_span::SourceSpan;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Program {
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub statements: Vec<Statement>,
    pub span: SourceSpan,
}

impl Program {
    pub fn new(version: Option<String>, statements: Vec<Statement>, span: SourceSpan) -> Self {
        Self {
            r#type: "Program".to_string(),
            version,
            statements,
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Annotation {
    pub name: String,
    pub args: Vec<Expression>,
    pub span: SourceSpan,
}

impl Annotation {
    pub fn new(name: impl Into<String>, args: Vec<Expression>, span: SourceSpan) -> Self {
        Self {
            name: name.into(),
            args,
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinition {
    pub name: String,
    pub value_type: TypeDefinition,
    pub optional: bool,
    pub annotations: Vec<Annotation>,
    pub span: SourceSpan,
}

impl FieldDefinition {
    pub fn new(
        name: impl Into<String>,
        value_type: TypeDefinition,
        optional: bool,
        annotations: Vec<Annotation>,
        span: SourceSpan,
    ) -> Self {
        Self {
            name: name.into(),
            value_type,
            optional,
            annotations,
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TypeKind {
    Primitive,
    List,
    Link,
    Vector,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeDefinition {
    pub kind: TypeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_type: Option<Box<TypeDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dimension: Option<usize>,
    pub span: SourceSpan,
}

impl TypeDefinition {
    pub fn primitive(name: impl Into<String>, span: SourceSpan) -> Self {
        Self {
            kind: TypeKind::Primitive,
            name: Some(name.into()),
            item_type: None,
            dimension: None,
            span,
        }
    }

    pub fn list(item_type: TypeDefinition, span: SourceSpan) -> Self {
        Self {
            kind: TypeKind::List,
            name: None,
            item_type: Some(Box::new(item_type)),
            dimension: None,
            span,
        }
    }

    pub fn link(target_collection: impl Into<String>, span: SourceSpan) -> Self {
        Self {
            kind: TypeKind::Link,
            name: Some(target_collection.into()),
            item_type: None,
            dimension: None,
            span,
        }
    }

    pub fn vector(dimension: usize, span: SourceSpan) -> Self {
        Self {
            kind: TypeKind::Vector,
            name: None,
            item_type: None,
            dimension: Some(dimension),
            span,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CollectionMode {
    STRICT,
    FLEXIBLE,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PathSegment {
    Field(String),
    Index(usize),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldPath {
    pub r#type: String,
    pub root: String,
    pub segments: Vec<PathSegment>,
    pub span: SourceSpan,
}

impl FieldPath {
    pub fn new(root: impl Into<String>, segments: Vec<PathSegment>, span: SourceSpan) -> Self {
        Self {
            r#type: "FieldPath".to_string(),
            root: root.into(),
            segments,
            span,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrderDirection {
    ASC,
    DESC,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderByClause {
    pub field: FieldPath,
    pub direction: OrderDirection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RecordId {
    pub collection: String,
    pub key: String,
    pub span: SourceSpan,
}

impl RecordId {
    pub fn new(collection: impl Into<String>, key: impl Into<String>, span: SourceSpan) -> Self {
        Self {
            collection: collection.into(),
            key: key.into(),
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObjectField {
    pub name: String,
    pub value: Expression,
    pub span: SourceSpan,
}

impl ObjectField {
    pub fn new(name: impl Into<String>, value: Expression, span: SourceSpan) -> Self {
        Self {
            name: name.into(),
            value,
            span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum DeleteTarget {
    #[serde(rename = "record")]
    Record { id: RecordId },
    #[serde(rename = "where")]
    Where {
        collection: String,
        expression: Expression,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Statement {
    Connect {
        alias: String,
        engine: String,
        #[serde(rename = "envVar")]
        env_var: String,
        span: SourceSpan,
    },
    DefaultConnection {
        alias: String,
        span: SourceSpan,
    },
    DefineCollection {
        name: String,
        mode: CollectionMode,
        annotations: Vec<Annotation>,
        fields: Vec<FieldDefinition>,
        span: SourceSpan,
    },
    Find {
        collection: String,
        projection: Vec<FieldPath>,
        #[serde(rename = "where", skip_serializing_if = "Option::is_none")]
        where_: Option<Box<Expression>>,
        #[serde(rename = "orderBy", skip_serializing_if = "Option::is_none")]
        order_by: Option<OrderByClause>,
        #[serde(skip_serializing_if = "Option::is_none")]
        limit: Option<usize>,
        #[serde(skip_serializing_if = "Option::is_none")]
        offset: Option<usize>,
        span: SourceSpan,
    },
    Put {
        id: RecordId,
        fields: Vec<ObjectField>,
        span: SourceSpan,
    },
    Create {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<RecordId>,
        collection: String,
        fields: Vec<ObjectField>,
        span: SourceSpan,
    },
    Delete {
        target: DeleteTarget,
        span: SourceSpan,
    },
    Atomic {
        statements: Vec<Statement>,
        span: SourceSpan,
    },
}

impl Statement {
    pub fn span(&self) -> SourceSpan {
        match self {
            Self::Connect { span, .. } => *span,
            Self::DefaultConnection { span, .. } => *span,
            Self::DefineCollection { span, .. } => *span,
            Self::Find { span, .. } => *span,
            Self::Put { span, .. } => *span,
            Self::Create { span, .. } => *span,
            Self::Delete { span, .. } => *span,
            Self::Atomic { span, .. } => *span,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum LiteralValue {
    String(String),
    Bool(bool),
    Null,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Expression {
    Literal {
        kind: String,
        value: LiteralValue,
        raw: String,
        span: SourceSpan,
    },
    NumberLiteral {
        kind: String, // "integer" or "float"
        raw: String,
        span: SourceSpan,
    },
    DurationLiteral {
        raw: String,
        span: SourceSpan,
    },
    TimeLiteral {
        raw: String,
        span: SourceSpan,
    },
    Parameter {
        name: String,
        span: SourceSpan,
    },
    NamedArgument {
        name: String,
        value: Box<Expression>,
        span: SourceSpan,
    },
    FieldPath {
        root: String,
        segments: Vec<PathSegment>,
        span: SourceSpan,
    },
    RecordReference {
        id: RecordId,
        span: SourceSpan,
    },
    ObjectLiteral {
        fields: Vec<ObjectField>,
        span: SourceSpan,
    },
    ListLiteral {
        items: Vec<Expression>,
        span: SourceSpan,
    },
    Call {
        name: String,
        args: Vec<Expression>,
        span: SourceSpan,
    },
    Unary {
        operator: String,
        operand: Box<Expression>,
        span: SourceSpan,
    },
    Binary {
        operator: String,
        left: Box<Expression>,
        right: Box<Expression>,
        span: SourceSpan,
    },
}

impl Expression {
    pub fn span(&self) -> SourceSpan {
        match self {
            Self::Literal { span, .. } => *span,
            Self::NumberLiteral { span, .. } => *span,
            Self::DurationLiteral { span, .. } => *span,
            Self::TimeLiteral { span, .. } => *span,
            Self::Parameter { span, .. } => *span,
            Self::NamedArgument { span, .. } => *span,
            Self::FieldPath { span, .. } => *span,
            Self::RecordReference { span, .. } => *span,
            Self::ObjectLiteral { span, .. } => *span,
            Self::ListLiteral { span, .. } => *span,
            Self::Call { span, .. } => *span,
            Self::Unary { span, .. } => *span,
            Self::Binary { span, .. } => *span,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use colt_span::SourcePosition;

    #[test]
    fn test_ast_json_compatibility() {
        let span = SourceSpan::new(SourcePosition::new(0, 1, 1), SourcePosition::new(10, 1, 11));
        let connect = Statement::Connect {
            alias: "main".to_string(),
            engine: "postgres".to_string(),
            env_var: "DATABASE_URL".to_string(),
            span,
        };
        let json = serde_json::to_string(&connect).expect("serialization works");
        assert!(json.contains(r#""type":"Connect""#));
        assert!(json.contains(r#""envVar":"DATABASE_URL""#));

        let prog = Program::new(Some("0.2".to_string()), vec![connect], span);
        let prog_json = serde_json::to_string(&prog).expect("prog serialization works");
        assert!(prog_json.contains(r#""type":"Program""#));
        assert!(prog_json.contains(r#""version":"0.2""#));

        let find = Statement::Find {
            collection: "users".to_string(),
            projection: vec![FieldPath::new("id", vec![], span)],
            where_: Some(Box::new(Expression::Literal {
                kind: "null".to_string(),
                value: LiteralValue::Null,
                raw: "null".to_string(),
                span,
            })),
            order_by: None,
            limit: Some(10),
            offset: None,
            span,
        };
        let find_json = serde_json::to_string(&find).expect("find serialization works");
        assert!(find_json.contains(r#""where":{"type":"Literal","kind":"null","value":null,"raw":"null""#));
        assert!(!find_json.contains(r#""where_""#));
    }
}
