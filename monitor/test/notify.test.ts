import { describe, expect, it } from 'vitest';
import { issueBody, issueTitle, notify, resolvedComment } from '../notify.ts';
import { applyObservation, emptyState } from '../state.ts';
import { observation, service } from './fixtures.ts';

const api = service({ runbook: 'docs/runbooks/pickframe-api.md' });

function incidentFor(levels: Array<'up' | 'down' | 'degraded'>) {
  const state = emptyState();
  const events = levels.flatMap((level, index) =>
    applyObservation(state, { id: api.id, failureThreshold: 2 }, observation(level, index * 5)),
  );
  return { events, incident: state.incidents[0]! };
}

describe('issue text', () => {
  it('titles an outage and a slowdown differently', () => {
    const { incident } = incidentFor(['down', 'down']);
    expect(issueTitle(api, incident)).toBe('Outage: Product API');
    expect(issueTitle(api, { ...incident, severity: 'degraded' })).toBe('Degraded: Product API');
  });

  it('links the status page and the runbook', () => {
    const { incident } = incidentFor(['down', 'down']);
    const body = issueBody(api, incident, 'Owner/repo');
    expect(body).toContain('https://owner.github.io/repo/');
    expect(body).toContain(
      'https://github.com/Owner/repo/blob/main/docs/runbooks/pickframe-api.md',
    );
    expect(body).toContain('unexpected status 503');
  });

  it('measures downtime from the first failure to recovery', () => {
    const { incident } = incidentFor(['down', 'down', 'up']);
    expect(resolvedComment(incident)).toMatch(/about 10 min/);
  });
});

describe('notify', () => {
  function fakeGitHub(failOn?: string) {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({
        method: init.method ?? 'GET',
        url,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (failOn && url.includes(failOn)) return new Response('no', { status: 500 });
      return new Response(JSON.stringify({ number: 42 }), { status: 201 });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  }
  const base = { repository: 'owner/repo', token: 't', services: [api] };

  it('opens an issue and remembers its number on the incident', async () => {
    const { events, incident } = incidentFor(['down', 'down']);
    const { calls, fetchImpl } = fakeGitHub();
    await notify(events, { ...base, fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.github.com/repos/owner/repo/issues',
    });
    expect(calls[0]?.body).toMatchObject({ labels: ['incident', 'outage'] });
    expect(incident.issueNumber).toBe(42);
  });

  it('comments and closes the issue on recovery', async () => {
    const { events, incident } = incidentFor(['down', 'down', 'up']);
    incident.issueNumber = 7;
    const { calls, fetchImpl } = fakeGitHub();
    await notify(
      events.filter((event) => event.type === 'resolved'),
      { ...base, fetchImpl },
    );
    expect(calls.map((call) => `${call.method} ${call.url.split('/repos/owner/repo')[1]}`)).toEqual(
      ['POST /issues/7/comments', 'PATCH /issues/7'],
    );
    expect(calls[1]?.body).toEqual({ state: 'closed', state_reason: 'completed' });
  });

  it('survives an API failure and leaves the incident without an issue', async () => {
    const { events, incident } = incidentFor(['down', 'down']);
    const logs: string[] = [];
    await notify(events, {
      ...base,
      fetchImpl: fakeGitHub('/issues').fetchImpl,
      log: (m) => logs.push(m),
    });
    expect(incident.issueNumber).toBeNull();
    expect(logs.join()).toMatch(/notification failed/);
  });

  it('skips follow-ups when no issue was ever created', async () => {
    const { events } = incidentFor(['down', 'down', 'up']);
    const { calls, fetchImpl } = fakeGitHub();
    await notify(
      events.filter((event) => event.type === 'resolved'),
      { ...base, fetchImpl },
    );
    expect(calls).toHaveLength(0);
  });
});
