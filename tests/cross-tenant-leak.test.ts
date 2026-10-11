import { describe, expect, it } from 'vitest';
import { compile, postgresCapabilities } from '../packages/compiler/src/index.js';
import {
  createTenantContext,
  InMemorySqlExecutor,
  InMemoryStoreAdapter,
  NeonStoreAdapter,
  TenantAccessError,
  TenantGuard,
} from '../packages/tenant/src/index.js';

describe('Cross-Tenant Leak Prevention Suite (M2)', () => {
  it('prevents cross-tenant read leaks in InMemoryStoreAdapter', async () => {
    const tenantA = createTenantContext('tnt_aaaaaaaaaaaa');
    const tenantB = createTenantContext('tnt_bbbbbbbbbbbb');

    const adapter = new InMemoryStoreAdapter(postgresCapabilities);
    adapter.seed(tenantA.tenantId, 'customers', [
      { id: '1', secret: 'tenant_a_secret' },
    ]);
    adapter.seed(tenantB.tenantId, 'customers', [
      { id: '2', secret: 'tenant_b_secret' },
    ]);

    const contextMap = new Map([
      [tenantA.tenantId, tenantA],
      [tenantB.tenantId, tenantB],
    ]);
    const guard = new TenantGuard(adapter, async (id) => contextMap.get(id as any));

    const queryPlan = {
      backend: 'neon' as const,
      operation: 'query' as const,
      collection: 'customers',
      parameterizedStatement: 'SELECT * FROM "customers"',
      params: [],
      span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 1, line: 1, column: 2 } },
    };

    const resA = (await guard.execute(tenantA.tenantId, queryPlan)) as any[];
    const resB = (await guard.execute(tenantB.tenantId, queryPlan)) as any[];

    expect(resA).toEqual([{ id: '1', secret: 'tenant_a_secret' }]);
    expect(resB).toEqual([{ id: '2', secret: 'tenant_b_secret' }]);
    expect(resA).not.toEqual(resB);
  });

  it('prevents cross-tenant write interference and verifies schema separation with NeonStoreAdapter', async () => {
    const tenantA = createTenantContext('tnt_aaaaaaaaaaaa');
    const tenantB = createTenantContext('tnt_bbbbbbbbbbbb');

    const sqlExecutor = new InMemorySqlExecutor();
    const adapter = new NeonStoreAdapter(sqlExecutor);

    const contextMap = new Map([
      [tenantA.tenantId, tenantA],
      [tenantB.tenantId, tenantB],
    ]);
    const guard = new TenantGuard(adapter, async (id) => contextMap.get(id as any));

    // Connect & initialize schemas
    await adapter.connect(tenantA);
    await adapter.connect(tenantB);

    // Tenant A inserts a record
    const insertPlanA = {
      backend: 'neon' as const,
      operation: 'record.put' as const,
      collection: 'orders',
      parameterizedStatement: 'INSERT INTO "orders" ("id", "amount") VALUES ($1, $2)',
      params: [
        { kind: 'constant' as const, value: 'ord_1' },
        { kind: 'constant' as const, value: 100 },
      ],
      span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 1, line: 1, column: 2 } },
    };

    await guard.execute(tenantA.tenantId, insertPlanA);

    // Tenant B queries 'orders' - should be empty
    const queryPlanB = {
      backend: 'neon' as const,
      operation: 'query' as const,
      collection: 'orders',
      parameterizedStatement: 'SELECT * FROM "orders"',
      params: [],
      span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 1, line: 1, column: 2 } },
    };

    const ordersB = (await guard.execute(tenantB.tenantId, queryPlanB)) as any[];
    expect(ordersB).toHaveLength(0);

    // Tenant A queries 'orders' - should see their record
    const ordersA = (await guard.execute(tenantA.tenantId, queryPlanB)) as any[];
    expect(ordersA).toHaveLength(1);
    expect(ordersA[0]).toEqual({ id: 'ord_1', amount: 100 });
  });

  it('compiles Colt code and executes securely within tenant boundary without leaks', async () => {
    const tenant1 = createTenantContext('tnt_222222222222');
    const tenant2 = createTenantContext('tnt_333333333333');

    const source = `
DEFINE COLLECTION notes STRICT @backend(neon) {
  id: text @key,
  content: text
}

FIND notes SELECT id, content
`;

    const compiled = compile(source);
    expect(compiled.diagnostics).toHaveLength(0);
    expect(compiled.plan).toBeDefined();

    const findStep = compiled.plan!.steps.find((s) => s.operation === 'query')!;
    expect(findStep).toBeDefined();

    const adapter = new InMemoryStoreAdapter(postgresCapabilities);
    adapter.seed(tenant1.tenantId, 'notes', [{ id: 'n1', content: 'Secret Note for Tenant 1' }]);
    adapter.seed(tenant2.tenantId, 'notes', [{ id: 'n2', content: 'Public Note for Tenant 2' }]);

    const guard = new TenantGuard(adapter, async (id) => {
      if (id === tenant1.tenantId) return tenant1;
      if (id === tenant2.tenantId) return tenant2;
      return undefined;
    });

    const notes1 = (await guard.execute(tenant1.tenantId, findStep)) as any[];
    const notes2 = (await guard.execute(tenant2.tenantId, findStep)) as any[];

    expect(notes1).toEqual([{ id: 'n1', content: 'Secret Note for Tenant 1' }]);
    expect(notes2).toEqual([{ id: 'n2', content: 'Public Note for Tenant 2' }]);
  });

  it('rejects cross-tenant data access when state is suspended or deleting', async () => {
    const suspended = createTenantContext('tnt_ssssssssssss', 'suspended');
    const adapter = new InMemoryStoreAdapter(postgresCapabilities);
    const guard = new TenantGuard(adapter, async () => suspended);

    const writeStep = {
      backend: 'neon' as const,
      operation: 'record.put' as const,
      collection: 'items',
      parameterizedStatement: 'INSERT INTO "items" VALUES (1)',
      params: [],
      span: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 1, line: 1, column: 2 } },
    };

    await expect(guard.execute(suspended.tenantId, writeStep)).rejects.toThrow(TenantAccessError);
  });
});
