import { readFile } from 'node:fs/promises';
import type { Defaults, ServiceConfig } from '../shared/types.ts';

/** A service with every timing field filled in from the defaults. */
export interface ResolvedService extends ServiceConfig {
  intervalSec: number;
  timeoutMs: number;
  degradedMs: number;
  retries: number;
  retryDelayMs: number;
  failureThreshold: number;
}

export interface ResolvedConfig {
  site: { title: string; repository: string };
  defaults: Defaults;
  services: ResolvedService[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function text(source: Json, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`${where}.${key} must be a non-empty string`);
  }
  return value;
}

function positive(source: Json, key: string, where: string, allowZero = false): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    (!allowZero && value === 0)
  ) {
    throw new ConfigError(
      `${where}.${key} must be a ${allowZero ? 'non-negative' : 'positive'} number`,
    );
  }
  return value;
}

function parseDefaults(raw: unknown): Defaults {
  if (!isObject(raw)) throw new ConfigError('defaults must be an object');
  const need = (key: keyof Defaults, zero = false): number => {
    const value = positive(raw, key, 'defaults', zero);
    if (value === undefined) throw new ConfigError(`defaults.${key} is required`);
    return value;
  };
  return {
    intervalSec: need('intervalSec'),
    timeoutMs: need('timeoutMs'),
    degradedMs: need('degradedMs'),
    retries: need('retries', true),
    retryDelayMs: need('retryDelayMs', true),
    failureThreshold: need('failureThreshold'),
  };
}

function parseTranslations(raw: unknown, where: string): ServiceConfig['translations'] {
  if (raw === undefined) return undefined;
  if (!isObject(raw)) throw new ConfigError(`${where}.translations must be an object`);
  const id = raw.id;
  if (id === undefined) return {};
  if (!isObject(id)) throw new ConfigError(`${where}.translations.id must be an object`);
  const label = id.label;
  if (label !== undefined && (typeof label !== 'string' || label === '')) {
    throw new ConfigError(`${where}.translations.id.label must be a non-empty string`);
  }
  return {
    id: {
      name: text(id, 'name', `${where}.translations.id`),
      description: text(id, 'description', `${where}.translations.id`),
      ...(label === undefined ? {} : { label }),
    },
  };
}

function parseService(raw: unknown, index: number, defaults: Defaults): ResolvedService {
  const where = `services[${index}]`;
  if (!isObject(raw)) throw new ConfigError(`${where} must be an object`);

  const id = text(raw, 'id', where);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw new ConfigError(`${where}.id "${id}" must be lowercase letters, digits and dashes`);
  }
  const url = text(raw, 'url', where);
  try {
    new URL(url);
  } catch {
    throw new ConfigError(`${where}.url "${url}" is not a valid URL`);
  }

  const expect = raw.expect;
  if (!isObject(expect)) throw new ConfigError(`${where}.expect must be an object`);
  const status = expect.status;
  if (
    !Array.isArray(status) ||
    status.length === 0 ||
    !status.every((code) => Number.isInteger(code) && code >= 100 && code <= 599)
  ) {
    throw new ConfigError(`${where}.expect.status must list HTTP status codes`);
  }
  const bodyIncludes = expect.bodyIncludes;
  if (bodyIncludes !== undefined && (typeof bodyIncludes !== 'string' || bodyIncludes === '')) {
    throw new ConfigError(`${where}.expect.bodyIncludes must be a non-empty string`);
  }

  const optional = (key: 'href' | 'runbook'): string | undefined => {
    const value = raw[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value === '') {
      throw new ConfigError(`${where}.${key} must be a non-empty string`);
    }
    return value;
  };

  const label = raw.label;
  if (label !== undefined && (typeof label !== 'string' || label === '')) {
    throw new ConfigError(`${where}.label must be a non-empty string`);
  }
  const translations = parseTranslations(raw.translations, where);

  const service: ResolvedService = {
    id,
    group: text(raw, 'group', where),
    name: text(raw, 'name', where),
    description: text(raw, 'description', where),
    url,
    expect: {
      status: status as number[],
      ...(bodyIncludes === undefined ? {} : { bodyIncludes }),
    },
    intervalSec: positive(raw, 'intervalSec', where) ?? defaults.intervalSec,
    timeoutMs: positive(raw, 'timeoutMs', where) ?? defaults.timeoutMs,
    degradedMs: positive(raw, 'degradedMs', where) ?? defaults.degradedMs,
    retries: defaults.retries,
    retryDelayMs: defaults.retryDelayMs,
    failureThreshold: defaults.failureThreshold,
  };
  const href = optional('href');
  const runbook = optional('runbook');
  if (label !== undefined) service.label = label;
  if (translations !== undefined) service.translations = translations;
  if (href !== undefined) service.href = href;
  if (runbook !== undefined) service.runbook = runbook;
  if (service.degradedMs >= service.timeoutMs) {
    throw new ConfigError(`${where}: degradedMs must be lower than timeoutMs`);
  }
  return service;
}

export function resolveConfig(raw: unknown): ResolvedConfig {
  if (!isObject(raw)) throw new ConfigError('config must be an object');
  if (!isObject(raw.site)) throw new ConfigError('site must be an object');
  const defaults = parseDefaults(raw.defaults);
  if (!Array.isArray(raw.services) || raw.services.length === 0) {
    throw new ConfigError('services must be a non-empty array');
  }
  const services = raw.services.map((entry, index) => parseService(entry, index, defaults));

  const seen = new Set<string>();
  for (const service of services) {
    if (seen.has(service.id)) throw new ConfigError(`duplicate service id "${service.id}"`);
    seen.add(service.id);
  }

  const repository = text(raw.site, 'repository', 'site');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new ConfigError('site.repository must look like "owner/name"');
  }
  return { site: { title: text(raw.site, 'title', 'site'), repository }, defaults, services };
}

export async function loadConfig(path: string): Promise<ResolvedConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new ConfigError(`cannot read ${path}: ${(error as Error).message}`);
  }
  return resolveConfig(parsed);
}
