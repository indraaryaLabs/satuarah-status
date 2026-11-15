import type { Strings } from './i18n.ts';

export function formatPercent(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatMs(value: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))} ms`;
}

/** "3 minutes ago" style text, or the localized "just now" under a minute. */
export function relative(iso: string, now: Date, t: Strings): string {
  const seconds = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  if (seconds < 60) return t.justNow;
  const rtf = new Intl.RelativeTimeFormat(t.locale, { numeric: 'always' });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

/** Plain length of time used for "data is 42 minutes old" and incident duration. */
export function duration(seconds: number, t: Strings): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return t.duration.minute(minutes);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return rest === 0
      ? t.duration.hour(hours)
      : `${t.duration.hour(hours)} ${t.duration.minute(rest)}`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0
    ? t.duration.day(days)
    : `${t.duration.day(days)} ${t.duration.hour(restHours)}`;
}

/** "Tue, 12 Nov" for a UTC calendar day. */
export function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function shortDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}

export function longDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Local clock time with the viewer's time zone name, for incident ranges. */
export function clock(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function zoneName(iso: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZoneName: 'short' }).formatToParts(
    new Date(iso),
  );
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

export function fullTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
