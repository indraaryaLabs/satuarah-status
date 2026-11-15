import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config.ts';
import { availability, buildPublicStatus, percentile, PUBLIC_DAYS } from '../publish.ts';
import { applyObservation, emptyState } from '../state.ts';
import { observation } from './fixtures.ts';

const config = resolveConfig({
  site: { title: 'Status', repository: 'owner/repo' },
  defaults: {
    intervalSec: 300,
    timeoutMs: 10000,
    degradedMs: 2000,
    retries: 0,
    retryDelayMs: 0,
    failureThreshold: 2,
  },
  services: [
    {
      id: 'api',
      group: 'Product',
      name: 'API',
      description: 'd',
      url: 'https://example.com/',
      expect: { status: [200] },
    },
    {
      id: 'web',
      group: 'Product',
      name: 'Web',
      description: 'd',
      url: 'https://example.org/',
      expect: { status: [200] },
    },
  ],
});
const now = new Date(Date.UTC(2026, 10, 15, 13, 0, 0));

describe('availability', () => {
  it('is null without data', () => expect(availability(0, 0, 0)).toBeNull());
  it('floors instead of rounding so a failure never shows as 100%', () => {
    expect(availability(2999, 0, 1)).toBe(99.96);
    expect(availability(9999, 0, 1)).toBe(99.99);
  });
  it('counts degraded checks as available', () => expect(availability(8, 2, 0)).toBe(100));
  it('handles a full outage', () => expect(availability(0, 0, 5)).toBe(0));
});

describe('percentile', () => {
  it('uses nearest-rank on sorted values', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('buildPublicStatus', () => {
  const state = emptyState();
  for (let i = 0; i < 12; i += 1)
    applyObservation(state, { id: 'api', failureThreshold: 2 }, observation('up', i * 5));
  applyObservation(state, { id: 'api', failureThreshold: 2 }, observation('down', 60));
  applyObservation(state, { id: 'api', failureThreshold: 2 }, observation('down', 65));
  const status = buildPublicStatus(config, state, now);
  const api = status.services.find((s) => s.id === 'api')!;
  const web = status.services.find((s) => s.id === 'web')!;

  it('lists every configured service in order', () => {
    expect(status.services.map((s) => s.id)).toEqual(['api', 'web']);
  });

  it('always returns exactly 90 days ending today', () => {
    expect(api.days).toHaveLength(PUBLIC_DAYS);
    expect(api.days.at(-1)?.date).toBe('2026-11-15');
    expect(api.days.at(-1)).toMatchObject({ up: 12, down: 2, degraded: 0, avgMs: 120 });
    expect(api.days[0]?.date).toBe('2026-08-18');
  });

  it('computes availability windows and latency percentiles', () => {
    expect(api.uptime.d1).toBe(85.71);
    expect(api.uptime.d90).toBe(85.71);
    expect(api.p50).toBe(120);
    expect(api.p95).toBe(120);
  });

  it('marks a service that was never checked as unknown with empty history', () => {
    expect(web).toMatchObject({ level: 'unknown', lastCheckedAt: null, latencyMs: null });
    expect(web.uptime.d30).toBeNull();
    expect(web.days.every((day) => day.up + day.down + day.degraded === 0)).toBe(true);
  });

  it('is an outage overall when any known service is down', () => {
    expect(status.overall).toBe('outage');
    expect(api.level).toBe('down');
    expect(api.latencyMs).toBeNull();
  });

  it('includes the open incident with no duration yet', () => {
    expect(status.incidents).toHaveLength(1);
    expect(status.incidents[0]).toMatchObject({
      serviceId: 'api',
      resolvedAt: null,
      durationSec: null,
    });
  });

  it('is operational when everything answered', () => {
    const healthy = emptyState();
    applyObservation(healthy, { id: 'api', failureThreshold: 2 }, observation('up', 0));
    applyObservation(healthy, { id: 'web', failureThreshold: 2 }, observation('up', 0));
    expect(buildPublicStatus(config, healthy, now).overall).toBe('operational');
  });

  it('is unknown before the first run', () => {
    expect(buildPublicStatus(config, emptyState(), now).overall).toBe('unknown');
  });
});
