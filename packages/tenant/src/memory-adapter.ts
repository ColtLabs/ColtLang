import type { Capabilities, PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export class InMemoryStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;
  private readonly rows = new Map<string, Map<string, unknown[]>>();

  constructor(capabilities: Readonly<Capabilities>) {
    this.capabilities = capabilities;
  }

  async connect(context: TenantContext): Promise<void> {
    void context;
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    return true;
  }

  async execute(step: PlanStep, context: TenantContext): Promise<unknown> {
    const collections = this.rows.get(context.tenantId);
    const rows = collections?.get(step.collection) ?? [];
    if (step.operation === 'query') return structuredClone(rows);
    return { rows: structuredClone(rows), affected: 0 };
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
    const collections = this.rows.get(context.tenantId);
    const rows = [...(collections?.values() ?? [])].flat();
    return { rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(rows)) };
  }

  seed(tenantId: string, collection: string, rows: readonly unknown[]): void {
    const collections = this.rows.get(tenantId) ?? new Map<string, unknown[]>();
    collections.set(collection, structuredClone([...rows]));
    this.rows.set(tenantId, collections);
  }
}