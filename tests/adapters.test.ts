import { describe, expect, it } from 'vitest';
import {
  createTenantContext,
  InMemoryRedisClient,
  RedisStoreAdapter,
  InMemoryLibsqlClient,
  TursoStoreAdapter,
  InMemorySqlExecutor,
  SupabaseStoreAdapter,
  InMemoryMongoDatabase,
  MongoStoreAdapter,
  InMemoryFirestoreClient,
  FirestoreStoreAdapter,
} from '../packages/tenant/src/index.ts';

const span = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

describe('Multi-Provider Tenant Isolation Adapters', () => {
  const tenantA = createTenantContext('tnt_aaaabbbb2222', 'active');
  const tenantB = createTenantContext('tnt_bbbbcccc3333', 'active');

  describe('RedisStoreAdapter (KV Family)', () => {
    it('isolates keys with t:{tid}: prefix and prevents cross-tenant access', async () => {
      const client = new InMemoryRedisClient();
      const adapter = new RedisStoreAdapter(client);

      // Tenant A stores session
      await adapter.execute(
        {
          backend: 'redis' as any,
          operation: 'record.put',
          collection: 'session',
          params: [
            { kind: 'parameter', name: 'id', value: 'sess_123' },
            { kind: 'parameter', name: 'token', value: 'secret-a' },
          ],
          span,
        },
        tenantA,
        { id: 'sess_123', token: 'secret-a' },
      );

      // Verify namespaced key in client
      const rawA = await client.get('t:tnt_aaaabbbb2222:session:sess_123');
      expect(rawA).not.toBeNull();
      expect(JSON.parse(rawA!)).toMatchObject({ token: 'secret-a' });

      // Tenant B queries the same key name -> must get empty result
      const queryB = await adapter.execute(
        {
          backend: 'redis' as any,
          operation: 'query',
          collection: 'session',
          params: [{ kind: 'parameter', name: 'id', value: 'sess_123' }],
          span,
        },
        tenantB,
        { id: 'sess_123' },
      );
      expect(queryB).toEqual([]);
    });
  });

  describe('TursoStoreAdapter (SQLite Family)', () => {
    it('injects _tid to isolate queries and records across tenants', async () => {
      const client = new InMemoryLibsqlClient();
      const adapter = new TursoStoreAdapter(client);

      // Insert record for Tenant A
      await adapter.execute(
        {
          backend: 'turso' as any,
          operation: 'record.create',
          collection: 'users',
          parameterizedStatement: 'INSERT INTO "users" (id, email) VALUES (?, ?)',
          params: [
            { kind: 'parameter', name: 'id', value: 'u1' },
            { kind: 'parameter', name: 'email', value: 'a@example.com' },
          ],
          span,
        },
        tenantA,
        { id: 'u1', email: 'a@example.com' },
      );

      // Query for Tenant A -> finds record
      const rowsA = (await adapter.execute(
        {
          backend: 'turso' as any,
          operation: 'query',
          collection: 'users',
          parameterizedStatement: 'SELECT id, email FROM "users"',
          params: [],
          span,
        },
        tenantA,
      )) as any[];
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]).toMatchObject({ id: 'u1', email: 'a@example.com', _tid: 'tnt_aaaabbbb2222' });

      // Query for Tenant B -> receives zero rows
      const rowsB = (await adapter.execute(
        {
          backend: 'turso' as any,
          operation: 'query',
          collection: 'users',
          parameterizedStatement: 'SELECT id, email FROM "users"',
          params: [],
          span,
        },
        tenantB,
      )) as any[];
      expect(rowsB).toHaveLength(0);
    });
  });

  describe('SupabaseStoreAdapter (Postgres Family Safety)', () => {
    it('enforces schema-per-tenant ct_<tid> and forbids queries targeting public', async () => {
      const executor = new InMemorySqlExecutor();
      const adapter = new SupabaseStoreAdapter(executor);

      // Valid execution inside tenant schema
      const result = await adapter.execute(
        {
          backend: 'supabase',
          operation: 'query',
          collection: 'users',
          parameterizedStatement: 'SELECT id FROM "users"',
          params: [],
          span,
        },
        tenantA,
      );
      expect(result).toBeDefined();

      // Query attempting to target public schema directly -> must throw
      await expect(
        adapter.execute(
          {
            backend: 'supabase',
            operation: 'query',
            collection: 'users',
            parameterizedStatement: 'SELECT * FROM public.existing_prod_table',
            params: [],
            span,
          },
          tenantA,
        ),
      ).rejects.toThrow(/public/i);
    });
  });

  describe('MongoStoreAdapter (Document Family)', () => {
    it('injects _tid into documents and queries to prevent cross-tenant reading', async () => {
      const db = new InMemoryMongoDatabase();
      const adapter = new MongoStoreAdapter(db);

      // Tenant A inserts document
      await adapter.execute(
        {
          backend: 'mongodb' as any,
          operation: 'record.create',
          collection: 'profiles',
          params: [
            { kind: 'parameter', name: 'id', value: 'p1' },
            { kind: 'parameter', name: 'bio', value: 'Hello from Tenant A' },
          ],
          span,
        },
        tenantA,
        { id: 'p1', bio: 'Hello from Tenant A' },
      );

      // Query as Tenant A
      const resA = (await adapter.execute(
        {
          backend: 'mongodb' as any,
          operation: 'query',
          collection: 'profiles',
          params: [],
          span,
        },
        tenantA,
      )) as any[];
      expect(resA).toHaveLength(1);
      expect(resA[0].bio).toBe('Hello from Tenant A');

      // Query as Tenant B -> cannot see Tenant A's document
      const resB = (await adapter.execute(
        {
          backend: 'mongodb' as any,
          operation: 'query',
          collection: 'profiles',
          params: [],
          span,
        },
        tenantB,
      )) as any[];
      expect(resB).toHaveLength(0);
    });
  });

  describe('FirestoreStoreAdapter (Document Family)', () => {
    it('isolates collections in path tenants/{tid}/c/{collection}/d/{id}', async () => {
      const client = new InMemoryFirestoreClient();
      const adapter = new FirestoreStoreAdapter(client);

      // Tenant A writes document
      await adapter.execute(
        {
          backend: 'firestore' as any,
          operation: 'record.put',
          collection: 'items',
          params: [
            { kind: 'parameter', name: 'id', value: 'item_1' },
            { kind: 'parameter', name: 'title', value: 'Tenant A Item' },
          ],
          span,
        },
        tenantA,
        { id: 'item_1', title: 'Tenant A Item' },
      );

      // Direct inspection of Firestore path
      const docA = await client.collection('tenants/tnt_aaaabbbb2222/c/items/d').doc('item_1').get();
      expect(docA.exists).toBe(true);
      expect(docA.data()?.title).toBe('Tenant A Item');

      // Tenant B reads items -> receives empty list
      const resB = (await adapter.execute(
        {
          backend: 'firestore' as any,
          operation: 'query',
          collection: 'items',
          params: [],
          span,
        },
        tenantB,
      )) as any[];
      expect(resB).toHaveLength(0);
    });
  });
});
