/**
 * axe over every menu panel (playwright.overlays.config.ts).
 *
 * 2026-10-18 UI audit: the menu panels had serious axe findings (aria-label on a
 * plain div, an unnamed nested dialog, scroll areas a keyboard can't reach). This
 * opens each menu row, light and dark, and asserts no serious or critical axe
 * violations inside the panel that opened.
 *
 * There is no API server here, so panels open in their empty or error states.
 *
 * A row whose panel never appears is a failure, not a pass: a panel that mounts
 * late or not at all would otherwise go unscanned while the run stayed green.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['zen', 'midnight'] as const;
/** Rows that leave the page or start something rather than opening a panel */
const NOT_PANELS = new Set(['sign-out', 'support-ferni']);
/**
 * Rows that open no panel here, so there is nothing to scan. With no API,
 * share-ferni can't load a link and openReferral shows a toast instead
 * (referral.ui.ts); menu-dialogs.spec.ts allows the same row to close without a
 * panel. Any other row that opens no panel fails this test.
 */
const NO_PANEL = new Set(['share-ferni']);
/** How long a row's panel may take to appear before the row counts as skipped */
const PANEL_TIMEOUT_MS = 15_000;
const BLOCKING = new Set(['serious', 'critical']);

async function openApp(page: Page, theme: string): Promise<void> {
  await page.addInitScript((th) => {
    try {
      localStorage.setItem('ferni_user_id', 'e2e-user');
      localStorage.setItem('ferni_theme', th);
      localStorage.setItem('voiceai-theme', th);
    } catch {
      /* private mode */
    }
  }, theme);
  await page.goto('/?e2e=1');
  await page.locator('.settings-trigger').waitFor({ state: 'attached' });
}

async function openRow(page: Page, action: string): Promise<void> {
  await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
  await page.evaluate((a) => {
    (document.querySelector(`.settings-menu [data-action="${a}"]`) as HTMLElement).click();
  }, action);
}

/** The topmost visible dialog, marked so axe can be scoped to it */
async function markOpenPanel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (
        !r.width ||
        !r.height ||
        r.right <= 0 ||
        r.left >= innerWidth ||
        r.bottom <= 0 ||
        r.top >= innerHeight
      )
        return false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05)
          return false;
        if (n.getAttribute('aria-hidden') === 'true') return false;
      }
      return true;
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(
      shown
    );
    const top = dialogs.pop();
    if (!top || top.closest('.mobile-bottom-sheet, .panel-loading-shell')) return false;
    top.setAttribute('data-axe-panel', '');
    return true;
  });
}

/**
 * Wait until the marked panel has loaded and nothing in it is mid-fade. With no API
 * here a panel's fetch fails, then it renders its fallback rows and staggers them in
 * (history: ~1.5 s to the demo rows, then 200 ms + 50 ms per row, then 300 ms). The
 * old fixed sleep let a slow runner scan those rows at ~70% opacity and report
 * contrast failures on colours nobody sees once the panel settles (#2391).
 * Looping animations (spinners) don't count. A panel that never finishes loading is
 * scanned as it is after the timeout, and the test records that it was.
 *
 * @returns false if the panel was still loading or moving at the timeout
 */
async function waitForPanelToSettle(page: Page): Promise<boolean> {
  return expect
    .poll(
      () =>
        page.evaluate(() => {
          const panel = document.querySelector('[data-axe-panel]');
          if (!panel) return true;
          const visible = (el: Element): boolean => el.getClientRects().length > 0;
          const loading = [
            ...panel.querySelectorAll('[aria-busy="true"], [class*="__loading"]'),
          ].some(visible);
          const moving = panel
            .getAnimations({ subtree: true })
            .some(
              (a) =>
                a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity
            );
          // a staggered row parked at opacity 0 whose fade hasn't started yet
          const waiting = [...panel.querySelectorAll<HTMLElement>('[style*="opacity"]')].some(
            (el) => el.style.opacity === '0'
          );
          return !loading && !moving && !waiting;
        }),
      { timeout: 6_000, intervals: [100, 150, 250] }
    )
    .toBe(true)
    .then(
      () => true,
      () => false
    );
}

for (const theme of THEMES) {
  test(`menu panels have no serious or critical axe violations (${theme})`, async ({ page }) => {
    test.setTimeout(300_000);
    await openApp(page, theme);
    await page.evaluate(() => (document.querySelector('.settings-trigger') as HTMLElement).click());
    const actions = (
      await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '.settings-menu .settings-menu__item[data-action]'
          ),
        ]
          .filter((el) => el.dataset.toggle !== 'true' && el.style.display !== 'none')
          .map((el) => el.dataset.action as string)
      )
    ).filter((a) => !NOT_PANELS.has(a));
    expect(actions.length).toBeGreaterThan(20);

    const findings: string[] = [];
    const scanned: string[] = [];
    const unsettled: string[] = [];
    const skipped: { action: string; reason: string }[] = [];
    for (const action of actions) {
      await openApp(page, theme);
      await openRow(page, action);
      // let the panel load (or fail to) and finish animating in
      const marked = await expect
        .poll(() => markOpenPanel(page), { timeout: PANEL_TIMEOUT_MS })
        .toBe(true)
        .then(
          () => true,
          () => false
        );
      if (!marked) {
        skipped.push({ action, reason: `no panel after ${PANEL_TIMEOUT_MS / 1000} s` });
        continue;
      }
      await page.waitForTimeout(800);
      if (!(await page.locator('[data-axe-panel]').count())) {
        skipped.push({ action, reason: 'panel closed before the scan' });
        continue;
      }
      if (!(await waitForPanelToSettle(page))) unsettled.push(action);
      const { violations } = await new AxeBuilder({ page }).include('[data-axe-panel]').analyze();
      for (const v of violations.filter((x) => BLOCKING.has(x.impact ?? ''))) {
        for (const node of v.nodes) {
          findings.push(
            `${action}: ${v.id} (${v.impact}) at ${node.target.join(' ')}: ${(node.any[0]?.message ?? '').slice(0, 140)}`
          );
        }
      }
      scanned.push(action);
    }

    const { annotations } = test.info();
    annotations.push({ type: 'panels scanned', description: scanned.join(', ') || 'none' });
    const describe = ({ action, reason }: { action: string; reason: string }) =>
      `${action} (${reason})`;
    if (skipped.length)
      annotations.push({ type: 'panels skipped', description: skipped.map(describe).join(', ') });
    if (unsettled.length)
      annotations.push({ type: 'scanned before settling', description: unsettled.join(', ') });

    const unexpectedSkips = skipped.filter((s) => !NO_PANEL.has(s.action)).map(describe);
    expect.soft(unexpectedSkips, `rows never scanned:\n${unexpectedSkips.join('\n')}`).toEqual([]);
    expect(findings, findings.join('\n')).toEqual([]);
  });
}
