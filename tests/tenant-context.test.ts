import { describe, expect, it } from 'vitest';
import { createTenantContext, createTenantId, parseTenantId } from '../packages/tenant/src/index.js';

describe('tenant identity and namespace context', () => {
  it('generates opaque tenant ids in the required format', () => {
    const tenantId = createTenantId();

    expect(tenantId).toMatch(/^tnt_[a-z2-7]{12}$/);
  });

  it('derives schema and role names only from a validated tenant id', () => {
    const context = createTenantContext('tnt_aaaaaaaaaaaa');

    expect(context).toMatchObject({
      tenantId: 'tnt_aaaaaaaaaaaa',
      schemaName: 'ct_aaaaaaaaaaaa',
      roleName: 'ct_aaaaaaaaaaaa',
      state: 'active',
    });
  });

  it('rejects malformed and user-controlled namespace-like ids', () => {
    for (const input of ['tnt_short', 'tnt_aaaaaaaaaaa0', 'ct_aaaaaaaaaaaa', 'tnt_aaaaaaaaaaaa;DROP SCHEMA public']) {
      expect(() => parseTenantId(input)).toThrow(TypeError);
    }
  });
});