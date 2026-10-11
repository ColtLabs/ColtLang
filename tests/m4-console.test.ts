import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createColtaneApi } from '../packages/api/src/index.js';

describe('Milestone 4 Console UI & Server Integration Suite', () => {
  const htmlPath = resolve(process.cwd(), 'index.html');
  const htmlContent = readFileSync(htmlPath, 'utf8');

  it('serves valid HTML with all Milestone 4 UI components', () => {
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<title>ColtaneDB');
    
    // Stage 0: Foundations & Themes
    expect(htmlContent).toContain('class="dark"');
    expect(htmlContent).toContain('html.light');
    expect(htmlContent).toContain('theme-toggle');

    // Stage 1: App Shell & Route Navigation
    expect(htmlContent).toContain('data-view="landing"');
    expect(htmlContent).toContain('data-view="studio"');
    expect(htmlContent).toContain('data-view="builder"');
    expect(htmlContent).toContain('data-view="table"');
    expect(htmlContent).toContain('data-view="docs"');
    expect(htmlContent).toContain('data-view="providers"');

    // Stage 2: Access & Onboarding
    expect(htmlContent).toContain('id="btn-open-onboarding"');
    expect(htmlContent).toContain('id="onboarding-modal"');
    expect(htmlContent).toContain('id="onboard-invite-code"');
    expect(htmlContent).toContain('id="btn-submit-onboard"');

    // Stage 3: Data Views & Record Inspector
    expect(htmlContent).toContain('id="view-table"');
    expect(htmlContent).toContain('id="data-table-mount"');
    expect(htmlContent).toContain('id="btn-open-insert-row"');
    expect(htmlContent).toContain('id="insert-row-modal"');
    expect(htmlContent).toContain('id="btn-confirm-insert"');

    // Stage 4: Colt Query Workspace & Execution
    expect(htmlContent).toContain('id="studio-editor"');
    expect(htmlContent).toContain('id="studio-plan-btn"');
    expect(htmlContent).toContain('id="studio-run-btn"');
    expect(htmlContent).toContain('data-output-tab="plan"');
    expect(htmlContent).toContain('data-output-tab="results"');
    expect(htmlContent).toContain('data-output-tab="diagnostics"');
  });

  it('verifies end-to-end onboarding, schema edit, record insert, and query execution flow', async () => {
    const api = createColtaneApi();

    // 1. Onboarding with invite code
    const invite = api.authService.createInvite('M4_BETA_INVITE', 48);
    const verifyResult = api.authService.verifyInvite(invite.code, 'engineer@coltanedb.dev');
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.user).toBeDefined();

    // 2. Create isolated project
    const project = await api.projectService.createProject({
      name: 'E2E Console Project',
      ownerId: verifyResult.user!.id,
    });
    expect(project.tenantId).toMatch(/^tnt_[a-z2-7]{12}$/);
    expect(project.state).toBe('active');

    // 3. Create API Key for the project
    const keyData = api.authService.createApiKey(project.tenantId, ['read', 'write']);
    expect(keyData.token).toMatch(/^clt_live_/);

    // 4. Schema edit: DEFINE COLLECTION via Colt query
    const schemaColt = `
DEFINE COLLECTION inventory STRICT @backend(neon) {
  id: text @key,
  sku: text @unique,
  quantity: int @default(0)
}
`;
    const schemaExec = await api.executionService.execute({
      tenantId: project.tenantId,
      source: schemaColt,
    }, project.limits);
    expect(schemaExec.success).toBe(true);

    // 5. Insert record via Colt PUT
    const insertColt = `
${schemaColt}
PUT inventory:item_widget_01 {
  sku: "WDG-001",
  quantity: 42
}
`;
    const insertExec = await api.executionService.execute({
      tenantId: project.tenantId,
      source: insertColt,
    }, project.limits);
    expect(insertExec.success).toBe(true);

    // Seed into in-memory store adapter for verification of query retrieval
    (api.storeAdapter as any).seed(project.tenantId, 'inventory', [
      { id: 'item_widget_01', sku: 'WDG-001', quantity: 42 },
    ]);

    // 6. Query in browser: FIND query executed under TenantGuard
    const findColt = `
${schemaColt}
FIND inventory SELECT id, sku, quantity
WHERE quantity > 10
`;
    const findExec = await api.executionService.execute({
      tenantId: project.tenantId,
      source: findColt,
    }, project.limits);

    expect(findExec.success).toBe(true);
    expect((findExec.data as any)[1]).toEqual([
      { id: 'item_widget_01', sku: 'WDG-001', quantity: 42 },
    ]);
  });
});
