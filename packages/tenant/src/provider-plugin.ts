import type { Capabilities } from '@coltanedb/compiler';
import {
  postgresCapabilities,
  sqliteCapabilities,
  documentCapabilities,
  kvCapabilities,
} from '@coltanedb/compiler';
import type { StoreAdapter } from './store-adapter.js';

export type ProviderFamily = 'postgres' | 'sqlite' | 'document' | 'kv' | 'object';

export type IsolationStrategy =
  | 'schema-per-tenant'
  | 'column-tid'
  | 'prefix'
  | 'path'
  | 'database-per-tenant';

export type LogicalType =
  | 'uuid'
  | 'text'
  | 'int'
  | 'float'
  | 'bool'
  | 'time'
  | 'duration'
  | 'doc'
  | 'list'
  | 'link'
  | 'vector';

export type LogicalTypeMap = Readonly<Record<LogicalType, string>>;

export interface ProviderQuotaLimits {
  readonly maxStorageBytes?: number;
  readonly maxRows?: number;
  readonly maxRequestsPerDay?: number;
  readonly maxConnections?: number;
}

export interface ProviderQuotaModel {
  readonly storageMetric: 'bytes' | 'row_count' | 'document_count' | 'keys';
  readonly enforcementStrategy: 'read-only-at-100' | 'throttle' | 'reject-writes';
  readonly defaultFreeLimits: ProviderQuotaLimits;
}

export interface ProviderManifest {
  readonly id: string;
  readonly name: string;
  readonly family: ProviderFamily;
  readonly capabilities: Readonly<Capabilities>;
  readonly isolationStrategies: readonly IsolationStrategy[];
  readonly defaultIsolation: IsolationStrategy;
  readonly typeMap: LogicalTypeMap;
  readonly quotaModel: ProviderQuotaModel;
}

export interface ProviderPlugin {
  readonly manifest: ProviderManifest;
  createAdapter(options?: Readonly<Record<string, unknown>>): StoreAdapter;
}

export const postgresTypeMap: LogicalTypeMap = Object.freeze({
  uuid: 'uuid',
  text: 'text',
  int: 'integer',
  float: 'double precision',
  bool: 'boolean',
  time: 'timestamp with time zone',
  duration: 'interval',
  doc: 'jsonb',
  list: 'jsonb',
  link: 'uuid',
  vector: 'vector(1536)',
});

export const sqliteTypeMap: LogicalTypeMap = Object.freeze({
  uuid: 'text',
  text: 'text',
  int: 'integer',
  float: 'real',
  bool: 'integer',
  time: 'text',
  duration: 'text',
  doc: 'text',
  list: 'text',
  link: 'text',
  vector: 'blob',
});

export const documentTypeMap: LogicalTypeMap = Object.freeze({
  uuid: 'string',
  text: 'string',
  int: 'int',
  float: 'double',
  bool: 'bool',
  time: 'date',
  duration: 'string',
  doc: 'object',
  list: 'array',
  link: 'string',
  vector: 'array',
});

export const kvTypeMap: LogicalTypeMap = Object.freeze({
  uuid: 'string',
  text: 'string',
  int: 'string',
  float: 'string',
  bool: 'string',
  time: 'string',
  duration: 'string',
  doc: 'string',
  list: 'string',
  link: 'string',
  vector: 'string',
});

export const objectTypeMap: LogicalTypeMap = Object.freeze({
  uuid: 'string',
  text: 'string',
  int: 'string',
  float: 'string',
  bool: 'string',
  time: 'string',
  duration: 'string',
  doc: 'string',
  list: 'string',
  link: 'string',
  vector: 'string',
});

export const defaultManifests: readonly ProviderManifest[] = Object.freeze([
  {
    id: 'neon',
    name: 'Neon Postgres',
    family: 'postgres',
    capabilities: postgresCapabilities,
    isolationStrategies: ['schema-per-tenant'],
    defaultIsolation: 'schema-per-tenant',
    typeMap: postgresTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxStorageBytes: 500 * 1024 * 1024, maxRequestsPerDay: 100000 },
    },
  },
  {
    id: 'supabase',
    name: 'Supabase Postgres',
    family: 'postgres',
    capabilities: postgresCapabilities,
    isolationStrategies: ['schema-per-tenant'],
    defaultIsolation: 'schema-per-tenant',
    typeMap: postgresTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxStorageBytes: 500 * 1024 * 1024, maxRequestsPerDay: 100000 },
    },
  },
  {
    id: 'turso',
    name: 'Turso libSQL',
    family: 'sqlite',
    capabilities: sqliteCapabilities,
    isolationStrategies: ['column-tid', 'database-per-tenant'],
    defaultIsolation: 'column-tid',
    typeMap: sqliteTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxStorageBytes: 250 * 1024 * 1024, maxRequestsPerDay: 50000 },
    },
  },
  {
    id: 'd1',
    name: 'Cloudflare D1',
    family: 'sqlite',
    capabilities: sqliteCapabilities,
    isolationStrategies: ['column-tid'],
    defaultIsolation: 'column-tid',
    typeMap: sqliteTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxStorageBytes: 500 * 1024 * 1024, maxRequestsPerDay: 100000 },
    },
  },
  {
    id: 'mongodb',
    name: 'MongoDB Atlas',
    family: 'document',
    capabilities: documentCapabilities,
    isolationStrategies: ['column-tid'],
    defaultIsolation: 'column-tid',
    typeMap: documentTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxStorageBytes: 512 * 1024 * 1024, maxRequestsPerDay: 50000 },
    },
  },
  {
    id: 'firestore',
    name: 'Firebase Firestore',
    family: 'document',
    capabilities: documentCapabilities,
    isolationStrategies: ['path'],
    defaultIsolation: 'path',
    typeMap: documentTypeMap,
    quotaModel: {
      storageMetric: 'document_count',
      enforcementStrategy: 'read-only-at-100',
      defaultFreeLimits: { maxRows: 50000, maxRequestsPerDay: 20000 },
    },
  },
  {
    id: 'redis',
    name: 'Upstash Redis',
    family: 'kv',
    capabilities: kvCapabilities,
    isolationStrategies: ['prefix'],
    defaultIsolation: 'prefix',
    typeMap: kvTypeMap,
    quotaModel: {
      storageMetric: 'bytes',
      enforcementStrategy: 'reject-writes',
      defaultFreeLimits: { maxStorageBytes: 256 * 1024 * 1024, maxRequestsPerDay: 10000 },
    },
  },
]);

export class ProviderRegistry {
  private readonly plugins = new Map<string, ProviderPlugin>();

  register(plugin: ProviderPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Provider plugin '${plugin.manifest.id}' is already registered.`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
  }

  get(id: string): ProviderPlugin | undefined {
    return this.plugins.get(id);
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  list(): readonly ProviderPlugin[] {
    return Array.from(this.plugins.values());
  }

  getByFamily(family: ProviderFamily): readonly ProviderPlugin[] {
    return this.list().filter((p) => p.manifest.family === family);
  }

  canSpillover(sourceProviderId: string, targetProviderId: string): boolean {
    const source = this.plugins.get(sourceProviderId);
    const target = this.plugins.get(targetProviderId);
    if (!source || !target) return false;
    // Strict D8 boundary: Spillover is permitted ONLY within the same dialect family
    return source.manifest.family === target.manifest.family;
  }
}
