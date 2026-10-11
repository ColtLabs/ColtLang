import type { SourceSpan } from '@coltanedb/parser';

export type EngineType =
  | 'postgres'
  | 'redis'
  | 'mongodb'
  | 'sqlite'
  | 'libsql'
  | 'firestore'
  | 'd1';

export type PostgresBackend = string;

export interface ConnectionModel {
  alias: string;
  engine: EngineType;
  envVar?: string;
  urlEnv?: string;
  span?: SourceSpan;
}

export interface ParameterBinding {
  kind: 'constant' | 'parameter' | 'default' | 'path';
  value?: unknown;
  name?: string;
  expression?: string;
  transform?: 'json' | 'array' | 'vector';
}

export interface PlanStep {
  backend: string;
  operation: 'schema.create' | 'query' | 'record.put' | 'record.create' | 'record.delete' | 'transaction';
  collection: string;
  parameterizedStatement?: string;
  params?: ParameterBinding[];
  substeps?: PlanStep[];
  span: SourceSpan;
}

export interface ExecutionPlan {
  steps: PlanStep[];
}

export interface CompilerDiagnostic {
  code: string;
  message: string;
  hint?: string;
  span: SourceSpan;
}

export interface CompileOptions {
  connections?: ConnectionModel[];
  tomlConfig?: string;
  defaultConnection?: string;
}

export interface CompileResult {
  plan?: ExecutionPlan;
  diagnostics: CompilerDiagnostic[];
}

export interface Capabilities {
  joins: boolean;
  transactions: boolean;
  docPaths: boolean;
  vector: boolean;
  graph: boolean;
  timeSeries: boolean;
  fullText: boolean;
  ttl: boolean;
}

export interface CollectionModel {
  name: string;
  backend: string;
  engine: EngineType;
  statement: import('@coltanedb/parser').DefineCollectionStatement;
}

export type Catalog = Map<string, CollectionModel>;