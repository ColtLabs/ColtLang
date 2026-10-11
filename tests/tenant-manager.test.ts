import { describe, expect, it } from 'vitest';
import { createTenantContext } from '../packages/tenant/src/context.js';
import { InMemoryTenantRepository, TenantManager } from '../packages/tenant/src/index.js';

describe('TenantManager', () => {
  it('stores provisioning state before creating the primary namespace and activates on success', async () => {
    const repository = new InMemoryTenantRepository();
    const seenStates: string[] = [];
    const manager = new TenantManager(repository, {
      async provision(context) {
        seenStates.push(context.state);
      },
    }, () => createTenantContext('tnt_aaaaaaaaaaaa').tenantId, () => '2026-10-01T00:00:00.000Z');

    const tenant = await manager.createTenant({ name: 'Project', ownerId: 'usr_1' });

    expect(seenStates).toEqual(['provisioning']);
    expect(tenant).toMatchObject({ tenantId: 'tnt_aaaaaaaaaaaa', state: 'active', limitsProfile: 'alpha' });
    await expect(manager.describeTenant(tenant.tenantId)).resolves.toEqual(tenant);
  });

  it('leaves failed provisioning resumable and does not claim activation', async () => {
    const repository = new InMemoryTenantRepository();
    const tenantId = createTenantContext('tnt_bbbbbbbbbbbb').tenantId;
    let fail = true;
    const manager = new TenantManager(repository, {
      async provision() {
        if (fail) throw new Error('temporary provisioning failure');
      },
    }, () => tenantId);

    await expect(manager.createTenant({ name: 'Retry me', ownerId: 'usr_1' })).rejects.toThrow('temporary provisioning failure');
    await expect(manager.describeTenant(tenantId)).resolves.toMatchObject({ state: 'provisioning' });
    fail = false;
    await expect(manager.resumeProvisioning(tenantId)).resolves.toMatchObject({ state: 'active' });
  });

  it('suspends and resumes only valid lifecycle states', async () => {
    const repository = new InMemoryTenantRepository();
    const tenantId = createTenantContext('tnt_cccccccccccc').tenantId;
    const manager = new TenantManager(repository, { async provision() {} }, () => tenantId);
    const tenant = await manager.createTenant({ name: 'Project', ownerId: 'usr_1' });

    await expect(manager.suspendTenant(tenant.tenantId)).resolves.toMatchObject({ state: 'suspended' });
    await expect(manager.resumeTenant(tenant.tenantId)).resolves.toMatchObject({ state: 'active' });
  });
});