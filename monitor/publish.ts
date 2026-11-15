import type {
  DayStat,
  Level,
  MonitorState,
  OverallLevel,
  PublicDay,
  PublicIncident,
  PublicService,
  PublicStatus,
  Sample,
} from '../shared/types.ts';
import type { ResolvedConfig } from './config.ts';

const DAY_MS = 86_400_000;
export const PUBLIC_DAYS = 90;

/**
 * Percentage floored to two decimals, so 99.996 shows as 99.99 and never rounds up to 100.00
 * while a failure exists. Degraded checks count as available: the service answered.
 */
export function availability(up: number, degraded: number, down: number): number | null {
  const total = up + degraded + down;
  if (total === 0) return null;
  return Math.floor(((up + degraded) * 10_000) / total) / 100;
}

function window(days: PublicDay[], length: number): number | null {
  const slice = days.slice(-length);
  const sum = slice.reduce(
    (acc, day) => ({
      up: acc.up + day.up,
      degraded: acc.degraded + day.degraded,
      down: acc.down + day.down,
    }),
    { up: 0, degraded: 0, down: 0 },
  );
  return availability(sum.up, sum.degraded, sum.down);
}

export function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

function buildDays(stats: Record<string, DayStat>, now: Date): PublicDay[] {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: PublicDay[] = [];
  for (let offset = PUBLIC_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(midnight - offset * DAY_MS).toISOString().slice(0, 10);
    const stat = stats[date];
    days.push({
      date,
      up: stat?.up ?? 0,
      degraded: stat?.degraded ?? 0,
      down: stat?.down ?? 0,
      avgMs: stat && stat.latencyCount > 0 ? Math.round(stat.latencySum / stat.latencyCount) : null,
    });
  }
  return days;
}

function last24h(samples: Sample[], now: Date) {
  const cutoff = Math.floor((now.getTime() - DAY_MS) / 1000);
  const recent = samples.filter((sample) => sample[0] > cutoff);
  const up = recent.filter((s) => s[2] === 0).length;
  const degraded = recent.filter((s) => s[2] === 1).length;
  const down = recent.filter((s) => s[2] === 2).length;
  const latencies = recent
    .filter((s) => s[2] !== 2 && s[1] >= 0)
    .map((s) => s[1])
    .sort((a, b) => a - b);
  return {
    recent,
    uptime: availability(up, degraded, down),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
  };
}

function overall(levels: Array<Level | 'unknown'>): OverallLevel {
  const known = levels.filter((level) => level !== 'unknown');
  if (known.length === 0) return 'unknown';
  if (known.includes('down')) return 'outage';
  if (known.includes('degraded')) return 'degraded';
  return 'operational';
}

/** Turns private working state into the compact document the status page reads. */
export function buildPublicStatus(
  config: ResolvedConfig,
  state: MonitorState,
  now: Date,
): PublicStatus {
  const services: PublicService[] = config.services.map((service) => {
    const current = state.services[service.id];
    const days = buildDays(current?.days ?? {}, now);
    const day = last24h(current?.samples ?? [], now);
    const observation = current?.lastObservation ?? null;
    return {
      id: service.id,
      group: service.group,
      name: service.name,
      description: service.description,
      label: service.label ?? `${service.group} ${service.name}`,
      translations: service.translations ?? null,
      href: service.href ?? null,
      runbook: service.runbook ?? null,
      level: current?.level ?? 'unknown',
      lastCheckedAt: observation?.at ?? null,
      latencyMs: observation?.level === 'down' ? null : (observation?.latencyMs ?? null),
      error: observation?.error ?? null,
      uptime: {
        d1: day.uptime,
        d7: window(days, 7),
        d30: window(days, 30),
        d90: window(days, 90),
      },
      p50: day.p50,
      p95: day.p95,
      days,
      samples: day.recent,
    };
  });

  const known = new Set(config.services.map((service) => service.id));
  const incidents: PublicIncident[] = state.incidents
    .filter((incident) => known.has(incident.serviceId))
    .map((incident) => ({
      ...incident,
      durationSec:
        incident.resolvedAt === null
          ? null
          : Math.max(
              0,
              Math.round((Date.parse(incident.resolvedAt) - Date.parse(incident.startedAt)) / 1000),
            ),
    }))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    title: config.site.title,
    repository: config.site.repository,
    intervalSec: config.defaults.intervalSec,
    overall: overall(services.map((service) => service.level)),
    services,
    incidents,
  };
}
