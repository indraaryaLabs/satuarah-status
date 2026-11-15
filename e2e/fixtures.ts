import { readFileSync } from 'node:fs';
import type { Observation, PublicStatus } from '../shared/types.ts';
import { resolveConfig } from '../monitor/config.ts';
import { buildPublicStatus } from '../monitor/publish.ts';
import { applyObservation, emptyState } from '../monitor/state.ts';

/** 15:00 in Makassar. Tests freeze the browser clock two minutes after the data was produced. */
export const NOW = new Date('2026-11-15T07:00:00Z');
export const DATA_URL_PATTERN = 'https://raw.githubusercontent.com/**/status.json*';

const config = resolveConfig(JSON.parse(readFileSync('config/services.json', 'utf8')));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Scenario = 'operational' | 'degraded' | 'outage' | 'fresh' | 'stale';

/** Small deterministic generator so every run draws the same history. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const baseMs: Record<string, number> = {
  'pickframe-web': 180,
  'pickframe-api': 140,
  'pickframe-data': 320,
  'pickframe-select': 210,
  portfolio: 160,
};

function observe(id: string, at: number, level: Observation['level'], jitter: number): Observation {
  const base = baseMs[id] ?? 200;
  const latencyMs =
    level === 'down'
      ? null
      : level === 'degraded'
        ? 2600 + Math.round(jitter * 900)
        : Math.round(base + (jitter - 0.5) * base * 0.6);
  return {
    at: new Date(at).toISOString(),
    level,
    httpStatus: level === 'down' ? 503 : 200,
    latencyMs,
    error:
      level === 'down'
        ? 'unexpected status 503'
        : level === 'degraded'
          ? `slow response (${latencyMs} ms)`
          : null,
  };
}

/** Level of a service at a moment in the scripted history. */
function levelAt(id: string, at: number, end: number, scenario: Scenario): Observation['level'] {
  const ago = end - at;
  if (id === 'pickframe-api' && ago > 12 * DAY - 14 * HOUR && ago < 12 * DAY - 12.8 * HOUR)
    return 'down';
  if (id === 'pickframe-api' && ago > 5 * DAY && ago < 5 * DAY + 0.9 * HOUR) return 'degraded';
  if (id === 'pickframe-web' && ago > 20 * DAY && ago < 20 * DAY + HOUR) return 'degraded';
  if (scenario === 'degraded' && id === 'pickframe-api' && ago < 15 * 60_000) return 'degraded';
  if (scenario === 'outage' && id === 'pickframe-data' && ago < 50 * 60_000) return 'down';
  return 'up';
}

export function buildStatus(scenario: Scenario): PublicStatus {
  const end = scenario === 'stale' ? NOW.getTime() - 2 * HOUR : NOW.getTime() - 60_000;
  const state = emptyState();
  if (scenario !== 'fresh') {
    const rnd = random(7);
    const start = end - 45 * DAY;
    for (const service of config.services) {
      for (
        let at = start;
        at <= end;
        at += at > end - DAY ? service.intervalSec * 1000 : 30 * 60_000
      ) {
        const level = levelAt(service.id, at, end, scenario);
        applyObservation(state, service, observe(service.id, at, level, rnd()));
      }
    }
  }
  return buildPublicStatus(config, state, new Date(end));
}
