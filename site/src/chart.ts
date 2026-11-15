import type { PublicService, Sample } from '../../shared/types.ts';
import { svg } from './dom.ts';
import { formatMs } from './format.ts';
import type { Strings } from './i18n.ts';

const WIDTH = 640;
const HEIGHT = 112;
const TOP = 10;
const BOTTOM = 14;
const DAY_SEC = 86_400;

function niceMax(value: number): number {
  const steps = [200, 300, 500, 800, 1_000, 1_500, 2_000, 3_000, 5_000, 10_000];
  return steps.find((step) => step >= value) ?? Math.ceil(value / 1_000) * 1_000;
}

/** Highest value on the y axis, shared by the drawing and its caption. */
export function chartMax(samples: Sample[]): number {
  const slowest = samples.reduce(
    (max, sample) => (sample[2] === 2 ? max : Math.max(max, sample[1])),
    0,
  );
  return niceMax(Math.max(200, slowest * 1.1));
}

/** Splits samples wherever the line should stop: failed checks and long silences. */
function segments(samples: Sample[]): Sample[][] {
  const gaps = samples
    .slice(1)
    .map((sample, index) => sample[0] - (samples[index]?.[0] ?? 0))
    .sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)] ?? 300;
  const limit = Math.max(typical * 3, 900);
  const result: Sample[][] = [];
  let current: Sample[] = [];
  let previous: Sample | undefined;
  for (const sample of samples) {
    const broken =
      sample[2] === 2 ||
      sample[1] < 0 ||
      (previous !== undefined && sample[0] - previous[0] > limit);
    if (broken && current.length > 0) {
      result.push(current);
      current = [];
    }
    if (sample[2] !== 2 && sample[1] >= 0) current.push(sample);
    previous = sample;
  }
  if (current.length > 0) result.push(current);
  return result;
}

export function latencyChart(
  service: PublicService,
  generatedAt: string,
  t: Strings,
): SVGSVGElement {
  const end = Math.floor(Date.parse(generatedAt) / 1000);
  const start = end - DAY_SEC;
  const max = chartMax(service.samples);
  const x = (at: number) => ((Math.min(Math.max(at, start), end) - start) / DAY_SEC) * WIDTH;
  const y = (ms: number) => TOP + (1 - Math.min(ms, max) / max) * (HEIGHT - TOP - BOTTOM);
  const baseline = HEIGHT - BOTTOM;

  const label =
    service.p50 === null || service.p95 === null
      ? t.panel.noSamples
      : t.panel.chartLabel(formatMs(service.p50, t.locale), formatMs(service.p95, t.locale));
  const root = svg('svg', {
    class: 'chart',
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': label,
  });

  for (const fraction of [0, 0.5, 1]) {
    const line = TOP + fraction * (baseline - TOP);
    root.append(svg('line', { class: 'chart__grid', x1: 0, x2: WIDTH, y1: line, y2: line }));
  }

  for (const part of segments(service.samples)) {
    const points = part.map((sample) => `${x(sample[0]).toFixed(1)},${y(sample[1]).toFixed(1)}`);
    const first = part[0];
    const last = part[part.length - 1];
    if (!first || !last) continue;
    if (part.length > 1) {
      root.append(
        svg('path', {
          class: 'chart__area',
          d: `M${x(first[0]).toFixed(1)},${baseline} L${points.join(' L')} L${x(last[0]).toFixed(1)},${baseline} Z`,
        }),
        svg('path', { class: 'chart__line', d: `M${points.join(' L')}` }),
      );
    } else {
      root.append(svg('circle', { class: 'chart__dot', cx: x(first[0]), cy: y(first[1]), r: 2.5 }));
    }
  }

  for (const sample of service.samples) {
    if (sample[2] === 2) {
      root.append(
        svg('rect', {
          class: 'chart__fail',
          x: x(sample[0]) - 1.5,
          y: baseline - 12,
          width: 3,
          height: 12,
          rx: 1,
        }),
      );
    } else if (sample[2] === 1) {
      root.append(
        svg('circle', { class: 'chart__slow', cx: x(sample[0]), cy: y(sample[1]), r: 3 }),
      );
    }
  }
  return root;
}
