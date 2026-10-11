import type { Capabilities, PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';

export interface StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;
  connect(context: TenantContext): Promise<void>;
  healthCheck(context: TenantContext): Promise<boolean>;
  execute(step: PlanStep, context: TenantContext, parameters?: Readonly<Record<string, unknown>>): Promise<unknown>;
  apply(change: unknown, context: TenantContext): Promise<void>;
  rebuild(collection: string, context: TenantContext): Promise<void>;
  usage(context: TenantContext): Promise<{ rows: number; bytes: number }>;
}

export type TenantContextResolver = (tenantId: string) => Promise<TenantContext | undefined>;