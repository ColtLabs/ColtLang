import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import type { App } from 'firebase-admin/app';
import { getOrInitializeFirebaseApp } from './firestore-adapter.js';

export interface FirebaseVerifiedUser {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  emailVerified?: boolean;
}

export interface FirebaseAuthClient {
  verifyIdToken(idToken: string): Promise<FirebaseVerifiedUser>;
  getUser(uid: string): Promise<FirebaseVerifiedUser>;
  createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string>;
}

export class FirebaseAdminAuthClient implements FirebaseAuthClient {
  private readonly auth: Auth;

  constructor(app?: App) {
    const firebaseApp = app ?? getOrInitializeFirebaseApp();
    if (!firebaseApp) {
      throw new Error('Firebase Admin App not initialized for Auth. Verify Firebase credentials in environment.');
    }
    this.auth = getAuth(firebaseApp);
  }

  async verifyIdToken(idToken: string): Promise<FirebaseVerifiedUser> {
    const decoded: DecodedIdToken = await this.auth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      displayName: typeof decoded.name === 'string' ? decoded.name : undefined,
      photoURL: typeof decoded.picture === 'string' ? decoded.picture : undefined,
      emailVerified: decoded.email_verified,
    };
  }

  async getUser(uid: string): Promise<FirebaseVerifiedUser> {
    const userRecord = await this.auth.getUser(uid);
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      emailVerified: userRecord.emailVerified,
    };
  }

  async createCustomToken(uid: string, claims?: Record<string, unknown>): Promise<string> {
    return await this.auth.createCustomToken(uid, claims);
  }
}

export class InMemoryFirebaseAuthClient implements FirebaseAuthClient {
  private readonly users = new Map<string, FirebaseVerifiedUser>();

  constructor() {
    this.users.set('mock_firebase_uid_1', {
      uid: 'mock_firebase_uid_1',
      email: 'mockuser@coltanedb.dev',
      displayName: 'Mock Firebase User',
      emailVerified: true,
    });
  }

  async verifyIdToken(idToken: string): Promise<FirebaseVerifiedUser> {
    if (idToken.startsWith('mock_fb_token_')) {
      const uid = idToken.replace('mock_fb_token_', '');
      const existing = this.users.get(uid);
      if (existing) return structuredClone(existing);
      const created: FirebaseVerifiedUser = {
        uid,
        email: `${uid}@coltanedb.dev`,
        displayName: `User ${uid}`,
        emailVerified: true,
      };
      this.users.set(uid, created);
      return created;
    }
    throw new Error('Invalid Firebase token in mock provider');
  }

  async getUser(uid: string): Promise<FirebaseVerifiedUser> {
    const user = this.users.get(uid);
    if (!user) throw new Error(`User ${uid} not found`);
    return structuredClone(user);
  }

  async createCustomToken(uid: string): Promise<string> {
    return `mock_custom_token_${uid}`;
  }
}

export function createFirebaseAuthClientFromEnv(): FirebaseAuthClient {
  try {
    const app = getOrInitializeFirebaseApp();
    if (app) {
      return new FirebaseAdminAuthClient(app);
    }
  } catch {
    return new InMemoryFirebaseAuthClient();
  }
  return new InMemoryFirebaseAuthClient();
}
