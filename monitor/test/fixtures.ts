import type { Observation } from '../../shared/types.ts';
import type { ResolvedService } from '../config.ts';

export function service(overrides: Partial<ResolvedService> = {}): ResolvedService {
  return {
    id: 'api',
    group: 'Product',
    name: 'API',
    description: 'Test service',
    url: 'http://127.0.0.1:1/',
    expect: { status: [200] },
    intervalSec: 300,
    timeoutMs: 1000,
    degradedMs: 500,
    retries: 0,
    retryDelayMs: 0,
    failureThreshold: 2,
    ...overrides,
  };
}

/** Observation `minutes` after a fixed start, so tests read as a timeline. */
export function observation(
  level: Observation['level'],
  minutes: number,
  extra: Partial<Observation> = {},
): Observation {
  const at = new Date(Date.UTC(2026, 10, 15, 12, 0, 0) + minutes * 60_000).toISOString();
  return {
    at,
    level,
    httpStatus: level === 'down' ? 503 : 200,
    latencyMs: level === 'down' ? null : level === 'degraded' ? 900 : 120,
    error:
      level === 'up' ? null : level === 'down' ? 'unexpected status 503' : 'slow response (900 ms)',
    ...extra,
  };
}
