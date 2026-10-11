import { sqliteCapabilities, type Capabilities, type ParameterBinding, type PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export interface LibsqlQueryResult<T = unknown> {
  rows: T[];
  rowsAffected: number;
}

export interface LibsqlClient {
  execute(stmt: { sql: string; args?: unknown[] } | string): Promise<LibsqlQueryResult>;
}

export class InMemoryLibsqlClient implements LibsqlClient {
  private readonly tables = new Map<string, Record<string, unknown>[]>();

  async execute(stmt: { sql: string; args?: unknown[] } | string): Promise<LibsqlQueryResult> {
    const sql = typeof stmt === 'string' ? stmt : stmt.sql;
    const args = (typeof stmt === 'string' ? [] : stmt.args) ?? [];
    const trimmed = sql.trim();

    // Handle CREATE TABLE
    const createMatch = trimmed.match(/CREATE TABLE IF NOT EXISTS "?([a-z0-9_]+)"?/i);
    if (createMatch) {
      const table = createMatch[1];
      if (!this.tables.has(table)) {
        this.tables.set(table, []);
      }
      return { rows: [], rowsAffected: 0 };
    }

    // Handle INSERT
    const insertMatch = trimmed.match(/INSERT INTO "?([a-z0-9_]+)"?\s*(?:\(([^)]+)\))?\s*VALUES/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const cols = insertMatch[2] ? insertMatch[2].split(',').map((c) => c.trim().replace(/"/g, '')) : [];
      if (!this.tables.has(table)) this.tables.set(table, []);

      const row: Record<string, unknown> = {};
      cols.forEach((col, idx) => {
        row[col] = args[idx];
      });
      this.tables.get(table)!.push(row);
      return { rows: [row], rowsAffected: 1 };
    }

    // Handle SELECT
    const selectMatch = trimmed.match(/SELECT\s+(.+?)\s+FROM\s+"?([a-z0-9_]+)"?(?:\s+WHERE\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i);
    if (selectMatch) {
      const table = selectMatch[2];
      const rows = this.tables.get(table) ?? [];
      const whereClause = selectMatch[3];

      let filtered = rows;
      if (whereClause && whereClause.includes('_tid = ?')) {
        const tid = args[0];
        filtered = rows.filter((r) => r._tid === tid);
      }
      return { rows: structuredClone(filtered), rowsAffected: 0 };
    }

    // Handle SELECT 1
    if (/^SELECT\s+1/i.test(trimmed)) {
      return { rows: [{ 1: 1 }], rowsAffected: 0 };
    }

    return { rows: [], rowsAffected: 0 };
  }
}

export class TursoStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly client: LibsqlClient,
    capabilities: Readonly<Capabilities> = sqliteCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  async connect(context: TenantContext): Promise<void> {
    void context;
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    try {
      const res = await this.client.execute('SELECT 1');
      return res.rows.length > 0;
    } catch {
      return false;
    }
  }

  async execute(
    step: PlanStep,
    context: TenantContext,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    if (step.backend !== ('turso' as string) && step.backend !== ('d1' as string)) {
      throw new Error(`Unsupported backend ${step.backend} for TursoStoreAdapter`);
    }

    let sql = step.parameterizedStatement;
    if (!sql) return { rows: [], rowCount: 0 };

    // Inject _tid parameter and clause for SQLite isolation
    const boundParams = this.resolveBindings(step.params ?? [], parameters);

    if (step.operation === 'query') {
      // If table-level query, enforce tenant filter
      if (!sql.toLowerCase().includes('_tid')) {
        sql = sql.includes('WHERE') ? sql.replace(/WHERE\s+/i, 'WHERE _tid = ? AND ') : `${sql} WHERE _tid = ?`;
        boundParams.unshift(context.tenantId);
      }
    } else if (step.operation === 'record.create' || step.operation === 'record.put') {
      if (!sql.toLowerCase().includes('_tid')) {
        sql = sql.replace(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i, '(_tid, $1) VALUES (?, $2)');
        boundParams.unshift(context.tenantId);
      }
    }

    const res = await this.client.execute({ sql, args: boundParams });

    if (step.operation === 'query') {
      return res.rows;
    }
    return { rows: res.rows, affected: res.rowsAffected };
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
    const res = await this.client.execute({
      sql: 'SELECT count(*) as count FROM sqlite_master WHERE sql LIKE ?',
      args: [`%${context.tenantId}%`],
    });
    return { rows: (res.rows[0] as { count?: number })?.count ?? 0, bytes: 0 };
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
