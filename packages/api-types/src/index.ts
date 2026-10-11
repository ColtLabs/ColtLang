import type { CompilerDiagnostic, ExecutionPlan } from '../../compiler/src/index.js';
import type { TenantId, TenantState } from '../../tenant/src/index.js';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Invite {
  code: string;
  expiresAt: string;
  usedBy?: string;
  createdAt: string;
}

export interface VerifyInviteRequest {
  code: string;
  email: string;
}

export interface VerifyInviteResponse {
  valid: boolean;
  user?: User;
  error?: string;
}

export interface ApiKey {
  id: string;
  tenantId: TenantId;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CreateApiKeyRequest {
  tenantId: string;
  scopes?: string[];
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  token: string;
}

export interface ProjectLimits {
  storageBytes: number;
  rowCount: number;
  requestsPerDay: number;
  maxFileBytes: number;
  maxConnections: number;
  functionsEnabled: boolean;
}

export interface Project {
  tenantId: TenantId;
  name: string;
  ownerId: string;
  state: TenantState;
  limitsProfile: string;
  limits: ProjectLimits;
  createdAt: string;
}

export interface CreateProjectRequest {
  name: string;
  ownerId: string;
  inviteCode?: string;
  limitsProfile?: string;
}

export interface ExecuteRequest {
  tenantId: string;
  source: string;
  parameters?: Record<string, unknown>;
}

export interface ExecuteResponse {
  success: boolean;
  data?: unknown;
  plan?: ExecutionPlan;
  diagnostics?: CompilerDiagnostic[];
  usage?: {
    rows: number;
    bytes: number;
  };
  error?: string;
  errorCode?: string;
}

export interface KillSwitchStatus {
  active: boolean;
  reason?: string;
  activatedAt?: string;
}

export interface SetKillSwitchRequest {
  active: boolean;
  reason?: string;
}

export interface UsageEvent {
  tenantId: string;
  backend: string;
  metric: 'storage_bytes' | 'row_count' | 'request' | 'job';
  amount: number;
  recordedAt: string;
}