import { createTenantContext, createTenantId, parseTenantId, type TenantContext, type TenantId, type TenantState } from './context.js';

export interface TenantRecord {
  tenantId: TenantId;
  name: string;
  ownerId: string;
  state: TenantState;
  limitsProfile: string;
  createdAt: string;
}

export interface TenantRepository {
  insert(record: TenantRecord): Promise<void>;
  find(tenantId: TenantId): Promise<TenantRecord | undefined>;
  setState(tenantId: TenantId, state: TenantState): Promise<void>;
}

export interface PrimaryTenantProvisioner {
  provision(context: TenantContext): Promise<void>;
}

export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} does not exist.`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantManager {
  constructor(
    private readonly repository: TenantRepository,
    private readonly provisioner: PrimaryTenantProvisioner,
    private readonly createId: () => TenantId = createTenantId,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async createTenant(input: { name: string; ownerId: string; limitsProfile?: string }): Promise<TenantRecord> {
    const tenantId = this.createId();
    const record: TenantRecord = {
      tenantId,
      name: input.name,
      ownerId: input.ownerId,
      state: 'provisioning',
      limitsProfile: input.limitsProfile ?? 'alpha',
      createdAt: this.now(),
    };
    await this.repository.insert(record);
    return this.resumeProvisioning(tenantId);
  }

  async resumeProvisioning(rawTenantId: string): Promise<TenantRecord> {
    const tenantId = parseTenantId(rawTenantId);
    const record = await this.requireTenant(tenantId);
    if (record.state === 'active') return record;
    if (record.state !== 'provisioning') {
      throw new Error(`Cannot provision tenant ${tenantId} while state is ${record.state}.`);
    }

    await this.provisioner.provision(createTenantContext(tenantId, record.state));
    await this.repository.setState(tenantId, 'active');
    return this.requireTenant(tenantId);
  }

  async describeTenant(rawTenantId: string): Promise<TenantRecord> {
    return this.requireTenant(parseTenantId(rawTenantId));
  }

  async suspendTenant(rawTenantId: string): Promise<TenantRecord> {
    const tenantId = parseTenantId(rawTenantId);
    const record = await this.requireTenant(tenantId);
    if (record.state !== 'active' && record.state !== 'read_only') {
      throw new Error(`Cannot suspend tenant ${tenantId} while state is ${record.state}.`);
    }
    await this.repository.setState(tenantId, 'suspended');
    return this.requireTenant(tenantId);
  }

  async resumeTenant(rawTenantId: string): Promise<TenantRecord> {
    const tenantId = parseTenantId(rawTenantId);
    const record = await this.requireTenant(tenantId);
    if (record.state !== 'suspended' && record.state !== 'read_only') {
      throw new Error(`Cannot resume tenant ${tenantId} while state is ${record.state}.`);
    }
    await this.repository.setState(tenantId, 'active');
    return this.requireTenant(tenantId);
  }

  private async requireTenant(tenantId: TenantId): Promise<TenantRecord> {
    const record = await this.repository.find(tenantId);
    if (!record) throw new TenantNotFoundError(tenantId);
    return record;
  }
}

export class InMemoryTenantRepository implements TenantRepository {
  private readonly records = new Map<TenantId, TenantRecord>();

  async insert(record: TenantRecord): Promise<void> {
    if (this.records.has(record.tenantId)) throw new Error(`Tenant ${record.tenantId} already exists.`);
    this.records.set(record.tenantId, { ...record });
  }

  async find(tenantId: TenantId): Promise<TenantRecord | undefined> {
    const record = this.records.get(tenantId);
    return record ? { ...record } : undefined;
  }

  async setState(tenantId: TenantId, state: TenantState): Promise<void> {
    const record = this.records.get(tenantId);
    if (!record) throw new TenantNotFoundError(tenantId);
    this.records.set(tenantId, { ...record, state });
  }
}