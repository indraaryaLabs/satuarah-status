import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { check, describeError } from '../check.ts';
import { service } from './fixtures.ts';

const server = createServer((request, response) => {
  const path = request.url ?? '/';
  if (path === '/ok') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"status":"ok"}');
  } else if (path === '/html') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html><body><div id="root"></div></body></html>');
  } else if (path === '/wrong-body') {
    response.writeHead(200);
    response.end('<html>maintenance page</html>');
  } else if (path === '/500') {
    response.writeHead(500);
    response.end('boom');
  } else if (path === '/404') {
    response.writeHead(404);
    response.end('{"error":"Gallery not found"}');
  } else if (path === '/slow') {
    setTimeout(() => response.end('slow but fine'), 150);
  } else if (path === '/hang') {
    // never answers
  } else if (path === '/redirect') {
    response.writeHead(302, { location: '/ok' });
    response.end();
  } else if (path === '/flaky') {
    flaky += 1;
    response.writeHead(flaky === 1 ? 503 : 200);
    response.end('{"status":"ok"}');
  } else {
    response.writeHead(404);
    response.end();
  }
});
let flaky = 0;
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const run = (path: string, overrides = {}) =>
  check(service({ url: `${base}${path}`, ...overrides }));

describe('check', () => {
  it('reports a healthy response as up with its latency', async () => {
    const result = await run('/ok', { expect: { status: [200], bodyIncludes: '"status":"ok"' } });
    expect(result).toMatchObject({ level: 'up', httpStatus: 200, error: null });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('finds the expected text in an HTML page', async () => {
    const result = await run('/html', { expect: { status: [200], bodyIncludes: 'id="root"' } });
    expect(result.level).toBe('up');
  });

  it('follows redirects and judges the final response', async () => {
    expect((await run('/redirect')).level).toBe('up');
  });

  it('marks a 5xx response as down', async () => {
    expect(await run('/500')).toMatchObject({
      level: 'down',
      httpStatus: 500,
      error: 'unexpected status 500',
    });
  });

  it('accepts a non-200 status when the config expects it', async () => {
    const result = await run('/404', { expect: { status: [404], bodyIncludes: 'not found' } });
    expect(result.level).toBe('up');
  });

  it('marks a 200 with the wrong content as down', async () => {
    const result = await run('/wrong-body', {
      expect: { status: [200], bodyIncludes: 'id="root"' },
    });
    expect(result).toMatchObject({
      level: 'down',
      error: 'response did not contain the expected content',
    });
  });

  it('marks a correct but slow response as degraded', async () => {
    const result = await run('/slow', { degradedMs: 80, timeoutMs: 1000 });
    expect(result.level).toBe('degraded');
    expect(result.error).toMatch(/slow response/);
  });

  it('gives up on a hanging server after the timeout', async () => {
    const result = await run('/hang', { timeoutMs: 120, degradedMs: 50 });
    expect(result).toMatchObject({ level: 'down', httpStatus: null, latencyMs: null });
    expect(result.error).toBe('no response within 120 ms');
  });

  it('reports a refused connection in plain words', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const result = await check(service({ url: `http://127.0.0.1:${port}/` }));
    expect(result).toMatchObject({ level: 'down', error: 'connection refused' });
  });

  it('retries a failure once inside the run and keeps the recovery', async () => {
    flaky = 0;
    const slept: number[] = [];
    const result = await check(service({ url: `${base}/flaky`, retries: 1, retryDelayMs: 250 }), {
      sleep: async (ms) => void slept.push(ms),
      now: () => new Date(),
    });
    expect(result.level).toBe('up');
    expect(slept).toEqual([250]);
  });

  it('does not retry when the first attempt succeeds', async () => {
    const slept: number[] = [];
    await check(service({ url: `${base}/ok`, retries: 3, retryDelayMs: 10 }), {
      sleep: async (ms) => void slept.push(ms),
      now: () => new Date(),
    });
    expect(slept).toEqual([]);
  });
});

describe('describeError', () => {
  it.each([
    ['ENOTFOUND', 'DNS lookup failed'],
    ['ECONNREFUSED', 'connection refused'],
    ['CERT_HAS_EXPIRED', 'TLS certificate problem (CERT_HAS_EXPIRED)'],
    ['SOMETHING_ELSE', 'network error (SOMETHING_ELSE)'],
  ])('maps %s', (code, expected) => {
    expect(describeError(new TypeError('fetch failed', { cause: { code } }), 1000)).toBe(expected);
  });

  it('falls back to a generic message', () => {
    expect(describeError(new Error('weird'), 1000)).toBe('network error');
  });
});
