import { createHash, randomBytes } from 'node:crypto';
import type { ApiKey, Invite, User } from '../../api-types/src/index.js';

import { createFirebaseAuthClientFromEnv, type FirebaseAuthClient, parseTenantId } from '../../tenant/src/index.js';

export class AuthError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export class AuthService {
  private readonly invites = new Map<string, Invite>();
  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, User>();
  private readonly apiKeys = new Map<string, ApiKey & { secretHash: string }>();
  private readonly firebaseAuth: FirebaseAuthClient;

  constructor(firebaseAuth?: FirebaseAuthClient) {
    this.firebaseAuth = firebaseAuth ?? createFirebaseAuthClientFromEnv();
  }

  async verifyFirebaseToken(idToken: string): Promise<{ valid: boolean; user?: User; error?: string }> {
    try {
      const verified = await this.firebaseAuth.verifyIdToken(idToken);
      const email = verified.email ?? `${verified.uid}@coltanedb.dev`;
      let user = this.usersByEmail.get(email) ?? this.users.get(verified.uid);
      if (!user) {
        user = {
          id: verified.uid,
          email,
          createdAt: new Date().toISOString(),
        };
        this.users.set(user.id, user);
        this.usersByEmail.set(email, user);
      }
      return { valid: true, user };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: message };
    }
  }

  createInvite(code: string, expiresInHours = 48): Invite {
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();
    const invite: Invite = {
      code,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.invites.set(code, invite);
    return invite;
  }

  verifyInvite(code: string, email: string): { valid: boolean; user?: User; error?: string } {
    const invite = this.invites.get(code);
    if (!invite) {
      return { valid: false, error: 'Invalid invite code.' };
    }
    if (invite.usedBy) {
      return { valid: false, error: 'Invite code has already been used.' };
    }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return { valid: false, error: 'Invite code has expired.' };
    }

    let user = this.usersByEmail.get(email);
    if (!user) {
      user = {
        id: randomBytes(16).toString('hex'),
        email,
        createdAt: new Date().toISOString(),
      };
      this.users.set(user.id, user);
      this.usersByEmail.set(user.email, user);
    }

    invite.usedBy = user.id;
    return { valid: true, user };
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  createApiKey(tenantId: string, scopes: string[] = ['read', 'write']): { apiKey: ApiKey; token: string } {
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(24).toString('hex');
    const token = `clt_live_${prefix}_${secret}`;
    const secretHash = hashSecret(secret);

    const keyRecord = {
      id: randomBytes(16).toString('hex'),
      tenantId: parseTenantId(tenantId),
      prefix,
      scopes,
      secretHash,
      createdAt: new Date().toISOString(),
    };

    this.apiKeys.set(prefix, keyRecord);

    const { secretHash: _, ...publicApiKey } = keyRecord;
    return { apiKey: publicApiKey, token };
  }

  authenticateApiKey(token: string): { valid: boolean; apiKey?: ApiKey; error?: string } {
    if (!token.startsWith('clt_live_')) {
      return { valid: false, error: 'Malformed API key token.' };
    }

    const parts = token.slice('clt_live_'.length).split('_');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid API key format.' };
    }

    const [prefix, secret] = parts;
    const record = this.apiKeys.get(prefix);
    if (!record) {
      return { valid: false, error: 'API key not found.' };
    }

    if (record.revokedAt) {
      return { valid: false, error: 'API key has been revoked.' };
    }

    const computedHash = hashSecret(secret);
    if (computedHash !== record.secretHash) {
      return { valid: false, error: 'Invalid API key secret.' };
    }

    record.lastUsedAt = new Date().toISOString();
    const { secretHash: _, ...publicApiKey } = record;
    return { valid: true, apiKey: publicApiKey };
  }

  revokeApiKey(prefix: string): boolean {
    const record = this.apiKeys.get(prefix);
    if (!record) return false;
    record.revokedAt = new Date().toISOString();
    return true;
  }
}
