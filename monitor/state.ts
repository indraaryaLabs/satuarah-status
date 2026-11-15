import type {
  DayStat,
  Incident,
  Level,
  MonitorState,
  Observation,
  Sample,
  ServiceState,
} from '../shared/types.ts';

const DAY_MS = 86_400_000;
export const DAY_RETENTION = 100;
export const INCIDENT_RETENTION_DAYS = 90;
export const SAMPLE_WINDOW_MS = DAY_MS;

export type MonitorEvent =
  | { type: 'opened'; incident: Incident }
  | { type: 'escalated'; incident: Incident }
  | { type: 'resolved'; incident: Incident };

export function emptyState(): MonitorState {
  return { version: 1, services: {}, incidents: [] };
}

function emptyServiceState(): ServiceState {
  return {
    level: 'unknown',
    badStreak: 0,
    downStreak: 0,
    streakStartedAt: null,
    lastObservation: null,
    days: {},
    samples: [],
  };
}

export function parseState(raw: unknown): MonitorState {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { version?: unknown }).version !== 1 ||
    typeof (raw as { services?: unknown }).services !== 'object' ||
    !Array.isArray((raw as { incidents?: unknown }).incidents)
  ) {
    throw new Error('state file has an unknown shape');
  }
  return raw as MonitorState;
}

/** True when the service has not been checked for at least its interval (minus cron jitter). */
export function isDue(
  state: MonitorState,
  serviceId: string,
  intervalSec: number,
  now: Date,
  toleranceMs = 45_000,
): boolean {
  const last = state.services[serviceId]?.lastObservation;
  if (!last) return true;
  return now.getTime() - Date.parse(last.at) >= intervalSec * 1000 - toleranceMs;
}

const rank: Record<Level, 0 | 1 | 2> = { up: 0, degraded: 1, down: 2 };

function count(day: DayStat, observation: Observation): void {
  day[observation.level] += 1;
  if (observation.level !== 'down' && observation.latencyMs !== null) {
    day.latencySum += observation.latencyMs;
    day.latencyCount += 1;
  }
}

/**
 * The level shown to visitors. Recovery is immediate, but a failure only counts once it has
 * repeated `threshold` times in a row, so one slow or dropped check never flips the page.
 */
export function publishedLevel(
  previous: ServiceState['level'],
  observed: Level,
  badStreak: number,
  downStreak: number,
  threshold: number,
): ServiceState['level'] {
  if (observed === 'up') return 'up';
  if (downStreak >= threshold) return 'down';
  if (badStreak >= threshold) return 'degraded';
  return previous === 'unknown' ? observed : previous;
}

function incidentId(serviceId: string, startedAt: string): string {
  return `${serviceId}-${startedAt.replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** Folds one observation into the state and reports incident transitions. */
export function applyObservation(
  state: MonitorState,
  service: { id: string; failureThreshold: number },
  observation: Observation,
): MonitorEvent[] {
  const events: MonitorEvent[] = [];
  const current = (state.services[service.id] ??= emptyServiceState());

  const dayKey = observation.at.slice(0, 10);
  const day = (current.days[dayKey] ??= {
    up: 0,
    degraded: 0,
    down: 0,
    latencySum: 0,
    latencyCount: 0,
  });
  count(day, observation);

  const sample: Sample = [
    Math.floor(Date.parse(observation.at) / 1000),
    observation.level === 'down' || observation.latencyMs === null ? -1 : observation.latencyMs,
    rank[observation.level],
  ];
  current.samples.push(sample);
  const cutoff = Math.floor((Date.parse(observation.at) - SAMPLE_WINDOW_MS) / 1000);
  current.samples = current.samples.filter((entry) => entry[0] > cutoff);

  if (observation.level === 'up') {
    current.badStreak = 0;
    current.downStreak = 0;
    current.streakStartedAt = null;
  } else {
    current.badStreak += 1;
    current.streakStartedAt ??= observation.at;
    current.downStreak = observation.level === 'down' ? current.downStreak + 1 : 0;
  }

  current.level = publishedLevel(
    current.level,
    observation.level,
    current.badStreak,
    current.downStreak,
    service.failureThreshold,
  );
  current.lastObservation = observation;

  const open = state.incidents.find((i) => i.serviceId === service.id && i.resolvedAt === null);

  if (observation.level === 'up') {
    if (open) {
      open.resolvedAt = observation.at;
      events.push({ type: 'resolved', incident: open });
    }
    return events;
  }

  if (open) {
    open.lastError = observation.error;
    if (open.severity === 'degraded' && current.downStreak >= service.failureThreshold) {
      open.severity = 'down';
      events.push({ type: 'escalated', incident: open });
    }
    return events;
  }

  if (current.badStreak >= service.failureThreshold) {
    const startedAt = current.streakStartedAt ?? observation.at;
    const incident: Incident = {
      id: incidentId(service.id, startedAt),
      serviceId: service.id,
      severity: current.downStreak >= service.failureThreshold ? 'down' : 'degraded',
      startedAt,
      resolvedAt: null,
      lastError: observation.error,
      issueNumber: null,
    };
    state.incidents.push(incident);
    events.push({ type: 'opened', incident });
  }
  return events;
}

/** Drops data older than the retention windows. Open incidents are always kept. */
export function prune(state: MonitorState, now: Date): void {
  const oldestDay = new Date(now.getTime() - DAY_RETENTION * DAY_MS).toISOString().slice(0, 10);
  for (const service of Object.values(state.services)) {
    for (const key of Object.keys(service.days)) {
      if (key < oldestDay) delete service.days[key];
    }
  }
  const oldestIncident = now.getTime() - INCIDENT_RETENTION_DAYS * DAY_MS;
  state.incidents = state.incidents.filter(
    (incident) => incident.resolvedAt === null || Date.parse(incident.resolvedAt) >= oldestIncident,
  );
}
