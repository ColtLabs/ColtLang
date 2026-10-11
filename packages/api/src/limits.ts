import type { ProjectLimits, UsageEvent } from '../../api-types/src/index.js';

export class LimitExceededError extends Error {
  constructor(message: string, readonly metric: string, readonly limit: number) {
    super(message);
    this.name = 'LimitExceededError';
  }
}

export const defaultAlphaLimits: ProjectLimits = {
  storageBytes: 52428800, // 50 MB
  rowCount: 10000,
  requestsPerDay: 10000,
  maxFileBytes: 5242880, // 5 MB
  maxConnections: 5,
  functionsEnabled: false,
};

export class UsageTracker {
  private readonly dailyRequests = new Map<string, { count: number; date: string }>();
  private readonly events: UsageEvent[] = [];

  recordRequest(tenantId: string, limits: ProjectLimits = defaultAlphaLimits): void {
    const today = new Date().toISOString().slice(0, 10);
    const current = this.dailyRequests.get(tenantId);

    if (!current || current.date !== today) {
      this.dailyRequests.set(tenantId, { count: 1, date: today });
      return;
    }

    if (current.count >= limits.requestsPerDay) {
      throw new LimitExceededError(
        `Tenant ${tenantId} exceeded daily request limit of ${limits.requestsPerDay}`,
        'requests_per_day',
        limits.requestsPerDay,
      );
    }

    current.count += 1;
    this.events.push({
      tenantId,
      backend: 'neon',
      metric: 'request',
      amount: 1,
      recordedAt: new Date().toISOString(),
    });
  }

  getDailyRequests(tenantId: string): number {
    const today = new Date().toISOString().slice(0, 10);
    const current = this.dailyRequests.get(tenantId);
    if (!current || current.date !== today) return 0;
    return current.count;
  }

  getEvents(tenantId: string): UsageEvent[] {
    return this.events.filter((e) => e.tenantId === tenantId);
  }
}
