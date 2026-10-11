import { documentCapabilities, type Capabilities, type PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export interface MongoCollection {
  find(filter: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

export interface MongoDatabase {
  collection(name: string): MongoCollection;
}

export class InMemoryMongoDatabase implements MongoDatabase {
  private readonly collections = new Map<string, Record<string, unknown>[]>();

  collection(name: string): MongoCollection {
    if (!this.collections.has(name)) {
      this.collections.set(name, []);
    }
    const docs = this.collections.get(name)!;

    return {
      find: async (filter: Record<string, unknown>) => {
        return docs.filter((doc) => {
          for (const [k, v] of Object.entries(filter)) {
            if (doc[k] !== v) return false;
          }
          return true;
        });
      },
      insertOne: async (doc: Record<string, unknown>) => {
        const copy = structuredClone(doc);
        docs.push(copy);
        return { insertedId: copy.id ?? copy._id ?? String(docs.length) };
      },
      deleteOne: async (filter: Record<string, unknown>) => {
        const initialLen = docs.length;
        const remaining = docs.filter((doc) => {
          for (const [k, v] of Object.entries(filter)) {
            if (doc[k] === v) return false;
          }
          return true;
        });
        this.collections.set(name, remaining);
        return { deletedCount: initialLen - remaining.length };
      },
    };
  }
}

export class MongoStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly db: MongoDatabase,
    capabilities: Readonly<Capabilities> = documentCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  async connect(context: TenantContext): Promise<void> {
    void context;
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    try {
      this.db.collection('system.health');
      return true;
    } catch {
      return false;
    }
  }

  async execute(
    step: PlanStep,
    context: TenantContext,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    if (step.backend !== ('mongodb' as string)) {
      throw new Error(`Unsupported backend ${step.backend} for MongoStoreAdapter`);
    }

    const coll = this.db.collection(step.collection);

    switch (step.operation) {
      case 'record.put':
      case 'record.create': {
        const payload = this.resolvePayload(step, parameters);
        // TenantGuard isolation: inject _tid
        const docWithTenant = {
          ...payload,
          _tid: context.tenantId,
          _coll: step.collection,
        };
        const res = await coll.insertOne(docWithTenant);
        return { created: true, id: res.insertedId, record: docWithTenant };
      }

      case 'record.delete': {
        const id = this.resolveKey(step, parameters);
        // Scoped to tenantId
        const filter = { id, _tid: context.tenantId };
        const res = await coll.deleteOne(filter);
        return { deleted: res.deletedCount };
      }

      case 'query': {
        // Enforce tenant scoping in all queries
        const filter: Record<string, unknown> = { _tid: context.tenantId };
        const results = await coll.find(filter);
        return results;
      }

      default:
        throw new Error(`Unsupported operation '${step.operation}' for MongoStoreAdapter`);
    }
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
    void context;
    return { rows: 0, bytes: 0 };
  }

  private resolveKey(step: PlanStep, parameters?: Readonly<Record<string, unknown>>): string {
    const paramBinding = step.params?.find((p) => p.name === 'id' || p.name === 'key');
    if (paramBinding?.name && parameters?.[paramBinding.name] !== undefined) {
      return String(parameters[paramBinding.name]);
    }
    if (paramBinding?.value !== undefined) {
      return String(paramBinding.value);
    }
    return 'default';
  }

  private resolvePayload(step: PlanStep, parameters?: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const binding of step.params ?? []) {
      if (binding.kind === 'parameter' && binding.name && parameters?.[binding.name] !== undefined) {
        result[binding.name] = parameters[binding.name];
      } else if (binding.value !== undefined) {
        result[binding.name ?? 'val'] = binding.value;
      }
    }
    return result;
  }
}
