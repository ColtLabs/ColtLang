import { documentCapabilities, type Capabilities, type PlanStep } from '@coltanedb/compiler';
import { initializeApp, cert, getApps, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export function getOrInitializeFirebaseApp(): App | undefined {
  const existing = getApps();
  if (existing.length > 0 && existing[0]) {
    return existing[0];
  }

  if (typeof process.loadEnvFile === 'function') {
    try {
      if (existsSync('.env.local')) {
        process.loadEnvFile('.env.local');
      } else if (existsSync('.env')) {
        process.loadEnvFile('.env');
      }
    } catch {
      // ignore env loading errors
    }
  }

  // 1. Raw service account JSON string or Base64 in FIREBASE_SERVICE_ACCOUNT_KEY
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawKey && !rawKey.includes('replace-me')) {
    try {
      const trimmed = rawKey.trim();
      const parsed = (trimmed.startsWith('{')
        ? JSON.parse(trimmed)
        : JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'))) as ServiceAccount;
      return initializeApp({
        credential: cert(parsed),
      });
    } catch {
      // continue fallback
    }
  }

  // 2. Path to service account file in FIREBASE_SERVICE_ACCOUNT_KEY_PATH
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
  if (keyPath && existsSync(keyPath)) {
    try {
      const fileContent = readFileSync(keyPath, 'utf8');
      const parsed = JSON.parse(fileContent) as ServiceAccount;
      return initializeApp({
        credential: cert(parsed),
      });
    } catch {
      // continue fallback
    }
  }

  // 3. Discrete environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey && !projectId.includes('replace-me')) {
    try {
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch {
      // continue fallback
    }
  }

  return undefined;
}

export interface FirestoreDocumentRef {
  set(data: Record<string, unknown>): Promise<void>;
  get(): Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  delete(): Promise<void>;
}

export interface FirestoreCollectionRef {
  doc(id: string): FirestoreDocumentRef;
  get(): Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }>;
}

export interface FirestoreClient {
  collection(path: string): FirestoreCollectionRef;
}

export class InMemoryFirestoreClient implements FirestoreClient {
  private readonly docs = new Map<string, Record<string, unknown>>();

  collection(path: string): FirestoreCollectionRef {
    return {
      doc: (id: string): FirestoreDocumentRef => {
        const fullPath = `${path}/${id}`;
        return {
          set: async (data: Record<string, unknown>) => {
            this.docs.set(fullPath, structuredClone(data));
          },
          get: async () => {
            const data = this.docs.get(fullPath);
            return {
              exists: data !== undefined,
              data: () => (data ? structuredClone(data) : undefined),
            };
          },
          delete: async () => {
            this.docs.delete(fullPath);
          },
        };
      },
      get: async () => {
        const prefix = `${path}/`;
        const matched: Array<{ id: string; data: () => Record<string, unknown> }> = [];
        for (const [k, v] of this.docs.entries()) {
          if (k.startsWith(prefix)) {
            const id = k.slice(prefix.length);
            matched.push({ id, data: () => structuredClone(v) });
          }
        }
        return { docs: matched };
      },
    };
  }
}

export class FirebaseAdminFirestoreClient implements FirestoreClient {
  private readonly db: Firestore;

  constructor(app?: App) {
    const firebaseApp = app ?? getOrInitializeFirebaseApp();
    if (!firebaseApp) {
      throw new Error('Firebase Admin App failed to initialize. Verify Firebase credentials in environment.');
    }
    this.db = getFirestore(firebaseApp);
  }

  collection(path: string): FirestoreCollectionRef {
    const colRef = this.db.collection(path);
    return {
      doc: (id: string): FirestoreDocumentRef => {
        const docRef = colRef.doc(id);
        return {
          set: async (data: Record<string, unknown>) => {
            await docRef.set(data);
          },
          get: async () => {
            const snap = await docRef.get();
            return {
              exists: snap.exists,
              data: () => snap.data() as Record<string, unknown> | undefined,
            };
          },
          delete: async () => {
            await docRef.delete();
          },
        };
      },
      get: async () => {
        const snap = await colRef.get();
        return {
          docs: snap.docs.map((d) => ({
            id: d.id,
            data: () => d.data() as Record<string, unknown>,
          })),
        };
      },
    };
  }
}

export function createFirestoreClientFromEnv(): FirestoreClient {
  try {
    const app = getOrInitializeFirebaseApp();
    if (app) {
      return new FirebaseAdminFirestoreClient(app);
    }
  } catch {
    return new InMemoryFirestoreClient();
  }
  return new InMemoryFirestoreClient();
}

export class FirestoreStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly client: FirestoreClient,
    capabilities: Readonly<Capabilities> = documentCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  private collectionPath(tenantId: string, collection: string): string {
    return `tenants/${tenantId}/c/${collection}/d`;
  }

  async connect(context: TenantContext): Promise<void> {
    void context;
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    try {
      this.client.collection('healthcheck');
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
    if (step.backend !== ('firestore' as string)) {
      throw new Error(`Unsupported backend ${step.backend} for FirestoreStoreAdapter`);
    }

    const colPath = this.collectionPath(context.tenantId, step.collection);
    const colRef = this.client.collection(colPath);

    switch (step.operation) {
      case 'record.put':
      case 'record.create': {
        const id = this.resolveKey(step, parameters);
        const payload = this.resolvePayload(step, parameters);
        const docRef = colRef.doc(id);
        await docRef.set({ ...payload, id });
        return { created: true, id, record: payload };
      }

      case 'record.delete': {
        const id = this.resolveKey(step, parameters);
        const docRef = colRef.doc(id);
        await docRef.delete();
        return { deleted: 1 };
      }

      case 'query': {
        const snapshot = await colRef.get();
        return snapshot.docs.map((d) => d.data());
      }

      default:
        throw new Error(`Unsupported operation '${step.operation}' for FirestoreStoreAdapter`);
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
