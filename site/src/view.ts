import type { Level, PublicIncident, PublicService, PublicStatus } from '../../shared/types.ts';
import { REPOSITORY } from './api.ts';
import { latencyChart, chartMax } from './chart.ts';
import { fill, h, svg } from './dom.ts';
import {
  clock,
  duration,
  formatMs,
  formatPercent,
  fullTimestamp,
  longDate,
  relative,
  shortDate,
  zoneName,
} from './format.ts';
import type { Lang, Strings } from './i18n.ts';
import { strings } from './i18n.ts';
import { affected, firstMonitoredDay, groupServices, isStale, summarize, texts } from './model.ts';
import { createStrip } from './strip.ts';

export interface ViewState {
  status: PublicStatus | null;
  failed: boolean;
  lang: Lang;
  theme: 'light' | 'dark';
  now: Date;
  expanded: ReadonlySet<string>;
  /** True only for the first render with data, which plays the one-time "developing" reveal. */
  develop: boolean;
  stripCount: number;
}

export interface Actions {
  toggle: (id: string) => void;
  setLang: (lang: Lang) => void;
  toggleTheme: () => void;
  retry: () => void;
}

type Tone = 'ok' | 'warn' | 'bad' | 'idle';

const toneOf: Record<Level | 'unknown', Tone> = {
  up: 'ok',
  degraded: 'warn',
  down: 'bad',
  unknown: 'idle',
};

const overallTone = (status: PublicStatus | null): Tone =>
  status === null
    ? 'idle'
    : status.overall === 'operational'
      ? 'ok'
      : status.overall === 'degraded'
        ? 'warn'
        : status.overall === 'outage'
          ? 'bad'
          : 'idle';

function mark(): SVGSVGElement {
  return svg(
    'svg',
    { class: 'mark', viewBox: '0 0 32 32', width: 24, height: 24, 'aria-hidden': 'true' },
    svg('rect', { width: 32, height: 32, rx: 8 }),
    svg('path', { d: 'M9 16h12M16.5 10.5 22 16l-5.5 5.5' }),
  );
}

function themeIcon(theme: 'light' | 'dark'): SVGSVGElement {
  const common = { viewBox: '0 0 20 20', width: 18, height: 18, 'aria-hidden': 'true' };
  return theme === 'dark'
    ? svg(
        'svg',
        common,
        svg('circle', { cx: 10, cy: 10, r: 3.5 }),
        svg('path', {
          d: 'M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4',
        }),
      )
    : svg(
        'svg',
        common,
        svg('path', { d: 'M16.5 11.8A6.8 6.8 0 0 1 8.2 3.5a6.8 6.8 0 1 0 8.3 8.3Z' }),
      );
}

function chevron(): SVGSVGElement {
  return svg(
    'svg',
    { class: 'chevron', viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' },
    svg('path', { d: 'm4 6 4 4 4-4' }),
  );
}

function header(state: ViewState, actions: Actions, t: Strings): HTMLElement {
  const langButton = (lang: Lang, label: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'seg__button',
        'aria-pressed': String(state.lang === lang),
        lang,
        'data-fid': `lang-${lang}`,
        onclick: () => actions.setLang(lang),
      },
      label,
    );
  const dark = state.theme === 'dark';
  return h(
    'header',
    { class: 'top' },
    h(
      'div',
      { class: 'brand' },
      mark(),
      h('span', { class: 'brand__name' }, t.brand),
      h('span', { class: 'brand__suffix' }, t.brandSuffix),
    ),
    h(
      'div',
      { class: 'tools' },
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': t.language },
        langButton('id', 'ID'),
        langButton('en', 'EN'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-button',
          'aria-label': dark ? t.themeToLight : t.themeToDark,
          'data-fid': 'theme',
          onclick: actions.toggleTheme,
        },
        themeIcon(state.theme),
      ),
    ),
  );
}

function headline(status: PublicStatus, t: Strings, lang: Lang): string {
  const down = affected(status, 'down');
  if (down.length === 1 && down[0]) return t.headline.down(texts(down[0], lang).label);
  if (down.length > 1) return t.headline.downMany(down.length);
  if (status.overall === 'degraded') return t.headline.slow;
  if (status.overall === 'unknown') return t.headline.unknown;
  return t.headline.ok;
}

function hero(state: ViewState, status: PublicStatus, t: Strings): HTMLElement {
  const summary = summarize(status);
  const children: Array<Node | string> = [
    h('h1', { class: 'headline', id: 'headline' }, headline(status, t, state.lang)),
    h(
      'p',
      { class: 'meta' },
      h('span', { class: 'lamp', 'data-tone': overallTone(status), 'aria-hidden': 'true' }),
      h(
        'span',
        null,
        status.services.some((service) => service.lastCheckedAt !== null)
          ? `${t.checked(relative(status.generatedAt, state.now, t))} `
          : '',
        t.cadence(Math.round(status.intervalSec / 60)),
      ),
    ),
  ];

  if (summary.availability !== null) {
    const period =
      summary.observedDays >= 30
        ? t.summaryRecent
        : t.summarySoFar(Math.max(1, summary.observedDays));
    children.push(
      h(
        'p',
        { class: 'summary' },
        fill(t.summary(period), {
          availability: h('strong', null, formatPercent(summary.availability, t.locale)),
          median: h(
            'strong',
            null,
            summary.medianMs === null ? '-' : formatMs(summary.medianMs, t.locale),
          ),
        }),
      ),
    );
  } else {
    children.push(h('p', { class: 'summary' }, t.collecting));
  }
  return h('section', { class: 'hero', 'aria-labelledby': 'headline' }, ...children);
}

function stats(service: PublicService, t: Strings): HTMLElement {
  const pct = (value: number | null) =>
    value === null ? t.noDataYet : formatPercent(value, t.locale);
  const entry = (label: string, value: string) =>
    h('div', { class: 'stat' }, h('dt', null, label), h('dd', null, value));
  return h(
    'dl',
    { class: 'stats' },
    entry(t.panel.last24h, pct(service.uptime.d1)),
    entry(t.panel.last7d, pct(service.uptime.d7)),
    entry(t.panel.last30d, pct(service.uptime.d30)),
    entry(t.panel.last90d, pct(service.uptime.d90)),
    entry(t.panel.median, service.p50 === null ? '-' : formatMs(service.p50, t.locale)),
    entry(t.panel.slowest, service.p95 === null ? '-' : formatMs(service.p95, t.locale)),
  );
}

function panel(
  service: PublicService,
  status: PublicStatus,
  t: Strings,
  open: boolean,
): HTMLElement {
  const links: HTMLElement[] = [];
  if (service.href) links.push(h('a', { href: service.href, rel: 'noopener' }, t.panel.open));
  if (service.runbook) {
    links.push(
      h(
        'a',
        { href: `https://github.com/${REPOSITORY}/blob/main/${service.runbook}`, rel: 'noopener' },
        t.panel.runbook,
      ),
    );
  }
  const inner = h(
    'div',
    { class: 'panel__inner' },
    h('p', { class: 'panel__title' }, t.panel.chartTitle),
    service.samples.length > 1
      ? h(
          'div',
          { class: 'chart-wrap' },
          latencyChart(service, status.generatedAt, t),
          h(
            'div',
            { class: 'chart-axis' },
            h('span', null, t.panel.hoursAgo),
            h('span', null, t.panel.now),
          ),
          h(
            'p',
            { class: 'chart-note' },
            t.panel.chartScale(formatMs(chartMax(service.samples), t.locale)),
          ),
        )
      : h(
          'p',
          { class: 'chart-note' },
          service.samples.length === 1 ? t.panel.fewSamples : t.panel.noSamples,
        ),
    stats(service, t),
    service.level !== 'up' && service.error
      ? h('p', { class: 'problem' }, h('strong', null, `${t.panel.lastError}: `), service.error)
      : null,
    service.lastCheckedAt
      ? h(
          'p',
          { class: 'chart-note' },
          h(
            'time',
            { datetime: service.lastCheckedAt },
            fullTimestamp(service.lastCheckedAt, t.locale),
          ),
        )
      : null,
    links.length > 0 ? h('p', { class: 'links' }, ...links) : null,
  );
  const wrapper = h(
    'div',
    { class: 'panel', id: `panel-${service.id}`, 'data-open': String(open) },
    inner,
  );
  if (!open) wrapper.setAttribute('inert', '');
  return wrapper;
}

function serviceRow(
  service: PublicService,
  status: PublicStatus,
  state: ViewState,
  actions: Actions,
  t: Strings,
  row: number,
): HTMLElement {
  const open = state.expanded.has(service.id);
  const tone = toneOf[service.level];
  const uptime = service.uptime.d90;
  return h(
    'li',
    { class: 'service', 'data-tone': tone },
    h(
      'h3',
      { class: 'service__head' },
      h(
        'button',
        {
          type: 'button',
          class: 'service__toggle',
          'aria-expanded': String(open),
          'aria-controls': `panel-${service.id}`,
          'data-fid': `toggle-${service.id}`,
          onclick: () => actions.toggle(service.id),
        },
        h(
          'span',
          { class: 'service__text' },
          h('span', { class: 'service__name' }, texts(service, state.lang).name),
          h('span', { class: 'service__desc' }, texts(service, state.lang).description),
        ),
        h(
          'span',
          { class: 'service__state' },
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          t.status[service.level],
        ),
        chevron(),
      ),
    ),
    createStrip({
      service,
      count: state.stripCount,
      t,
      lang: state.lang,
      row,
      develop: state.develop,
      focusId: `strip-${service.id}`,
    }),
    h(
      'p',
      { class: 'axis' },
      h('span', null, t.daysAgo(state.stripCount)),
      h(
        'span',
        { class: 'axis__uptime' },
        uptime === null ? t.noDataYet : h('strong', null, `${formatPercent(uptime, t.locale)} `),
        uptime === null ? null : t.uptimeOver90,
      ),
      h('span', null, t.today),
    ),
    panel(service, status, t, open),
  );
}

function services(
  state: ViewState,
  status: PublicStatus,
  actions: Actions,
  t: Strings,
): HTMLElement {
  let row = 0;
  return h(
    'section',
    { class: 'block', 'aria-label': t.services },
    ...groupServices(status.services).map((group) =>
      h(
        'div',
        { class: 'group' },
        h('h2', { class: 'group__name' }, group.name),
        h(
          'ul',
          { class: 'services' },
          ...group.services.map((service) => serviceRow(service, status, state, actions, t, row++)),
        ),
      ),
    ),
  );
}

function incidentRow(
  incident: PublicIncident,
  status: PublicStatus,
  t: Strings,
  lang: Lang,
  now: Date,
  previousDate: string | null,
): HTMLElement {
  const service = status.services.find((candidate) => candidate.id === incident.serviceId);
  const name = service ? texts(service, lang).label : incident.serviceId;
  const date = shortDate(incident.startedAt, t.locale);
  const zone = zoneName(incident.startedAt, t.locale);
  const time =
    incident.resolvedAt === null
      ? t.incidents.since(`${clock(incident.startedAt, t.locale)} ${zone}`)
      : t.incidents.range(
          clock(incident.startedAt, t.locale),
          `${shortDate(incident.resolvedAt, t.locale) === date ? '' : `${shortDate(incident.resolvedAt, t.locale)} `}${clock(incident.resolvedAt, t.locale)} ${zone}`,
        );
  const length =
    incident.durationSec === null
      ? duration(Math.max(0, (now.getTime() - Date.parse(incident.startedAt)) / 1000), t)
      : duration(incident.durationSec, t);
  return h(
    'li',
    {
      class: 'incident',
      'data-tone':
        incident.resolvedAt === null ? 'bad' : incident.severity === 'down' ? 'bad' : 'warn',
    },
    h('span', { class: 'incident__date' }, date === previousDate ? '' : date),
    h(
      'div',
      { class: 'incident__body' },
      h(
        'p',
        { class: 'incident__title' },
        incident.severity === 'down' ? t.incidents.outage(name) : t.incidents.slow(name),
      ),
      h(
        'p',
        { class: 'incident__meta' },
        `${time}. `,
        incident.resolvedAt === null
          ? h('strong', null, t.incidents.ongoing)
          : `${t.incidents.lasted(length)}.`,
      ),
      incident.issueNumber === null
        ? null
        : h(
            'a',
            {
              class: 'incident__link',
              href: `https://github.com/${REPOSITORY}/issues/${incident.issueNumber}`,
              rel: 'noopener',
            },
            t.incidents.details,
          ),
    ),
  );
}

function incidents(state: ViewState, status: PublicStatus, t: Strings): HTMLElement {
  const first = firstMonitoredDay(status);
  let previous: string | null = null;
  const rows = status.incidents.map((incident) => {
    const row = incidentRow(incident, status, t, state.lang, state.now, previous);
    previous = shortDate(incident.startedAt, t.locale);
    return row;
  });
  return h(
    'section',
    { class: 'block', 'aria-labelledby': 'incidents-title' },
    h('h2', { class: 'group__name', id: 'incidents-title' }, t.incidents.title),
    rows.length === 0
      ? h('p', { class: 'empty' }, t.incidents.none(first ? longDate(first, t.locale) : null))
      : h('ul', { class: 'incidents' }, ...rows),
  );
}

function footer(status: PublicStatus | null, t: Strings): HTMLElement {
  const minutes = status ? Math.round(status.intervalSec / 60) : 5;
  return h(
    'footer',
    { class: 'foot' },
    h('p', null, t.footer.how(minutes), ' ', t.footer.days),
    h(
      'p',
      { class: 'foot__links' },
      h('a', { href: `https://github.com/${REPOSITORY}`, rel: 'noopener' }, t.source),
      h(
        'a',
        { href: `https://github.com/${REPOSITORY}/tree/main/docs/runbooks`, rel: 'noopener' },
        t.footer.runbooks,
      ),
    ),
  );
}

function skeleton(): HTMLElement {
  return h(
    'div',
    { class: 'skeleton', 'aria-hidden': 'true' },
    h('span', { class: 'skeleton__line skeleton__line--title' }),
    h('span', { class: 'skeleton__line' }),
    ...[0, 1, 2].map(() => h('span', { class: 'skeleton__film' })),
  );
}

export function renderApp(state: ViewState, actions: Actions): HTMLElement {
  const t = strings[state.lang];
  const status = state.status;
  const main = h('main', {
    class: 'main',
    id: 'main',
    tabindex: -1,
    'aria-busy': String(status === null && !state.failed),
  });

  if (status === null && state.failed) {
    main.append(
      h(
        'section',
        { class: 'hero' },
        h('h1', { class: 'headline' }, t.error.title),
        h('p', { class: 'summary' }, t.error.body),
        h(
          'p',
          null,
          h(
            'button',
            { type: 'button', class: 'button', 'data-fid': 'retry', onclick: actions.retry },
            t.error.retry,
          ),
        ),
      ),
    );
  } else if (status === null) {
    main.append(h('h1', { class: 'sr-only' }, t.brand + ' ' + t.brandSuffix), skeleton());
  } else {
    if (isStale(status, state.now)) {
      const age = duration((state.now.getTime() - Date.parse(status.generatedAt)) / 1000, t);
      main.append(h('p', { class: 'notice', role: 'status' }, t.stale(age)));
    }
    main.append(
      hero(state, status, t),
      services(state, status, actions, t),
      incidents(state, status, t),
    );
  }

  return h(
    'div',
    { class: 'page', lang: state.lang === 'id' ? 'id' : 'en' },
    header(state, actions, t),
    main,
    footer(status, t),
  );
}
