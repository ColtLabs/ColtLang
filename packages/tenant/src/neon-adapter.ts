import type { Capabilities, ParameterBinding, PlanStep } from '@coltanedb/compiler';
import { postgresCapabilities } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export interface SqlQueryResult<T = unknown> {
  rows: T[];
  rowCount?: number;
}

export interface SqlExecutor {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

export class InMemorySqlExecutor implements SqlExecutor {
  private readonly schemas = new Map<string, Map<string, Record<string, unknown>[]>>();
  private currentSearchPath = 'public';

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const trimmed = sql.trim();

    // Handle SET search_path
    const searchPathMatch = trimmed.match(/SET(?: LOCAL)? search_path\s*=\s*"?([a-z0-9_]+)"?/i);
    if (searchPathMatch) {
      this.currentSearchPath = searchPathMatch[1];
      return { rows: [], rowCount: 0 };
    }

    // Handle CREATE SCHEMA
    const createSchemaMatch = trimmed.match(/CREATE SCHEMA IF NOT EXISTS "?([a-z0-9_]+)"?/i);
    if (createSchemaMatch) {
      const schemaName = createSchemaMatch[1];
      if (!this.schemas.has(schemaName)) {
        this.schemas.set(schemaName, new Map());
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle CREATE TABLE
    const createTableMatch = trimmed.match(/CREATE TABLE IF NOT EXISTS "?(?:([a-z0-9_]+)"?\."?)?([a-z0-9_]+)"?/i);
    if (createTableMatch && (trimmed.startsWith('CREATE TABLE') || trimmed.startsWith('create table'))) {
      const schema = createTableMatch[1] || this.currentSearchPath;
      const table = createTableMatch[2];
      if (!this.schemas.has(schema)) {
        this.schemas.set(schema, new Map());
      }
      const schemaTables = this.schemas.get(schema)!;
      if (!schemaTables.has(table)) {
        schemaTables.set(table, []);
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle INSERT
    const insertMatch = trimmed.match(/INSERT INTO "?(?:([a-z0-9_]+)"?\."?)?([a-z0-9_]+)"?\s*(?:\(([^)]+)\))?\s*VALUES/i);
    if (insertMatch) {
      const schema = insertMatch[1] || this.currentSearchPath;
      const table = insertMatch[2];
      const cols = insertMatch[3] ? insertMatch[3].split(',').map((c) => c.trim().replace(/"/g, '')) : [];

      if (!this.schemas.has(schema)) this.schemas.set(schema, new Map());
      const schemaTables = this.schemas.get(schema)!;
      if (!schemaTables.has(table)) schemaTables.set(table, []);

      const row: Record<string, unknown> = {};
      cols.forEach((col, idx) => {
        row[col] = params[idx];
      });
      schemaTables.get(table)!.push(row);
      return { rows: [row as unknown as T], rowCount: 1 };
    }

    // Handle SELECT
    const selectMatch = trimmed.match(/SELECT\s+(.+?)\s+FROM\s+"?(?:([a-z0-9_]+)"?\."?)?([a-z0-9_]+)"?(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (selectMatch) {
      const schema = selectMatch[2] || this.currentSearchPath;
      const table = selectMatch[3];
      const schemaTables = this.schemas.get(schema);
      const rows = schemaTables?.get(table) ?? [];

      return { rows: structuredClone(rows) as unknown as T[], rowCount: rows.length };
    }

    // Handle SELECT 1 (health check)
    if (/^SELECT\s+1/i.test(trimmed)) {
      return { rows: [{ '?column?': 1 }] as unknown as T[], rowCount: 1 };
    }

    // Fallback default
    return { rows: [], rowCount: 0 };
  }

  getSchemaData(schema: string, table: string): Record<string, unknown>[] {
    return this.schemas.get(schema)?.get(table) ?? [];
  }

  seed(tenantId: string, collection: string, rows: readonly unknown[]): void {
    const schema = tenantId.startsWith('tnt_') ? `ct_${tenantId.slice(4)}` : tenantId;
    if (!this.schemas.has(schema)) {
      this.schemas.set(schema, new Map());
    }
    const schemaTables = this.schemas.get(schema)!;
    schemaTables.set(collection, structuredClone(rows as Record<string, unknown>[]));
  }
}

export class NeonStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly executor: SqlExecutor,
    capabilities: Readonly<Capabilities> = postgresCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  seed(tenantId: string, collection: string, rows: readonly unknown[]): void {
    const candidate = this.executor as unknown;
    if (
      typeof candidate === 'object' &&
      candidate !== null &&
      'seed' in candidate &&
      typeof (candidate as Record<string, unknown>).seed === 'function'
    ) {
      ((candidate as Record<string, unknown>).seed as (t: string, c: string, r: readonly unknown[]) => void)(tenantId, collection, rows);
    }
  }

  async connect(context: TenantContext): Promise<void> {
    await this.executor.query(`CREATE SCHEMA IF NOT EXISTS "${context.schemaName}"`);
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    try {
      const res = await this.executor.query('SELECT 1');
      return (res.rowCount ?? 0) > 0 || res.rows.length > 0;
    } catch {
      return false;
    }
  }

  async execute(
    step: PlanStep,
    context: TenantContext,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    if (step.backend !== 'neon' && step.backend !== 'supabase') {
      throw new Error(`Unsupported backend ${step.backend} for NeonStoreAdapter`);
    }

    // Scope session to tenant schema
    await this.executor.query(`SET LOCAL search_path = "${context.schemaName}", public`);

    const sql = step.parameterizedStatement;
    if (!sql) {
      return { rows: [], rowCount: 0 };
    }

    const boundParams = this.resolveBindings(step.params ?? [], parameters);
    const result = await this.executor.query(sql, boundParams);

    if (step.operation === 'query') {
      return result.rows;
    }
    return { rows: result.rows, affected: result.rowCount ?? result.rows.length };
  }

  async apply(change: unknown, context: TenantContext): Promise<void> {
    void change;
    void context;
  }

  async rebuild(collection: string, context: TenantContext): Promise<void> {
    void collection;
    void context;
  }

  async usage(context: TenantContext): Promise<{ rows: number; bytes: number }> {
    await this.executor.query(`SET LOCAL search_path = "${context.schemaName}", public`);
    return { rows: 0, bytes: 0 };
  }

  private resolveBindings(
    bindings: readonly ParameterBinding[],
    parameters?: Readonly<Record<string, unknown>>,
  ): unknown[] {
    return bindings.map((b) => {
      if (b.kind === 'constant') return b.value;
      if (b.kind === 'parameter' && b.name) {
        return parameters?.[b.name] ?? b.value;
      }
      return b.value;
    });
  }
}
