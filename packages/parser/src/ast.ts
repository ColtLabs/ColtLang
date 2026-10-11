import type { SourceSpan } from './lexer/token.ts';

export interface Program {
  type: 'Program';
  version?: string;
  statements: Statement[];
  span: SourceSpan;
}

export interface ConnectStatement {
  type: 'Connect';
  alias: string;
  engine: string;
  envVar: string;
  span: SourceSpan;
}

export interface DefaultConnectionStatement {
  type: 'DefaultConnection';
  alias: string;
  span: SourceSpan;
}

export type Statement =
  | ConnectStatement
  | DefaultConnectionStatement
  | DefineCollectionStatement
  | FindStatement
  | PutStatement
  | CreateStatement
  | DeleteStatement
  | AtomicStatement;

export interface Annotation {
  name: string;
  args: Expression[];
  span: SourceSpan;
}

export interface FieldDefinition {
  name: string;
  valueType: TypeDefinition;
  optional: boolean;
  annotations: Annotation[];
  span: SourceSpan;
}

export interface TypeDefinition {
  kind: 'primitive' | 'list' | 'link' | 'vector';
  name?: string;
  itemType?: TypeDefinition;
  dimension?: number;
  span: SourceSpan;
}

export interface DefineCollectionStatement {
  type: 'DefineCollection';
  name: string;
  mode: 'STRICT' | 'FLEXIBLE';
  annotations: Annotation[];
  fields: FieldDefinition[];
  span: SourceSpan;
}

export interface FieldPath {
  type: 'FieldPath';
  root: string;
  segments: Array<string | number>;
  span: SourceSpan;
}

export interface FindStatement {
  type: 'Find';
  collection: string;
  projection: FieldPath[];
  where?: Expression;
  orderBy?: { field: FieldPath; direction: 'ASC' | 'DESC' };
  limit?: number;
  offset?: number;
  span: SourceSpan;
}

export interface RecordId {
  collection: string;
  key: string;
  span: SourceSpan;
}

export interface ObjectField {
  name: string;
  value: Expression;
  span: SourceSpan;
}

export interface PutStatement {
  type: 'Put';
  id: RecordId;
  fields: ObjectField[];
  span: SourceSpan;
}

export interface CreateStatement {
  type: 'Create';
  id?: RecordId;
  collection: string;
  fields: ObjectField[];
  span: SourceSpan;
}

export interface DeleteStatement {
  type: 'Delete';
  target:
    | { kind: 'record'; id: RecordId }
    | { kind: 'where'; collection: string; expression: Expression };
  span: SourceSpan;
}

export interface AtomicStatement {
  type: 'Atomic';
  statements: Array<PutStatement | CreateStatement | DeleteStatement>;
  span: SourceSpan;
}

export type LiteralValue = string | boolean | null;
export type Expression =
  | { type: 'Literal'; kind: string; value: LiteralValue; raw: string; span: SourceSpan }
  | { type: 'NumberLiteral'; kind: 'integer' | 'float'; raw: string; span: SourceSpan }
  | { type: 'DurationLiteral'; raw: string; span: SourceSpan }
  | { type: 'TimeLiteral'; raw: string; span: SourceSpan }
  | { type: 'Parameter'; name: string; span: SourceSpan }
  | { type: 'NamedArgument'; name: string; value: Expression; span: SourceSpan }
  | FieldPath
  | { type: 'RecordReference'; id: RecordId; span: SourceSpan }
  | { type: 'ObjectLiteral'; fields: ObjectField[]; span: SourceSpan }
  | { type: 'ListLiteral'; items: Expression[]; span: SourceSpan }
  | { type: 'Call'; name: string; args: Expression[]; span: SourceSpan }
  | { type: 'Unary'; operator: string; operand: Expression; span: SourceSpan }
  | { type: 'Binary'; operator: string; left: Expression; right: Expression; span: SourceSpan };
