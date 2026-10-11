import { describe, expect, it } from 'vitest';
import { createColtaneApi } from '../packages/api/src/index.js';

describe('Milestone 3 API and Access Control Suite', () => {
  it('reports healthy system status and kill switch state', async () => {
    const api = createColtaneApi();
    const res = await api.router.handle({
      method: 'GET',
      path: '/api/v1/system/status',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      healthy: true,
      killSwitch: { active: false },
      version: '0.1.0',
    });
  });

  it('enforces invite gate for project creation', async () => {
    const api = createColtaneApi();

    // 1. Try to verify an invalid invite
    const badVerify = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/invite/verify',
      body: { code: 'INVALID_CODE', email: 'alice@example.com' },
    });
    expect(badVerify.status).toBe(400);

    // 2. Operator creates invite
    const inviteRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/invite',
      body: { code: 'BETA_VIP_2026', expiresInHours: 24 },
    });
    expect(inviteRes.status).toBe(201);

    // 3. User verifies valid invite
    const goodVerify = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/invite/verify',
      body: { code: 'BETA_VIP_2026', email: 'alice@example.com' },
    });
    expect(goodVerify.status).toBe(200);
    const user = (goodVerify.body as any).user;
    expect(user).toBeDefined();
    expect(user.email).toBe('alice@example.com');

    // 4. Same invite cannot be reused
    const reuseVerify = await api.router.handle({
      method: 'POST',
      path: '/api/v1/auth/invite/verify',
      body: { code: 'BETA_VIP_2026', email: 'bob@example.com' },
    });
    expect(reuseVerify.status).toBe(400);

    // 5. User creates project with invite
    const projectRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/projects',
      body: {
        name: 'Alice First DB',
        ownerId: user.id,
      },
    });
    expect(projectRes.status).toBe(201);
    const project = projectRes.body as any;
    expect(project.tenantId).toMatch(/^tnt_[a-z2-7]{12}$/);
    expect(project.state).toBe('active');
    expect(project.limits.requestsPerDay).toBe(10000);
  });

  it('generates API keys and executes Colt queries under tenant isolation', async () => {
    const api = createColtaneApi();

    // Setup user & project
    api.authService.createInvite('INV_EXEC', 24);
    const { user } = api.authService.verifyInvite('INV_EXEC', 'carol@example.com');
    const project = await api.projectService.createProject({
      name: 'Analytics DB',
      ownerId: user!.id,
    });

    // Generate API key for Carol
    const keyRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/api-keys`,
      body: { scopes: ['read', 'write'] },
    });
    expect(keyRes.status).toBe(201);
    const { token } = keyRes.body as any;
    expect(token).toMatch(/^clt_live_[a-f0-9]{8}_[a-f0-9]{48}$/);

    // Seed some data in Carol's tenant in memory
    (api.storeAdapter as any).seed(project.tenantId, 'logs', [
      { id: '1', level: 'info', message: 'Hello Coltane' },
    ]);

    // Execute Colt query with Bearer token
    const querySource = `
DEFINE COLLECTION logs STRICT @backend(neon) {
  id: text @key,
  level: text,
  message: text
}

FIND logs SELECT id, level, message
`;

    const execRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/execute`,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        source: querySource,
      },
    });

    expect(execRes.status).toBe(200);
    const execBody = execRes.body as any;
    expect(execBody.success).toBe(true);
    expect(execBody.plan).toBeDefined();

    // Verify usage tracking
    const usageRes = await api.router.handle({
      method: 'GET',
      path: `/api/v1/projects/${project.tenantId}/usage`,
    });
    expect(usageRes.status).toBe(200);
    expect((usageRes.body as any).dailyRequests).toBe(1);
  });

  it('enforces global kill switch immediately halting execution', async () => {
    const api = createColtaneApi();

    const project = await api.projectService.createProject({
      name: 'Critical DB',
      ownerId: 'admin_1',
    });

    const keyRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/api-keys`,
      body: {},
    });
    const { token } = keyRes.body as any;

    // Activate Kill Switch
    const killRes = await api.router.handle({
      method: 'POST',
      path: '/api/v1/admin/kill-switch',
      body: { active: true, reason: 'Security maintenance' },
    });
    expect(killRes.status).toBe(200);
    expect((killRes.body as any).active).toBe(true);

    // Attempt query execution while kill switch is active
    const execRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/execute`,
      headers: { Authorization: `Bearer ${token}` },
      body: {
        source: 'DEFINE COLLECTION items { id: text @key } FIND items SELECT id',
      },
    });

    expect(execRes.status).toBe(503);
    expect((execRes.body as any).errorCode).toBe('COLT5003');

    // Deactivate kill switch
    await api.router.handle({
      method: 'POST',
      path: '/api/v1/admin/kill-switch',
      body: { active: false },
    });

    // Query should now succeed or compile cleanly
    const retryRes = await api.router.handle({
      method: 'POST',
      path: `/api/v1/projects/${project.tenantId}/execute`,
      headers: { Authorization: `Bearer ${token}` },
      body: {
        source: 'DEFINE COLLECTION items { id: text @key } FIND items SELECT id',
      },
    });
    expect(retryRes.status).toBe(200);
    expect((retryRes.body as any).success).toBe(true);
  });

  it('enforces daily request limits on project execution', async () => {
    const api = createColtaneApi();

    const project = await api.projectService.createProject({
      name: 'Limited DB',
      ownerId: 'owner_limited',
    });
    // Set artificially small limit for testing
    project.limits.requestsPerDay = 2;

    const source = 'DEFINE COLLECTION items { id: text @key } FIND items SELECT id';

    // 1st request
    const r1 = await api.executionService.execute({ tenantId: project.tenantId, source }, project.limits);
    expect(r1.success).toBe(true);

    // 2nd request
    const r2 = await api.executionService.execute({ tenantId: project.tenantId, source }, project.limits);
    expect(r2.success).toBe(true);

    // 3rd request - should exceed limit
    const r3 = await api.executionService.execute({ tenantId: project.tenantId, source }, project.limits);
    expect(r3.success).toBe(false);
    expect(r3.errorCode).toBe('COLT4001');
  });
});
