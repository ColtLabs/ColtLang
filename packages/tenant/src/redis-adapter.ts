import { kvCapabilities, type Capabilities, type PlanStep } from '@coltanedb/compiler';
import type { TenantContext } from './context.js';
import type { StoreAdapter } from './store-adapter.js';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, opts?: { match?: string; count?: number }): Promise<[string, string[]]>;
  exists(...keys: string[]): Promise<number>;
}

export class InMemoryRedisClient implements RedisClient {
  private readonly store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<string | null> {
    const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) deleted++;
    }
    return deleted;
  }

  async scan(cursor: string, opts?: { match?: string; count?: number }): Promise<[string, string[]]> {
    void cursor;
    void opts;
    const now = Date.now();
    const matching: string[] = [];
    const pattern = opts?.match ? new RegExp('^' + opts.match.replace(/\*/g, '.*') + '$') : null;

    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt && now > v.expiresAt) {
        this.store.delete(k);
        continue;
      }
      if (!pattern || pattern.test(k)) {
        matching.push(k);
      }
    }
    return ['0', matching];
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.has(k)) count++;
    }
    return count;
  }
}

export class UpstashRestRedisClient implements RedisClient {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command(...args: unknown[]): Promise<unknown> {
    const cleanUrl = this.url.replace(/\/+$/, '');
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`Upstash Redis HTTP error: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async get(key: string): Promise<string | null> {
    const res = await this.command('GET', key);
    return typeof res === 'string' ? res : null;
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<string | null> {
    if (opts?.ex) {
      await this.command('SET', key, value, 'EX', opts.ex);
    } else {
      await this.command('SET', key, value);
    }
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    const res = await this.command('DEL', ...keys);
    return typeof res === 'number' ? res : 0;
  }

  async scan(cursor: string, opts?: { match?: string; count?: number }): Promise<[string, string[]]> {
    const cmd: unknown[] = ['SCAN', cursor];
    if (opts?.match) cmd.push('MATCH', opts.match);
    if (opts?.count) cmd.push('COUNT', opts.count);
    const res = (await this.command(...cmd)) as [string, string[]];
    return res ?? ['0', []];
  }

  async exists(...keys: string[]): Promise<number> {
    const res = await this.command('EXISTS', ...keys);
    return typeof res === 'number' ? res : 0;
  }
}

export class RedisStoreAdapter implements StoreAdapter {
  readonly capabilities: Readonly<Capabilities>;

  constructor(
    private readonly client: RedisClient,
    capabilities: Readonly<Capabilities> = kvCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  private tenantKey(tenantId: string, rawKey: string): string {
    return `t:${tenantId}:${rawKey}`;
  }

  async connect(context: TenantContext): Promise<void> {
    void context;
  }

  async healthCheck(context: TenantContext): Promise<boolean> {
    void context;
    try {
      await this.client.exists('__healthcheck__');
      return true;
    } catch {
      return false;
    }
  }

  async execute(
    step: PlanStep,
    context: TenantContext,
    parameters?: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    if (step.backend !== ('redis' as string)) {
      throw new Error(`Unsupported backend ${step.backend} for RedisStoreAdapter`);
    }

    const keyParam = this.resolveKey(step, parameters);
    const namespacedKey = this.tenantKey(context.tenantId, `${step.collection}:${keyParam}`);

    switch (step.operation) {
      case 'record.put':
      case 'record.create': {
        const payload = this.resolvePayload(step, parameters);
        const ttlSec = this.resolveTtl(step);
        await this.client.set(namespacedKey, JSON.stringify(payload), ttlSec ? { ex: ttlSec } : undefined);
        return { created: true, record: payload };
      }

      case 'record.delete': {
        const deleted = await this.client.del(namespacedKey);
        return { deleted };
      }

      case 'query': {
        const raw = await this.client.get(namespacedKey);
        if (!raw) return [];
        try {
          return [JSON.parse(raw)];
        } catch {
          return [{ value: raw }];
        }
      }

      default:
        throw new Error(`Unsupported operation '${step.operation}' for RedisStoreAdapter`);
    }
  }

  async apply(change: unknown, context: TenantContext): Promise<void> {
    void change;
    void context;
  }

  async rebuild(collection: string, context: TenantContext): Promise<void> {
    void collection;
    void context;
  }

  async usage(context: TenantContext): Promise<{ rows: number; bytes: number }> {
    const [, keys] = await this.client.scan('0', { match: `t:${context.tenantId}:*` });
    return { rows: keys.length, bytes: keys.length * 128 };
  }

  private resolveKey(step: PlanStep, parameters?: Readonly<Record<string, unknown>>): string {
    const paramBinding = step.params?.find((p) => p.name === 'id' || p.name === 'key');
    if (paramBinding?.name && parameters?.[paramBinding.name] !== undefined) {
      return String(parameters[paramBinding.name]);
    }
    if (paramBinding?.value !== undefined) {
      return String(paramBinding.value);
    }
    return 'default';
  }

  private resolvePayload(step: PlanStep, parameters?: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const binding of step.params ?? []) {
      if (binding.kind === 'parameter' && binding.name && parameters?.[binding.name] !== undefined) {
        result[binding.name] = parameters[binding.name];
      } else if (binding.value !== undefined) {
        result[binding.name ?? 'val'] = binding.value;
      }
    }
    return result;
  }

  private resolveTtl(step: PlanStep): number | undefined {
    const ttlBinding = step.params?.find((p) => p.name === 'ttl');
    if (typeof ttlBinding?.value === 'number') {
      return ttlBinding.value;
    }
    return undefined;
  }
}
