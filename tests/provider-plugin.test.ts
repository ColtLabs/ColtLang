import { describe, expect, it } from 'vitest';
import {
  ProviderRegistry,
  defaultManifests,
  postgresTypeMap,
  sqliteTypeMap,
  documentTypeMap,
  kvTypeMap,
  type ProviderPlugin,
  type StoreAdapter,
} from '../packages/tenant/src/index.ts';

describe('M2.1 Provider Plugin Framework', () => {
  it('loads default manifests for all v1.0 provider families', () => {
    const ids = defaultManifests.map((m) => m.id);
    expect(ids).toContain('neon');
    expect(ids).toContain('supabase');
    expect(ids).toContain('turso');
    expect(ids).toContain('d1');
    expect(ids).toContain('mongodb');
    expect(ids).toContain('firestore');
    expect(ids).toContain('redis');
  });

  it('maps logical types consistently per dialect family', () => {
    // Postgres family
    expect(postgresTypeMap.uuid).toBe('uuid');
    expect(postgresTypeMap.doc).toBe('jsonb');
    expect(postgresTypeMap.time).toBe('timestamp with time zone');

    // SQLite family
    expect(sqliteTypeMap.uuid).toBe('text');
    expect(sqliteTypeMap.doc).toBe('text');

    // Document family
    expect(documentTypeMap.doc).toBe('object');
    expect(documentTypeMap.list).toBe('array');

    // KV family
    expect(kvTypeMap.doc).toBe('string');
  });

  it('allows registering a new provider with only a manifest and adapter (M2.1 acceptance)', () => {
    const registry = new ProviderRegistry();

    const fakeAdapter: StoreAdapter = {
      capabilities: {
        joins: false,
        transactions: false,
        docPaths: false,
        vector: false,
        graph: false,
        timeSeries: false,
        fullText: false,
        ttl: false,
      },
      connect: async () => {},
      healthCheck: async () => true,
      execute: async () => ({ rows: [] }),
      apply: async () => {},
      rebuild: async () => {},
      usage: async () => ({ rows: 0, bytes: 0 }),
    };

    const fakePlugin: ProviderPlugin = {
      manifest: {
        id: 'fake-cloud-pg',
        name: 'Fake Cloud Postgres',
        family: 'postgres',
        capabilities: fakeAdapter.capabilities,
        isolationStrategies: ['schema-per-tenant'],
        defaultIsolation: 'schema-per-tenant',
        typeMap: postgresTypeMap,
        quotaModel: {
          storageMetric: 'bytes',
          enforcementStrategy: 'read-only-at-100',
          defaultFreeLimits: { maxStorageBytes: 1024 * 1024 },
        },
      },
      createAdapter: () => fakeAdapter,
    };

    registry.register(fakePlugin);

    expect(registry.has('fake-cloud-pg')).toBe(true);
    expect(registry.get('fake-cloud-pg')?.manifest.family).toBe('postgres');
    expect(registry.getByFamily('postgres')).toHaveLength(1);
  });

  it('enforces D8: strict in-family spillover boundary (forbids cross-family automatic spillover)', () => {
    const registry = new ProviderRegistry();

    for (const manifest of defaultManifests) {
      registry.register({
        manifest,
        createAdapter: () => ({} as StoreAdapter),
      });
    }

    // Same family (Postgres) -> Spillover allowed
    expect(registry.canSpillover('neon', 'supabase')).toBe(true);
    expect(registry.canSpillover('supabase', 'neon')).toBe(true);

    // Same family (SQLite) -> Spillover allowed
    expect(registry.canSpillover('turso', 'd1')).toBe(true);

    // Cross-family (Postgres to SQLite) -> Strictly FORBIDDEN
    expect(registry.canSpillover('neon', 'turso')).toBe(false);
    expect(registry.canSpillover('supabase', 'turso')).toBe(false);

    // Cross-family (Document to KV or Postgres) -> Strictly FORBIDDEN
    expect(registry.canSpillover('mongodb', 'redis')).toBe(false);
    expect(registry.canSpillover('firestore', 'neon')).toBe(false);
  });
});
