import { describe, expect, it } from 'vitest';
import {
  applyObservation,
  emptyState,
  isDue,
  parseState,
  prune,
  publishedLevel,
} from '../state.ts';
import { observation } from './fixtures.ts';

const api = { id: 'api', failureThreshold: 2 };

function run(levels: Array<'up' | 'degraded' | 'down'>) {
  const state = emptyState();
  const events = levels.map((level, index) =>
    applyObservation(state, api, observation(level, index * 5)),
  );
  return { state, events };
}

describe('publishedLevel', () => {
  it('recovers immediately', () => {
    expect(publishedLevel('down', 'up', 0, 0, 2)).toBe('up');
  });
  it('ignores a single failure after a healthy period', () => {
    expect(publishedLevel('up', 'down', 1, 1, 2)).toBe('up');
  });
  it('shows the first observation straight away when nothing was known', () => {
    expect(publishedLevel('unknown', 'down', 1, 1, 2)).toBe('down');
  });
  it('confirms an outage after the threshold', () => {
    expect(publishedLevel('up', 'down', 2, 2, 2)).toBe('down');
  });
  it('shows degraded when the bad streak is mixed', () => {
    expect(publishedLevel('up', 'degraded', 2, 0, 2)).toBe('degraded');
  });
});

describe('applyObservation', () => {
  it('does not open an incident for a single blip', () => {
    const { state, events } = run(['up', 'down', 'up']);
    expect(state.incidents).toHaveLength(0);
    expect(events.flat()).toEqual([]);
    expect(state.services.api?.level).toBe('up');
  });

  it('opens one incident at the first failure once the threshold is reached', () => {
    const { state, events } = run(['up', 'down', 'down', 'down']);
    expect(state.incidents).toHaveLength(1);
    expect(events.flat().map((event) => event.type)).toEqual(['opened']);
    expect(state.incidents[0]).toMatchObject({
      serviceId: 'api',
      severity: 'down',
      startedAt: observation('down', 5).at,
      resolvedAt: null,
      lastError: 'unexpected status 503',
    });
  });

  it('resolves the incident on the first healthy observation', () => {
    const { state, events } = run(['up', 'down', 'down', 'up']);
    expect(events.flat().map((event) => event.type)).toEqual(['opened', 'resolved']);
    expect(state.incidents[0]?.resolvedAt).toBe(observation('up', 15).at);
    expect(state.services.api?.level).toBe('up');
  });

  it('escalates a degraded incident to an outage without opening a second one', () => {
    const { state, events } = run(['up', 'degraded', 'degraded', 'down', 'down']);
    expect(events.flat().map((event) => event.type)).toEqual(['opened', 'escalated']);
    expect(state.incidents).toHaveLength(1);
    expect(state.incidents[0]?.severity).toBe('down');
  });

  it('opens a new incident for a later failure', () => {
    const { state } = run(['down', 'down', 'up', 'up', 'down', 'down']);
    expect(state.incidents).toHaveLength(2);
    expect(new Set(state.incidents.map((incident) => incident.id)).size).toBe(2);
  });

  it('counts every observation per UTC day and keeps latency only for answers', () => {
    const { state } = run(['up', 'degraded', 'down']);
    const day = state.services.api?.days['2026-11-15'];
    expect(day).toEqual({ up: 1, degraded: 1, down: 1, latencySum: 120 + 900, latencyCount: 2 });
  });

  it('drops samples older than 24 hours', () => {
    const state = emptyState();
    applyObservation(state, api, observation('up', 0));
    applyObservation(state, api, observation('up', 24 * 60 + 5));
    expect(state.services.api?.samples).toHaveLength(1);
  });
});

describe('isDue', () => {
  it('is due when never checked', () => {
    expect(isDue(emptyState(), 'api', 300, new Date())).toBe(true);
  });
  it('waits for the interval but tolerates cron jitter', () => {
    const { state } = run(['up']);
    const at = Date.parse(observation('up', 0).at);
    expect(isDue(state, 'api', 900, new Date(at + 4 * 60_000))).toBe(false);
    expect(isDue(state, 'api', 300, new Date(at + 4.5 * 60_000))).toBe(true);
  });
});

describe('prune and parseState', () => {
  it('removes old days and old resolved incidents, never an open one', () => {
    const { state } = run(['down', 'down', 'up', 'down', 'down']);
    state.services.api!.days['2020-01-01'] = {
      up: 1,
      degraded: 0,
      down: 0,
      latencySum: 1,
      latencyCount: 1,
    };
    state.incidents.push({
      ...state.incidents[0]!,
      id: 'old',
      resolvedAt: '2020-01-02T00:00:00.000Z',
    });
    prune(state, new Date(Date.UTC(2026, 10, 16)));
    expect(Object.keys(state.services.api!.days)).toEqual(['2026-11-15']);
    expect(state.incidents.map((incident) => incident.id)).not.toContain('old');
    expect(state.incidents.some((incident) => incident.resolvedAt === null)).toBe(true);
  });

  it('rejects a file that is not monitor state', () => {
    expect(() => parseState({ version: 2 })).toThrow(/unknown shape/);
    expect(parseState({ version: 1, services: {}, incidents: [] }).incidents).toEqual([]);
  });
});
