/**
 * Contracts shared by the monitor (writes them) and the status page (reads them).
 * Keep this file free of runtime code so both sides can import it without side effects.
 */

/** Result of one observation, or the published state of a service. */
export type Level = 'up' | 'degraded' | 'down';

export interface ExpectSpec {
  /** Accepted HTTP status codes. */
  status: number[];
  /** Substring the response body must contain. */
  bodyIncludes?: string;
}

export interface Defaults {
  /** Minimum seconds between two checks of the same service. */
  intervalSec: number;
  timeoutMs: number;
  /** A successful response slower than this is "degraded". */
  degradedMs: number;
  /** Extra attempts inside one run before an observation is recorded as down. */
  retries: number;
  retryDelayMs: number;
  /** Consecutive bad observations (across runs) before the published level changes. */
  failureThreshold: number;
}

/** Display text for a language other than English. */
export interface ServiceText {
  name: string;
  description: string;
  /** Full name used in sentences such as "API PickFrame is not responding". */
  label?: string;
}

export interface ServiceConfig extends Partial<Omit<Defaults, 'failureThreshold' | 'retries'>> {
  id: string;
  group: string;
  name: string;
  description: string;
  url: string;
  /** Full English name for sentences; defaults to "<group> <name>". */
  label?: string;
  translations?: { id?: ServiceText };
  /** Link shown on the page when the service is something a visitor can open. */
  href?: string;
  expect: ExpectSpec;
  /** Repo-relative path of the runbook for this service. */
  runbook?: string;
}

export interface MonitorConfig {
  site: { title: string; repository: string };
  defaults: Defaults;
  services: ServiceConfig[];
}

/** One check against one service, before any smoothing. */
export interface Observation {
  at: string;
  level: Level;
  httpStatus: number | null;
  latencyMs: number | null;
  error: string | null;
}

/** Per-day counters (UTC day). Everything the page needs is derived from these. */
export interface DayStat {
  up: number;
  degraded: number;
  down: number;
  latencySum: number;
  latencyCount: number;
}

/** [epoch seconds, latency in ms or -1 when there was none, level 0=up 1=degraded 2=down] */
export type Sample = [at: number, latencyMs: number, level: 0 | 1 | 2];

export interface Incident {
  id: string;
  serviceId: string;
  /** Worst level reached during the incident. */
  severity: 'degraded' | 'down';
  startedAt: string;
  resolvedAt: string | null;
  /** Most recent error text, shown to people who open the incident. */
  lastError: string | null;
  /** GitHub issue number used for notifications, when one was created. */
  issueNumber: number | null;
}

export interface ServiceState {
  level: Level | 'unknown';
  /** Consecutive observations that were not "up". */
  badStreak: number;
  /** Consecutive observations that were "down". */
  downStreak: number;
  /** When the current bad streak began, so an incident starts at the first failure. */
  streakStartedAt: string | null;
  lastObservation: Observation | null;
  days: Record<string, DayStat>;
  samples: Sample[];
}

/** Private working state, persisted between runs on the data branch. */
export interface MonitorState {
  version: 1;
  services: Record<string, ServiceState>;
  incidents: Incident[];
}

/* ------------------------------------------------------------------ public output */

export type OverallLevel = 'operational' | 'degraded' | 'outage' | 'unknown';

export interface PublicDay {
  date: string;
  up: number;
  degraded: number;
  down: number;
  avgMs: number | null;
}

export interface PublicService {
  id: string;
  group: string;
  name: string;
  description: string;
  label: string;
  translations: { id?: ServiceText } | null;
  href: string | null;
  runbook: string | null;
  level: Level | 'unknown';
  lastCheckedAt: string | null;
  latencyMs: number | null;
  error: string | null;
  /** Availability as a percentage, floored to two decimals; null when nothing was measured. */
  uptime: { d1: number | null; d7: number | null; d30: number | null; d90: number | null };
  p50: number | null;
  p95: number | null;
  /** Oldest first, exactly 90 entries. */
  days: PublicDay[];
  samples: Sample[];
}

export interface PublicIncident extends Incident {
  durationSec: number | null;
}

export interface PublicStatus {
  schemaVersion: 1;
  generatedAt: string;
  title: string;
  repository: string;
  intervalSec: number;
  overall: OverallLevel;
  services: PublicService[];
  incidents: PublicIncident[];
}
