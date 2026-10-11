import { describe, expect, it } from 'vitest';
import { postgresCapabilities } from '../packages/compiler/src/index.js';
import { createTenantContext, InMemoryStoreAdapter, TenantAccessError, TenantGuard } from '../packages/tenant/src/index.js';

const readPlan = {
  backend: 'neon' as const,
  operation: 'query' as const,
  collection: 'users',
  parameterizedStatement: 'SELECT * FROM "users"',
  params: [],
  span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 1, line: 1, column: 2 } },
};

describe('TenantGuard', () => {
  it('scopes the same collection name to the requested tenant', async () => {
    const first = createTenantContext('tnt_aaaaaaaaaaaa');
    const second = createTenantContext('tnt_bbbbbbbbbbbb');
    const adapter = new InMemoryStoreAdapter(postgresCapabilities);
    adapter.seed(first.tenantId, 'users', [{ name: 'tenant A' }]);
    adapter.seed(second.tenantId, 'users', [{ name: 'tenant B' }]);
    const contexts = new Map([[first.tenantId, first], [second.tenantId, second]]);
    const guard = new TenantGuard(adapter, async (tenantId) => contexts.get(tenantId as typeof first.tenantId));

    await expect(guard.execute(first.tenantId, readPlan)).resolves.toEqual([{ name: 'tenant A' }]);
    await expect(guard.execute(second.tenantId, readPlan)).resolves.toEqual([{ name: 'tenant B' }]);
  });

  it('rejects malformed IDs and does not resolve context for them', async () => {
    let resolverCalls = 0;
    const guard = new TenantGuard(new InMemoryStoreAdapter(postgresCapabilities), async () => {
      resolverCalls += 1;
      return undefined;
    });

    await expect(guard.execute('ct_public', readPlan)).rejects.toThrow(TypeError);
    expect(resolverCalls).toBe(0);
  });

  it('rejects forged schema or role names from the context resolver', async () => {
    const context = { ...createTenantContext('tnt_aaaaaaaaaaaa'), schemaName: 'public' };
    const guard = new TenantGuard(new InMemoryStoreAdapter(postgresCapabilities), async () => context);

    await expect(guard.execute(context.tenantId, readPlan)).rejects.toMatchObject({ code: 'COLT3003' });
  });

  it('allows reads but blocks writes for suspended tenants', async () => {
    const context = createTenantContext('tnt_aaaaaaaaaaaa', 'read_only');
    const adapter = new InMemoryStoreAdapter(postgresCapabilities);
    const guard = new TenantGuard(adapter, async () => context);
    const writePlan = { ...readPlan, operation: 'record.put' as const };

    await expect(guard.execute(context.tenantId, readPlan)).resolves.toEqual([]);
    await expect(guard.execute(context.tenantId, writePlan)).rejects.toBeInstanceOf(TenantAccessError);
  });
});