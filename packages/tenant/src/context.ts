import { randomBytes } from 'node:crypto';

const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
const tenantIdPattern = /^tnt_[a-z2-7]{12}$/;

export type TenantId = string & { readonly __tenantId: unique symbol };
export type TenantState = 'provisioning' | 'active' | 'read_only' | 'suspended' | 'deleting' | 'deleted';

export interface TenantContext {
  tenantId: TenantId;
  schemaName: string;
  roleName: string;
  state: TenantState;
}

export function createTenantId(): TenantId {
  const random = randomBytes(12);
  const suffix = Array.from(random, (byte) => alphabet[byte & 31]).join('');
  return `tnt_${suffix}` as TenantId;
}

export function parseTenantId(value: string): TenantId {
  if (!tenantIdPattern.test(value)) {
    throw new TypeError('Invalid tenant id. Expected tnt_ followed by 12 lowercase base32 characters.');
  }
  return value as TenantId;
}

export function createTenantContext(tenantId: string, state: TenantState = 'active'): TenantContext {
  const parsed = parseTenantId(tenantId);
  const namespaceSuffix = parsed.slice(4);
  return {
    tenantId: parsed,
    schemaName: `ct_${namespaceSuffix}`,
    roleName: `ct_${namespaceSuffix}`,
    state,
  };
}