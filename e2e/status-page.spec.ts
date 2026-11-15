import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { buildStatus, DATA_URL_PATTERN, NOW } from './fixtures.ts';
import type { Scenario } from './fixtures.ts';

async function open(page: Page, scenario: Scenario, path = '/') {
  const body = JSON.stringify(buildStatus(scenario));
  await page.route(DATA_URL_PATTERN, (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body,
    }),
  );
  await page.clock.setFixedTime(new Date(NOW.getTime() + 60_000));
  await page.goto(path);
  await page.getByRole('heading', { level: 1 }).waitFor();
}

const strip = (page: Page, name: RegExp) => page.getByRole('group', { name });

test.describe('when everything works', () => {
  test.beforeEach(async ({ page }) => open(page, 'operational'));

  test('says so plainly and shows when it last looked', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything is working.');
    await expect(page.getByText(/Last checked 2 minutes ago/)).toBeVisible();
    await expect(page.getByText(/Over the last 30 days, services answered/)).toBeVisible();
  });

  test('lists every service under its group with a 90 day strip', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'PickFrame' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Studio' })).toBeVisible();
    await expect(page.locator('.service')).toHaveCount(5);
    await expect(page.locator('.service').first().locator('.frame')).toHaveCount(90);
  });

  test('colours frames by how the day went', async ({ page }) => {
    const api = page.locator('.service', { hasText: 'API' }).first().locator('.frame');
    expect(
      await api.evaluateAll((frames) => frames.map((f) => (f as HTMLElement).dataset.tone)),
    ).toEqual(expect.arrayContaining(['none', 'ok', 'minor', 'major']));
  });

  test('shows what happened on a day when hovering its frame', async ({ page }) => {
    const day = page.locator('.service').first().locator('.frame').nth(60);
    await day.hover();
    const tip = page.locator('.tip:not([hidden])');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/checks/);
  });

  test('reads a day aloud and moves between days with the arrow keys', async ({ page }) => {
    const first = strip(page, /Web app, availability by day/);
    await first.focus();
    await first.press('ArrowLeft');
    await expect(first.locator('.sr-only')).not.toBeEmpty();
    const activeIndex = () =>
      first
        .locator('.frame')
        .evaluateAll((frames) => frames.findIndex((f) => f.hasAttribute('data-active')));
    const before = await activeIndex();
    await first.press('ArrowLeft');
    expect(await activeIndex()).toBe(before - 1);
    await first.press('Home');
    await expect(first.locator('.frame[data-active]')).toHaveCount(1);
  });

  test('opens a service to show its response time chart and numbers', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /^API.*Working/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#panel-pickframe-api');
    await expect(
      panel.getByRole('img', { name: /Response time over the last 24 hours/ }),
    ).toBeVisible();
    await expect(panel.getByText('Median response')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Runbook' })).toHaveAttribute(
      'href',
      /docs\/runbooks\/pickframe-api\.md$/,
    );
    await toggle.click();
    await expect(panel).toHaveAttribute('inert', '');
  });

  test('shows a past outage with how long it lasted', async ({ page }) => {
    const item = page.locator('.incident').first();
    await expect(item).toContainText('PickFrame API stopped responding');
    await expect(item).toContainText(/Lasted \d+ (minutes?|hours?)/);
  });
});

test.describe('language and theme', () => {
  test('switches to Indonesian, keeps the choice and sets the document language', async ({
    page,
  }) => {
    await open(page, 'operational');
    await page.getByRole('button', { name: 'ID' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Semua berjalan normal.');
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page.getByRole('button', { name: /^Jalur database/ })).toBeVisible();
    await expect(page.getByText('Pencarian tautan klien publik')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Semua berjalan normal.');
  });

  test('switches theme and keeps the choice', async ({ page }) => {
    await open(page, 'operational');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('follows the system theme until a choice is made', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, 'operational');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('when something is wrong', () => {
  test('names a slow service without alarm', async ({ page }) => {
    await open(page, 'degraded');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Some services are slow.');
    await expect(page.getByRole('button', { name: /^API.*Slow/ })).toBeVisible();
  });

  test('names the service that stopped responding and lists the open incident', async ({
    page,
  }) => {
    await open(page, 'outage');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'PickFrame Database path is not responding.',
    );
    const incident = page.locator('.incident').first();
    await expect(incident).toContainText('PickFrame Database path stopped responding');
    await expect(incident).toContainText('Ongoing');
    await page.getByRole('button', { name: /^Database path.*Not responding/ }).click();
    await expect(page.locator('#panel-pickframe-data')).toContainText(
      'Last problem: unexpected status 503',
    );
  });

  test('before the first check it says it is waiting and keeps the layout', async ({ page }) => {
    await open(page, 'fresh');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Waiting for the first check.',
    );
    await expect(page.getByText('History fills in as checks run.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^API.*No data yet/ })).toBeVisible();
    await expect(page.getByText('No incidents recorded yet.')).toBeVisible();
  });

  test('warns when the monitoring data itself is old', async ({ page }) => {
    await open(page, 'stale');
    await expect(page.getByRole('status')).toContainText(/Monitoring data is 2 hours/);
  });

  test('explains a failed load without claiming the services are down, then recovers', async ({
    page,
  }) => {
    let fail = true;
    const body = JSON.stringify(buildStatus('operational'));
    await page.route(DATA_URL_PATTERN, (route) =>
      fail
        ? route.abort()
        : route.fulfill({
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body,
          }),
    );
    await page.clock.setFixedTime(new Date(NOW.getTime() + 60_000));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Status data could not be loaded.',
    );
    await expect(page.getByText(/does not mean the services are down/)).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything is working.');
  });

  test('rejects data in an unknown format instead of rendering it', async ({ page }) => {
    await page.route(DATA_URL_PATTERN, (route) =>
      route.fulfill({
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '{"hello":1}',
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Status data could not be loaded.',
    );
  });
});

test.describe('motion', () => {
  test('develops the strips once, on the first render only', async ({ page }) => {
    await open(page, 'operational');
    await expect(page.locator('.film.is-developing').first()).toBeVisible();
    await page.getByRole('button', { name: 'ID' }).click();
    await expect(page.locator('.film.is-developing')).toHaveCount(0);
  });

  test('does not animate for people who prefer reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'operational');
    await expect(page.locator('.film.is-developing')).toHaveCount(0);
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('fits without sideways scrolling and draws fewer, wider frames', async ({ page }) => {
    await open(page, 'outage');
    await page.getByRole('button', { name: /^Database path/ }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('.service').first().locator('.frame')).toHaveCount(45);
  });
});

test.describe('accessibility', () => {
  const scenarios: Scenario[] = ['operational', 'degraded', 'outage', 'fresh', 'stale'];
  for (const scenario of scenarios) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${scenario} page in ${theme} theme has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await open(page, scenario);
        await page.locator('.service__toggle').first().click();
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
        ).toEqual([]);
      });
    }
  }
});
