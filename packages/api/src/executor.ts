import type { ExecuteRequest, ExecuteResponse, ProjectLimits } from '../../api-types/src/index.js';
import { compile } from '../../compiler/src/index.js';
import { TenantAccessError, TenantGuard } from '../../tenant/src/index.js';
import { KillSwitch, KillSwitchError } from './kill-switch.js';
import { defaultAlphaLimits, LimitExceededError, UsageTracker } from './limits.js';

export class QueryExecutionService {
  constructor(
    private readonly guard: TenantGuard,
    private readonly killSwitch: KillSwitch,
    private readonly usageTracker: UsageTracker,
  ) {}

  async execute(
    request: ExecuteRequest,
    limits: ProjectLimits = defaultAlphaLimits,
  ): Promise<ExecuteResponse> {
    try {
      // 1. Check Global Kill Switch
      this.killSwitch.assertNotActive();

      // 2. Enforce Rate / Request Limits
      this.usageTracker.recordRequest(request.tenantId, limits);

      // 3. Compile Colt Source
      const compiled = compile(request.source);
      if (compiled.diagnostics.length > 0 || !compiled.plan) {
        return {
          success: false,
          diagnostics: compiled.diagnostics,
          error: 'Colt compilation failed with diagnostics.',
          errorCode: compiled.diagnostics[0]?.code ?? 'COLT1000',
        };
      }

      // 4. Execute Steps through TenantGuard
      const results: unknown[] = [];
      for (const step of compiled.plan.steps) {
        const stepResult = await this.guard.execute(
          request.tenantId,
          step,
          request.parameters,
        );
        results.push(stepResult);
      }

      // 5. Query tenant usage
      let usageInfo: { rows: number; bytes: number } | undefined;
      try {
        usageInfo = await this.guard.usage(request.tenantId);
      } catch {
        usageInfo = undefined;
      }

      return {
        success: true,
        data: results.length === 1 ? results[0] : results,
        plan: compiled.plan,
        diagnostics: compiled.diagnostics,
        usage: usageInfo,
      };
    } catch (err: unknown) {
      if (err instanceof KillSwitchError) {
        return {
          success: false,
          error: err.message,
          errorCode: 'COLT5003',
        };
      }
      if (err instanceof LimitExceededError) {
        return {
          success: false,
          error: err.message,
          errorCode: 'COLT4001',
        };
      }
      if (err instanceof TenantAccessError) {
        return {
          success: false,
          error: err.message,
          errorCode: err.code,
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
        errorCode: 'COLT5000',
      };
    }
  }
}
