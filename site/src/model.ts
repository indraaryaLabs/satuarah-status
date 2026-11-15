import type { Level, PublicDay, PublicService, PublicStatus } from '../../shared/types.ts';

export type DayTone = 'none' | 'ok' | 'minor' | 'major';

/**
 * How a day is drawn. Any failed or slow check makes the day at least "minor", and a day that
 * lost more than 1% of its checks is "major" (about 15 minutes of a 24 hour day).
 */
export function dayTone(day: PublicDay): DayTone {
  const total = day.up + day.degraded + day.down;
  if (total === 0) return 'none';
  if (day.down === 0 && day.degraded === 0) return 'ok';
  return (day.up + day.degraded) / total >= 0.99 ? 'minor' : 'major';
}

export interface Group {
  name: string;
  services: PublicService[];
}

export function groupServices(services: PublicService[]): Group[] {
  const groups: Group[] = [];
  for (const service of services) {
    let group = groups.find((candidate) => candidate.name === service.group);
    if (!group) {
      group = { name: service.group, services: [] };
      groups.push(group);
    }
    group.services.push(service);
  }
  return groups;
}

function total(days: PublicDay[]) {
  return days.reduce(
    (sum, day) => ({
      ok: sum.ok + day.up + day.degraded,
      all: sum.all + day.up + day.degraded + day.down,
    }),
    { ok: 0, all: 0 },
  );
}

export interface Summary {
  /** Share of checks answered across every service, floored to two decimals. */
  availability: number | null;
  /** Median of the services' 24 hour median response times. */
  medianMs: number | null;
  /** Days with at least one check inside the 30 day window (0 to 30). */
  observedDays: number;
}

export function summarize(status: PublicStatus): Summary {
  const windows = status.services.map((service) => service.days.slice(-30));
  const sum = windows.reduce(
    (acc, days) => {
      const part = total(days);
      return { ok: acc.ok + part.ok, all: acc.all + part.all };
    },
    { ok: 0, all: 0 },
  );
  const observed = new Set<string>();
  for (const days of windows) {
    for (const day of days) if (day.up + day.degraded + day.down > 0) observed.add(day.date);
  }
  const medians = status.services
    .map((service) => service.p50)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const middle = Math.floor(medians.length / 2);
  const medianMs =
    medians.length === 0
      ? null
      : medians.length % 2 === 1
        ? (medians[middle] ?? null)
        : Math.round(((medians[middle - 1] ?? 0) + (medians[middle] ?? 0)) / 2);
  return {
    availability: sum.all === 0 ? null : Math.floor((sum.ok * 10_000) / sum.all) / 100,
    medianMs,
    observedDays: observed.size,
  };
}

export function affected(status: PublicStatus, level: Level): PublicService[] {
  return status.services.filter((service) => service.level === level);
}

/** Data older than three check intervals means the monitor itself has stopped. */
export function isStale(status: PublicStatus, now: Date): boolean {
  return now.getTime() - Date.parse(status.generatedAt) > status.intervalSec * 3 * 1000;
}

export function firstMonitoredDay(status: PublicStatus): string | null {
  let first: string | null = null;
  for (const service of status.services) {
    for (const day of service.days) {
      if (day.up + day.degraded + day.down > 0 && (first === null || day.date < first)) {
        first = day.date;
      }
    }
  }
  return first;
}

export type Language = 'en' | 'id';

/** Name, description and sentence label of a service in the visitor's language. */
export function texts(service: PublicService, lang: Language) {
  const local = lang === 'id' ? service.translations?.id : undefined;
  return {
    name: local?.name ?? service.name,
    description: local?.description ?? service.description,
    label: local?.label ?? (local ? `${local.name} ${service.group}` : service.label),
  };
}
