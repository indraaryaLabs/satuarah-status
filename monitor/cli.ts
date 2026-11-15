import { appendFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { check } from './check.ts';
import { loadConfig } from './config.ts';
import { notify } from './notify.ts';
import { buildPublicStatus } from './publish.ts';
import { applyObservation, emptyState, isDue, parseState, prune } from './state.ts';
import type { MonitorEvent } from './state.ts';

const { values } = parseArgs({
  options: {
    config: { type: 'string', default: 'config/services.json' },
    data: { type: 'string', default: 'data' },
    notify: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    now: { type: 'string' },
  },
});

async function readState(path: string) {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    throw error;
  }
  // A corrupt state file stops the run on purpose: silently starting over would erase history.
  return parseState(JSON.parse(text));
}

function summary(lines: string[]): void {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const now = new Date(values.now ?? Date.now());
  const config = await loadConfig(values.config);
  const statePath = join(values.data, 'state.json');
  const state = await readState(statePath);

  const due = config.services.filter(
    (service) => values.force || isDue(state, service.id, service.intervalSec, now),
  );
  const deps = {
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now: () => now,
  };
  const observations = await Promise.all(due.map((service) => check(service, deps)));

  const events: MonitorEvent[] = [];
  due.forEach((service, index) => {
    const observation = observations[index];
    if (observation) events.push(...applyObservation(state, service, observation));
  });

  if (values.notify) {
    const token = process.env.GITHUB_TOKEN;
    if (token) {
      await notify(events, {
        repository: config.site.repository,
        token,
        services: config.services,
        log: (message) => console.log(`notify: ${message}`),
      });
    } else {
      console.warn('notify: GITHUB_TOKEN is not set, skipping notifications');
    }
  }

  prune(state, now);
  const status = buildPublicStatus(config, state, now);

  await mkdir(values.data, { recursive: true });
  await writeFile(statePath, JSON.stringify(state));
  await writeFile(join(values.data, 'status.json'), JSON.stringify(status));

  const rows = due.map((service, index) => {
    const o = observations[index];
    return `| ${service.group} / ${service.name} | ${o?.level ?? '?'} | ${o?.httpStatus ?? '-'} | ${o?.latencyMs ?? '-'} | ${o?.error ?? ''} |`;
  });
  const skipped = config.services.length - due.length;
  const text = [
    `### Probe ${now.toISOString()}`,
    '',
    '| Service | Result | HTTP | ms | Note |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `Overall: **${status.overall}**. Checked ${due.length}, skipped ${skipped} (not due yet). Incident events: ${events.length}.`,
  ];
  console.log(text.join('\n'));
  summary(text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
