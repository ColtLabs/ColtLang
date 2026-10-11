import { postgresCapabilities, type Capabilities, type ParameterBinding, type PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { SqlExecutor } from './neon-adapter.js';
import type { StoreAdapter } from './store-adapter.js';

export class SupabaseStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly executor: SqlExecutor,
    capabilities: Readonly<Capabilities> = postgresCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  private validateSchema(schemaName: string): void {
    if (!/^ct_[a-z0-9]{12}$/.test(schemaName) && schemaName !== 'coltanedb_sys') {
      throw new Error(`Forbidden Supabase schema access: '${schemaName}'. Only 'ct_<tid>' schemas are permitted.`);
    }
  }

  async connect(context: TenantContext): Promise<void> {
    this.validateSchema(context.schemaName);
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
    if (step.backend !== 'supabase') {
      throw new Error(`Unsupported backend ${step.backend} for SupabaseStoreAdapter`);
    }

    this.validateSchema(context.schemaName);

    // Hard boundary check: never allow public schema in raw statements
    const sql = step.parameterizedStatement;
    if (sql && /\bpublic\b/i.test(sql) && !sql.toLowerCase().includes('search_path')) {
      throw new Error("Direct queries targeting the 'public' schema are forbidden on Supabase.");
    }

    // Scope session strictly to tenant schema
    await this.executor.query(`SET LOCAL search_path = "${context.schemaName}"`);

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
    this.validateSchema(context.schemaName);
    await this.executor.query(`SET LOCAL search_path = "${context.schemaName}"`);
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
