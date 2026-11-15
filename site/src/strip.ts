import type { PublicDay, PublicService } from '../../shared/types.ts';
import { h } from './dom.ts';
import { dayLabel, formatMs, formatPercent } from './format.ts';
import type { Strings } from './i18n.ts';
import { dayTone, texts } from './model.ts';
import type { Language } from './model.ts';

export interface StripOptions {
  service: PublicService;
  count: number;
  t: Strings;
  lang: Language;
  row: number;
  develop: boolean;
  focusId: string;
}

function describeDay(day: PublicDay, t: Strings): { title: string; lines: string[] } {
  const title = dayLabel(day.date, t.locale);
  const total = day.up + day.degraded + day.down;
  if (total === 0) return { title, lines: [t.day.none] };
  const lines: string[] = [];
  if (day.down === 0 && day.degraded === 0) {
    lines.push(t.day.allPassed(total));
  } else {
    lines.push(t.day.mixed(day.down, day.degraded, total));
    lines.push(
      formatPercent(Math.floor(((day.up + day.degraded) * 10_000) / total) / 100, t.locale),
    );
  }
  if (day.avgMs !== null) lines.push(t.day.average(formatMs(day.avgMs, t.locale)));
  return { title, lines };
}

/**
 * The 90 day history drawn as a strip of film: one frame per day, lit green when every check
 * passed, amber or red when some did not, and dark when nothing was measured. Pointer and arrow
 * keys both reveal the day under the cursor.
 */
export function createStrip(options: StripOptions): HTMLElement {
  const { service, count, t, lang, row, develop, focusId } = options;
  const days = service.days.slice(-count);
  let active = -1;

  const frames = days.map((day, index) =>
    h('span', {
      class: 'frame',
      'data-tone': dayTone(day),
      style: `--i:${index}`,
    }),
  );
  const film = h('div', { class: 'film', style: `--row:${row}` }, ...frames);
  if (develop) film.classList.add('is-developing');

  const tipTitle = h('strong', { class: 'tip__title' });
  const tipBody = h('span', { class: 'tip__body' });
  const tip = h('div', { class: 'tip', hidden: true, 'aria-hidden': 'true' }, tipTitle, tipBody);
  const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });

  const show = (index: number, announce: boolean) => {
    const day = days[index];
    if (!day) return;
    frames[active]?.removeAttribute('data-active');
    active = index;
    frames[index]?.setAttribute('data-active', '');
    const text = describeDay(day, t);
    tipTitle.textContent = text.title;
    tipBody.textContent = text.lines.join(' / ');
    tip.hidden = false;
    // Centre the tooltip over the frame, but keep it inside the strip.
    const frame = frames[index];
    if (frame) {
      const stripBox = film.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const half = tip.offsetWidth / 2;
      const centre = frameBox.left - stripBox.left + frameBox.width / 2;
      tip.style.left = `${Math.min(Math.max(centre, half), stripBox.width - half)}px`;
    }
    if (announce) live.textContent = `${text.title}. ${text.lines.join('. ')}`;
  };

  const hide = () => {
    frames[active]?.removeAttribute('data-active');
    active = -1;
    tip.hidden = true;
  };

  const indexAt = (clientX: number): number => {
    const box = film.getBoundingClientRect();
    const first = frames[0]?.getBoundingClientRect();
    const last = frames[frames.length - 1]?.getBoundingClientRect();
    if (!first || !last) return -1;
    const span = last.right - first.left;
    const ratio = (clientX - first.left) / span;
    if (clientX < box.left || clientX > box.right) return -1;
    return Math.min(days.length - 1, Math.max(0, Math.floor(ratio * days.length)));
  };

  film.addEventListener('pointermove', (event) => show(indexAt(event.clientX), false));
  film.addEventListener('pointerdown', (event) => show(indexAt(event.clientX), false));
  film.addEventListener('pointerleave', () => {
    if (document.activeElement !== strip) hide();
  });

  const uptime =
    service.uptime.d90 === null
      ? t.noDataYet
      : `${formatPercent(service.uptime.d90, t.locale)} ${t.uptimeOver90}`;

  const strip = h(
    'div',
    {
      class: 'strip',
      role: 'group',
      tabindex: 0,
      'aria-label': t.stripLabel(texts(service, lang).label, uptime),
      'data-fid': focusId,
      onkeydown: (event: KeyboardEvent) => {
        const last = days.length - 1;
        const next =
          event.key === 'ArrowLeft'
            ? Math.max(0, (active < 0 ? last : active) - 1)
            : event.key === 'ArrowRight'
              ? Math.min(last, active < 0 ? last : active + 1)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? last
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        show(next, true);
      },
      onfocus: () => show(days.length - 1, false),
      onblur: hide,
    },
    film,
    tip,
    live,
  );
  return strip;
}
