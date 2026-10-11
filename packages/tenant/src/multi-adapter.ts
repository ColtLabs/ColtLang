import { postgresCapabilities, type Capabilities, type PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

interface Seedable {
  seed(tenantId: string, collection: string, rows: readonly unknown[]): void;
}

function isSeedable(obj: unknown): obj is Seedable {
  return typeof obj === 'object' && obj !== null && 'seed' in obj && typeof (obj as Record<string, unknown>).seed === 'function';
}

export class MultiBackendStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;
  private readonly adapters = new Map<string, StoreAdapter>();
  private readonly defaultAdapter: StoreAdapter;

  constructor(
    defaultAdapter: StoreAdapter,
    adapters: Readonly<Record<string, StoreAdapter>> = {},
  ) {
    this.defaultAdapter = defaultAdapter;
    this.capabilities = defaultAdapter.capabilities ?? postgresCapabilities;

    for (const [backend, adapter] of Object.entries(adapters)) {
      this.adapters.set(backend, adapter);
    }
  }

  registerAdapter(backend: string, adapter: StoreAdapter): void {
    this.adapters.set(backend, adapter);
  }

  getAdapter(backend?: string): StoreAdapter {
    if (!backend) return this.defaultAdapter;
    return this.adapters.get(backend) ?? this.defaultAdapter;
  }

  async connect(context: TenantContext): Promise<void> {
    await this.defaultAdapter.connect(context);
    for (const adapter of this.adapters.values()) {
      await adapter.connect(context);
    }
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    const defaultOk = await this.defaultAdapter.healthCheck(context);
    return defaultOk;
  }

  async execute(
    step: PlanStep,
    context: TenantContext,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const adapter = this.getAdapter(step.backend);
    return adapter.execute(step, context, parameters);
  }

  async apply(change: unknown, context: TenantContext): Promise<void> {
    await this.defaultAdapter.apply(change, context);
  }

  async rebuild(collection: string, context: TenantContext): Promise<void> {
    await this.defaultAdapter.rebuild(collection, context);
  }

  async usage(context: TenantContext): Promise<{ rows: number; bytes: number }> {
    let totalRows = 0;
    let totalBytes = 0;
    for (const adapter of [this.defaultAdapter, ...this.adapters.values()]) {
      try {
        const u = await adapter.usage(context);
        totalRows += u.rows;
        totalBytes += u.bytes;
      } catch {
        // Continue aggregating other adapters
      }
    }
    return { rows: totalRows, bytes: totalBytes };
  }

  seed(tenantId: string, collection: string, rows: readonly unknown[]): void {
    if (isSeedable(this.defaultAdapter)) {
      this.defaultAdapter.seed(tenantId, collection, rows);
    }
    for (const adapter of this.adapters.values()) {
      if (isSeedable(adapter)) {
        adapter.seed(tenantId, collection, rows);
      }
    }
  }
}
