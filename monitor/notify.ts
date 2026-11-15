import type { Incident } from '../shared/types.ts';
import type { ResolvedService } from './config.ts';
import type { MonitorEvent } from './state.ts';

export interface NotifyContext {
  repository: string;
  token: string;
  services: ResolvedService[];
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

const API = 'https://api.github.com';

function pagesUrl(repository: string): string {
  const [owner, name] = repository.split('/');
  return `https://${(owner ?? '').toLowerCase()}.github.io/${name ?? ''}/`;
}

function label(service: ResolvedService | undefined, incident: Incident): string {
  return service ? (service.label ?? `${service.group} ${service.name}`) : incident.serviceId;
}

export function issueTitle(service: ResolvedService | undefined, incident: Incident): string {
  const kind = incident.severity === 'down' ? 'Outage' : 'Degraded';
  return `${kind}: ${label(service, incident)}`;
}

export function issueBody(
  service: ResolvedService | undefined,
  incident: Incident,
  repository: string,
): string {
  const lines = [
    `**${label(service, incident)}** is ${incident.severity === 'down' ? 'not responding correctly' : 'responding slowly'}.`,
    '',
    `- Started: ${incident.startedAt}`,
    `- Last error: ${incident.lastError ?? 'none recorded'}`,
    `- Status page: ${pagesUrl(repository)}`,
  ];
  if (service?.runbook) {
    lines.push(`- Runbook: https://github.com/${repository}/blob/main/${service.runbook}`);
  }
  lines.push('', 'This issue is opened and closed automatically by the monitor.');
  return lines.join('\n');
}

export function resolvedComment(incident: Incident): string {
  const minutes = Math.max(
    1,
    Math.round(
      (Date.parse(incident.resolvedAt ?? incident.startedAt) - Date.parse(incident.startedAt)) /
        60_000,
    ),
  );
  return `Recovered at ${incident.resolvedAt}. Total duration: about ${minutes} min.`;
}

/**
 * Mirrors incident transitions into GitHub issues, which email the repository owner. It never
 * throws: a failed notification must not hide the monitoring data from the page.
 */
export async function notify(events: MonitorEvent[], context: NotifyContext): Promise<void> {
  const send = context.fetchImpl ?? fetch;
  const log = context.log ?? (() => undefined);
  const headers = {
    authorization: `Bearer ${context.token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
    'user-agent': 'satuarah-status',
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await send(`${API}/repos/${context.repository}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`);
    return response;
  };

  for (const event of events) {
    const { incident } = event;
    const service = context.services.find((candidate) => candidate.id === incident.serviceId);
    try {
      if (event.type === 'opened') {
        const response = await call('POST', '/issues', {
          title: issueTitle(service, incident),
          body: issueBody(service, incident, context.repository),
          labels: ['incident', incident.severity === 'down' ? 'outage' : 'degraded'],
        });
        const created = (await response.json()) as { number?: number };
        incident.issueNumber = typeof created.number === 'number' ? created.number : null;
        log(`opened issue #${incident.issueNumber} for ${incident.id}`);
      } else if (incident.issueNumber !== null) {
        if (event.type === 'escalated') {
          await call('POST', `/issues/${incident.issueNumber}/comments`, {
            body: `Escalated: ${label(service, incident)} is now not responding. Last error: ${incident.lastError ?? 'none recorded'}.`,
          });
        } else {
          await call('POST', `/issues/${incident.issueNumber}/comments`, {
            body: resolvedComment(incident),
          });
          await call('PATCH', `/issues/${incident.issueNumber}`, {
            state: 'closed',
            state_reason: 'completed',
          });
        }
        log(`${event.type} issue #${incident.issueNumber}`);
      }
    } catch (error) {
      log(`notification failed for ${incident.id}: ${(error as Error).message}`);
    }
  }
}
