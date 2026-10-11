import type { KillSwitchStatus } from '../../api-types/src/index.js';

export class KillSwitchError extends Error {
  constructor(message = 'Global kill switch is active. Database execution is temporarily disabled.') {
    super(message);
    this.name = 'KillSwitchError';
  }
}

export class KillSwitch {
  private active = false;
  private reason?: string;
  private activatedAt?: string;

  constructor(initialActive = false) {
    this.active = initialActive;
    if (initialActive) {
      this.activatedAt = new Date().toISOString();
      this.reason = 'Emergency maintenance';
    }
  }

  getStatus(): KillSwitchStatus {
    return {
      active: this.active,
      reason: this.reason,
      activatedAt: this.activatedAt,
    };
  }

  set(active: boolean, reason?: string): KillSwitchStatus {
    this.active = active;
    this.reason = reason;
    this.activatedAt = active ? new Date().toISOString() : undefined;
    return this.getStatus();
  }

  assertNotActive(): void {
    if (this.active) {
      throw new KillSwitchError(
        `Global kill switch is active: ${this.reason || 'All database operations halted.'}`,
      );
    }
  }
}
