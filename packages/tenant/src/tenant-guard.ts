import type { PlanStep } from '@coltanedb/compiler';
import { createTenantContext, parseTenantId, type TenantContext } from './context.js';
import type { StoreAdapter, TenantContextResolver } from './store-adapter.js';

const writeOperations = new Set(['schema.create', 'record.put', 'record.create', 'record.delete', 'transaction']);

export class TenantAccessError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'TenantAccessError';
  }
}

export class TenantGuard {
  constructor(
    private readonly adapter: StoreAdapter,
    private readonly resolveContext: TenantContextResolver,
  ) {}

  async execute(tenantId: string, step: PlanStep, parameters?: Readonly<Record<string, unknown>>): Promise<unknown> {
    const context = await this.contextFor(tenantId);
    if (writeOperations.has(step.operation) && context.state !== 'active') {
      throw new TenantAccessError(`Tenant ${context.tenantId} is ${context.state}; writes are disabled.`, 'COLT3002');
    }
    return this.adapter.execute(step, context, parameters);
  }

  async apply(tenantId: string, change: unknown): Promise<void> {
    const context = await this.contextFor(tenantId);
    this.requireActive(context);
    return this.adapter.apply(change, context);
  }

  async rebuild(tenantId: string, collection: string): Promise<void> {
    const context = await this.contextFor(tenantId);
    this.requireActive(context);
    return this.adapter.rebuild(collection, context);
  }

  async usage(tenantId: string): Promise<{ rows: number; bytes: number }> {
    const context = await this.contextFor(tenantId);
    return this.adapter.usage(context);
  }

  private async contextFor(rawTenantId: string): Promise<TenantContext> {
    const tenantId = parseTenantId(rawTenantId);
    const resolved = await this.resolveContext(tenantId);
    if (!resolved) throw new TenantAccessError('Tenant does not exist.', 'COLT3001');
    if (resolved.tenantId !== tenantId) throw new TenantAccessError('Resolved tenant does not match request.', 'COLT3001');

    const canonical = createTenantContext(tenantId, resolved.state);
    if (resolved.schemaName !== canonical.schemaName || resolved.roleName !== canonical.roleName) {
      throw new TenantAccessError('Tenant namespace does not match its server-generated ID.', 'COLT3003');
    }
    return canonical;
  }

  private requireActive(context: TenantContext): void {
    if (context.state !== 'active') {
      throw new TenantAccessError(`Tenant ${context.tenantId} is ${context.state}; this operation is disabled.`, 'COLT3002');
    }
  }
}

export function isWritePlanStep(step: PlanStep): boolean {
  return writeOperations.has(step.operation);
}