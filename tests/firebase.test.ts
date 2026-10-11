import { describe, expect, it } from 'vitest';
import {
  createColtaneApi,
} from '../packages/api/src/index.ts';
import {
  createFirebaseAuthClientFromEnv,
  createFirestoreClientFromEnv,
  createTenantContext,
  FirebaseAdminAuthClient,
  FirebaseAdminFirestoreClient,
  FirestoreStoreAdapter,
  InMemoryFirebaseAuthClient,
  InMemoryFirestoreClient,
} from '../packages/tenant/src/index.ts';

const span = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

describe('Firebase Firestore & Auth Integration', () => {
  it('creates Firestore and Auth clients from environment or falls back cleanly to memory', () => {
    const firestoreClient = createFirestoreClientFromEnv();
    expect(firestoreClient).toBeDefined();

    const authClient = createFirebaseAuthClientFromEnv();
    expect(authClient).toBeDefined();

    expect(typeof FirebaseAdminAuthClient).toBe('function');
    expect(typeof FirebaseAdminFirestoreClient).toBe('function');
  });

  it('verifies InMemoryFirebaseAuthClient tokens and profile fetch', async () => {
    const client = new InMemoryFirebaseAuthClient();
    const verified = await client.verifyIdToken('mock_fb_token_user_alpha');
    expect(verified.uid).toBe('user_alpha');
    expect(verified.email).toBe('user_alpha@coltanedb.dev');

    const profile = await client.getUser('mock_firebase_uid_1');
    expect(profile.uid).toBe('mock_firebase_uid_1');
    expect(profile.email).toBe('mockuser@coltanedb.dev');
  });

  it('wires Firebase Auth into Coltane API and handles /api/v1/auth/firebase endpoint', async () => {
    const mockAuthClient = new InMemoryFirebaseAuthClient();
    const api = createColtaneApi({
      firebaseAuthClient: mockAuthClient,
      firestoreClient: new InMemoryFirestoreClient(),
    });

    // 1. Authenticate with Firebase ID token
    const authRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/firebase',
      body: { idToken: 'mock_fb_token_google_dev_42' },
    });

    expect(authRes.status).toBe(200);
    const body = authRes.body as { valid: boolean; user?: { id: string; email: string } };
    expect(body.valid).toBe(true);
    expect(body.user?.id).toBe('google_dev_42');
    expect(body.user?.email).toBe('google_dev_42@coltanedb.dev');

    // 2. Reject missing idToken
    const badRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/firebase',
      body: {},
    });
    expect(badRes.status).toBe(400);

    // 3. Create project for the authenticated Firebase user
    const projectRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/projects',
      body: {
        name: 'Firebase Test Project',
        ownerId: body.user!.id,
      },
    });
    expect(projectRes.status).toBe(201);
    const project = projectRes.body as { tenantId: string };

    // 4. Execute query with Bearer Firebase ID token
    const execRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/execute`,
      headers: {
        authorization: 'Bearer mock_fb_token_google_dev_42',
      },
      body: {
        source: 'DEFINE COLLECTION items STRICT { id: uuid @key, name: text }',
      },
    });
    expect(execRes.status).toBe(200);
  });

  it('stores and retrieves data via FirestoreStoreAdapter with path-based multi-tenancy', async () => {
    const client = new InMemoryFirestoreClient();
    const adapter = new FirestoreStoreAdapter(client);
    const tenantCtx = createTenantContext('tnt_fbtenant2222', 'active');

    // Put record
    await adapter.execute(
      {
        backend: 'firestore' as any,
        operation: 'record.put',
        collection: 'logs',
        params: [
          { kind: 'parameter', name: 'id', value: 'log_01' },
          { kind: 'parameter', name: 'message', value: 'Server initialized' },
        ],
        span,
      },
      tenantCtx,
      { id: 'log_01', message: 'Server initialized' },
    );

    // Query records
    const records = (await adapter.execute(
      {
        backend: 'firestore' as any,
        operation: 'query',
        collection: 'logs',
        params: [],
        span,
      },
      tenantCtx,
    )) as Array<Record<string, unknown>>;

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'log_01', message: 'Server initialized' });
  });
});
