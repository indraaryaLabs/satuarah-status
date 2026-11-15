import type { PublicStatus } from '../../shared/types.ts';

const repository = import.meta.env.VITE_REPOSITORY ?? 'indraaryaLabs/satuarah-status';

export const REPOSITORY: string = repository;

/** The monitor publishes to a single-commit `data` branch; raw.githubusercontent.com serves it with CORS. */
const DATA_URL = `https://raw.githubusercontent.com/${repository}/data/status.json`;

export class StatusUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatusUnavailable';
  }
}

function isPublicStatus(value: unknown): value is PublicStatus {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PublicStatus>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.generatedAt === 'string' &&
    Array.isArray(candidate.services) &&
    Array.isArray(candidate.incidents)
  );
}

export async function fetchStatus(signal?: AbortSignal): Promise<PublicStatus> {
  // The CDN caches each URL for five minutes, so a per-minute query string keeps the page fresh.
  const url = `${DATA_URL}?t=${Math.floor(Date.now() / 60_000)}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: signal ?? null, cache: 'no-store' });
  } catch {
    throw new StatusUnavailable('network');
  }
  if (!response.ok) throw new StatusUnavailable(`http ${response.status}`);
  const body: unknown = await response.json().catch(() => null);
  if (!isPublicStatus(body)) throw new StatusUnavailable('unexpected data');
  return body;
}
