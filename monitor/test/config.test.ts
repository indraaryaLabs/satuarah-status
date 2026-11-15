import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, resolveConfig } from '../config.ts';

const valid = () => ({
  site: { title: 'Status', repository: 'owner/repo' },
  defaults: {
    intervalSec: 300,
    timeoutMs: 10000,
    degradedMs: 2000,
    retries: 1,
    retryDelayMs: 2000,
    failureThreshold: 2,
  },
  services: [
    {
      id: 'web',
      group: 'Product',
      name: 'Web',
      description: 'The site',
      url: 'https://example.com/',
      expect: { status: [200] },
    },
  ],
});

describe('resolveConfig', () => {
  it('fills service timings from the defaults', () => {
    const [web] = resolveConfig(valid()).services;
    expect(web).toMatchObject({
      intervalSec: 300,
      timeoutMs: 10000,
      degradedMs: 2000,
      failureThreshold: 2,
    });
  });

  it('lets a service override a timing', () => {
    const raw = valid();
    Object.assign(raw.services[0] as object, { intervalSec: 900, degradedMs: 4000 });
    expect(resolveConfig(raw).services[0]).toMatchObject({ intervalSec: 900, degradedMs: 4000 });
  });

  it.each([
    [
      'duplicate ids',
      (raw: ReturnType<typeof valid>) => raw.services.push({ ...raw.services[0]! }),
      /duplicate/,
    ],
    [
      'an uppercase id',
      (raw: ReturnType<typeof valid>) => {
        raw.services[0]!.id = 'Web';
      },
      /lowercase/,
    ],
    [
      'a broken url',
      (raw: ReturnType<typeof valid>) => {
        raw.services[0]!.url = 'not a url';
      },
      /not a valid URL/,
    ],
    [
      'no status codes',
      (raw: ReturnType<typeof valid>) => {
        raw.services[0]!.expect.status = [];
      },
      /status codes/,
    ],
    [
      'a bad repository',
      (raw: ReturnType<typeof valid>) => {
        raw.site.repository = 'nope';
      },
      /owner\/name/,
    ],
    [
      'a degraded limit above the timeout',
      (raw: ReturnType<typeof valid>) => {
        raw.defaults.degradedMs = 20000;
      },
      /lower than timeoutMs/,
    ],
  ])('rejects %s', (_name, mutate, message) => {
    const raw = valid();
    mutate(raw);
    expect(() => resolveConfig(raw)).toThrow(ConfigError);
    expect(() => resolveConfig(raw)).toThrow(message);
  });

  it('rejects an empty service list', () => {
    const raw = valid();
    raw.services = [];
    expect(() => resolveConfig(raw)).toThrow(/non-empty/);
  });
});

describe('the shipped configuration', () => {
  it('is valid and every runbook it references exists', async () => {
    const { existsSync } = await import('node:fs');
    const config = await loadConfig('config/services.json');
    expect(config.services.length).toBeGreaterThan(0);
    for (const entry of config.services) {
      if (entry.runbook) expect(existsSync(entry.runbook), entry.runbook).toBe(true);
    }
  });
});

describe('translations and labels', () => {
  const withService = (extra: object) => {
    const raw = valid();
    Object.assign(raw.services[0] as object, extra);
    return raw;
  };

  it('keeps an Indonesian name, description and label', () => {
    const config = resolveConfig(
      withService({
        label: 'Web',
        translations: { id: { name: 'Aplikasi web', description: 'Deskripsi', label: 'Web saya' } },
      }),
    );
    expect(config.services[0]).toMatchObject({
      label: 'Web',
      translations: { id: { name: 'Aplikasi web', label: 'Web saya' } },
    });
  });

  it('rejects a translation without a description', () => {
    expect(() => resolveConfig(withService({ translations: { id: { name: 'x' } } }))).toThrow(
      /description/,
    );
  });
});
