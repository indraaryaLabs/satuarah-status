import type { Observation } from '../shared/types.ts';
import type { ResolvedService } from './config.ts';

export const USER_AGENT =
  'satuarah-status/1.0 (+https://github.com/indraaryaLabs/satuarah-status; uptime monitor)';

/** Responses larger than this are not read further; the marker text is always near the top. */
const BODY_LIMIT_BYTES = 512 * 1024;

export interface CheckDeps {
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

const defaultDeps: CheckDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
};

const NETWORK_CODES: Record<string, string> = {
  ENOTFOUND: 'DNS lookup failed',
  EAI_AGAIN: 'DNS lookup failed',
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  ETIMEDOUT: 'connection timed out',
  EHOSTUNREACH: 'host unreachable',
  ENETUNREACH: 'network unreachable',
  UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
  UND_ERR_SOCKET: 'connection closed unexpectedly',
};

/** Turns a thrown fetch error into one short, stable sentence. */
export function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return `no response within ${timeoutMs} ms`;
  }
  const cause = (error as { cause?: { code?: string } } | undefined)?.cause;
  const code = cause?.code;
  if (code !== undefined) {
    const known = NETWORK_CODES[code];
    if (known !== undefined) return known;
    if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) {
      return `TLS certificate problem (${code})`;
    }
    return `network error (${code})`;
  }
  return 'network error';
}

async function readBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (received >= BODY_LIMIT_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return text;
}

async function attempt(service: ResolvedService, deps: CheckDeps): Promise<Observation> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), service.timeoutMs);
  const startedAt = performance.now();
  const at = deps.now().toISOString();
  try {
    const response = await fetch(service.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'cache-control': 'no-cache',
      },
    });
    const wantsBody = service.expect.bodyIncludes !== undefined;
    const body = wantsBody ? await readBody(response) : '';
    if (!wantsBody) await response.body?.cancel();
    const latencyMs = Math.round(performance.now() - startedAt);

    if (!service.expect.status.includes(response.status)) {
      return {
        at,
        level: 'down',
        httpStatus: response.status,
        latencyMs,
        error: `unexpected status ${response.status}`,
      };
    }
    if (service.expect.bodyIncludes !== undefined && !body.includes(service.expect.bodyIncludes)) {
      return {
        at,
        level: 'down',
        httpStatus: response.status,
        latencyMs,
        error: 'response did not contain the expected content',
      };
    }
    const level = latencyMs >= service.degradedMs ? 'degraded' : 'up';
    return {
      at,
      level,
      httpStatus: response.status,
      latencyMs,
      error: level === 'degraded' ? `slow response (${latencyMs} ms)` : null,
    };
  } catch (error) {
    return {
      at,
      level: 'down',
      httpStatus: null,
      latencyMs: null,
      error: describeError(error, service.timeoutMs),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks one service. A failed attempt is retried a few seconds later inside the same run, so a
 * single dropped packet never becomes an observation. The first attempt that is not "down" wins.
 */
export async function check(
  service: ResolvedService,
  deps: CheckDeps = defaultDeps,
): Promise<Observation> {
  let result = await attempt(service, deps);
  for (let retry = 0; retry < service.retries && result.level === 'down'; retry += 1) {
    await deps.sleep(service.retryDelayMs);
    result = await attempt(service, deps);
  }
  return result;
}
