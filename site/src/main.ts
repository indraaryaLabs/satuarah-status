import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './styles.css';
import { fetchStatus } from './api.ts';
import { detectLang, strings } from './i18n.ts';
import type { Lang } from './i18n.ts';
import type { PublicStatus } from '../../shared/types.ts';
import { renderApp } from './view.ts';
import type { Actions, ViewState } from './view.ts';

const REFRESH_MS = 60_000;
const TICK_MS = 30_000;

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice simply lasts for this visit.
  }
}

/** Fewer frames on narrow screens so each one stays wide enough to see. */
function stripCountFor(width: number): number {
  if (width < 480) return 45;
  if (width < 640) return 60;
  return 90;
}

const state: ViewState = {
  status: null,
  failed: false,
  lang: detectLang(stored('lang'), navigator.language),
  theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  now: new Date(),
  expanded: new Set<string>(),
  develop: false,
  stripCount: stripCountFor(window.innerWidth),
};
let expanded = new Set<string>();
let revealed = false;

function render(): void {
  const focusId = (document.activeElement as HTMLElement | null)?.dataset.fid;
  state.expanded = expanded;
  state.develop =
    state.status !== null && !revealed && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.status !== null) revealed = true;

  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme;
  document.title = `${strings[state.lang].brand} ${strings[state.lang].brandSuffix}`;
  root?.replaceChildren(renderApp(state, actions));

  if (focusId) {
    root?.querySelector<HTMLElement>(`[data-fid="${focusId}"]`)?.focus({ preventScroll: true });
  }
}

const actions: Actions = {
  toggle(id) {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    expanded = next;
    // Update in place so the panel can animate instead of being rebuilt.
    const toggle = root?.querySelector<HTMLElement>(`[data-fid="toggle-${id}"]`);
    const panel = document.getElementById(`panel-${id}`);
    if (toggle && panel) {
      const open = next.has(id);
      toggle.setAttribute('aria-expanded', String(open));
      panel.dataset.open = String(open);
      if (open) panel.removeAttribute('inert');
      else panel.setAttribute('inert', '');
    } else {
      render();
    }
  },
  setLang(lang: Lang) {
    state.lang = lang;
    remember('lang', lang);
    render();
  },
  toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    remember('theme', state.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', state.theme === 'dark' ? '#0e1115' : '#f4f5f7');
    render();
  },
  retry() {
    state.failed = false;
    render();
    void load();
  },
};

let loading = false;
async function load(): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    const next: PublicStatus = await fetchStatus();
    if (state.status === null || next.generatedAt !== state.status.generatedAt) state.status = next;
    state.failed = false;
  } catch {
    // Keep showing the last good data; the stale notice appears on its own if this persists.
    if (state.status === null) state.failed = true;
  } finally {
    loading = false;
    state.now = new Date();
    render();
  }
}

// Follow the system theme until the visitor picks one.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (stored('theme') !== null) return;
  state.theme = event.matches ? 'dark' : 'light';
  render();
});

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const count = stripCountFor(window.innerWidth);
    if (count !== state.stripCount) {
      state.stripCount = count;
      render();
    }
  }, 150);
});

// Keep "checked 2 minutes ago" honest without rebuilding the page under someone's pointer.
window.setInterval(() => {
  if (document.hidden || document.querySelector('.tip:not([hidden])')) return;
  state.now = new Date();
  render();
}, TICK_MS);

window.setInterval(() => {
  if (!document.hidden) void load();
}, REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void load();
});

render();
void load();
