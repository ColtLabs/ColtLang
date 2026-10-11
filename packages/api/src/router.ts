import type {
  CreateApiKeyRequest,
  CreateProjectRequest,
  ExecuteRequest,
  SetKillSwitchRequest,
} from '../../api-types/src/index.js';
import { AuthService } from './auth.js';
import { QueryExecutionService } from './executor.js';
import { KillSwitch } from './kill-switch.js';
import { UsageTracker } from './limits.js';
import { ProjectService } from './project-service.js';

export interface ApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export class ApiRouter {
  constructor(
    readonly authService: AuthService,
    readonly projectService: ProjectService,
    readonly executionService: QueryExecutionService,
    readonly killSwitch: KillSwitch,
    readonly usageTracker: UsageTracker,
  ) {}

  async handle(req: ApiRequest): Promise<ApiResponse> {
    const { method, path, body, headers = {} } = req;

    try {
      // 1. System Status
      if (method === 'GET' && (path === '/api/v1/system/status' || path === '/healthz')) {
        return {
          status: 200,
          body: {
            healthy: true,
            killSwitch: this.killSwitch.getStatus(),
            version: '0.1.0',
          },
        };
      }

      // 2. Kill Switch admin endpoint
      if (method === 'POST' && path === '/api/v1/admin/kill-switch') {
        const payload = (body ?? {}) as SetKillSwitchRequest;
        const status = this.killSwitch.set(payload.active, payload.reason);
        return { status: 200, body: status };
      }

      // 3. Create Invite (operator)
      if (method === 'POST' && path === '/api/v1/auth/invite') {
        const payload = (body ?? {}) as { code: string; expiresInHours?: number };
        if (!payload.code) {
          return { status: 400, body: { error: 'Invite code is required.' } };
        }
        const invite = this.authService.createInvite(payload.code, payload.expiresInHours);
        return { status: 201, body: invite };
      }

      // 4. Verify Invite
      if (method === 'POST' && path === '/api/v1/auth/invite/verify') {
        const payload = (body ?? {}) as { code: string; email: string };
        if (!payload.code || !payload.email) {
          return { status: 400, body: { error: 'Code and email are required.' } };
        }
        const res = this.authService.verifyInvite(payload.code, payload.email);
        if (!res.valid) {
          return { status: 400, body: res };
        }
        return { status: 200, body: res };
      }

      // 4b. Firebase Auth / Google OAuth ID Token
      if (method === 'POST' && path === '/api/v1/auth/firebase') {
        const payload = (body ?? {}) as { idToken: string };
        if (!payload.idToken) {
          return { status: 400, body: { error: 'idToken is required.' } };
        }
        const res = await this.authService.verifyFirebaseToken(payload.idToken);
        if (!res.valid) {
          return { status: 401, body: res };
        }
        return { status: 200, body: res };
      }

      // 5. Create Project
      if (method === 'POST' && path === '/api/v1/projects') {
        const payload = (body ?? {}) as CreateProjectRequest;
        if (!payload.name || !payload.ownerId) {
          return { status: 400, body: { error: 'Name and ownerId are required.' } };
        }
        const project = await this.projectService.createProject(payload);
        return { status: 201, body: project };
      }

      // 6. Get Project
      const projectGetMatch = path.match(/^\/api\/v1\/projects\/([^/]+)$/);
      if (method === 'GET' && projectGetMatch) {
        const tenantId = projectGetMatch[1];
        const project = await this.projectService.getProject(tenantId);
        if (!project) {
          return { status: 404, body: { error: `Project ${tenantId} not found.` } };
        }
        return { status: 200, body: project };
      }

      // 7. Create API Key for Project
      const apiKeyMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/api-keys$/);
      if (method === 'POST' && apiKeyMatch) {
        const tenantId = apiKeyMatch[1];
        const payload = (body ?? {}) as CreateApiKeyRequest;
        const keyData = this.authService.createApiKey(tenantId, payload.scopes);
        return { status: 201, body: keyData };
      }

      // 8. Execute Colt Query
      const executeMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/execute$/);
      if (method === 'POST' && executeMatch) {
        const tenantId = executeMatch[1];
        const authHeader = headers['authorization'] || headers['Authorization'];

        // Require API Key or Firebase Token Authentication for execution
        if (authHeader) {
          const token = authHeader.replace(/^Bearer\s+/i, '');
          if (token.startsWith('clt_live_')) {
            const authResult = this.authService.authenticateApiKey(token);
            if (!authResult.valid) {
              return { status: 401, body: { error: `Unauthorized: ${authResult.error}` } };
            }
            if (authResult.apiKey?.tenantId !== tenantId) {
              return {
                status: 403,
                body: { error: 'Forbidden: API key does not have access to this project.' },
              };
            }
          } else {
            const firebaseAuthResult = await this.authService.verifyFirebaseToken(token);
            if (!firebaseAuthResult.valid) {
              return { status: 401, body: { error: `Unauthorized: ${firebaseAuthResult.error}` } };
            }
          }
        }

        const project = await this.projectService.getProject(tenantId);
        if (!project) {
          return { status: 404, body: { error: `Project ${tenantId} not found.` } };
        }

        const payload = (body ?? {}) as ExecuteRequest;
        const execRequest: ExecuteRequest = {
          tenantId,
          source: payload.source ?? '',
          parameters: payload.parameters,
        };

        const result = await this.executionService.execute(execRequest, project.limits);
        const statusCode = result.success ? 200 : result.errorCode === 'COLT5003' ? 503 : 400;
        return { status: statusCode, body: result };
      }

      // 9. Get Project Usage
      const usageMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/usage$/);
      if (method === 'GET' && usageMatch) {
        const tenantId = usageMatch[1];
        const daily = this.usageTracker.getDailyRequests(tenantId);
        const events = this.usageTracker.getEvents(tenantId);
        return { status: 200, body: { dailyRequests: daily, events } };
      }

      return { status: 404, body: { error: 'Not Found' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 500, body: { error: message } };
    }
  }
}
