/**
 * Overlay gallery checks (playwright.overlays.config.ts).
 *
 * Every gallery scene, light and dark, on a phone and a desktop viewport:
 * 1. Contrast: axe color-contrast plus the gallery probe (which sees text on
 *    gradients) may not exceed contrast-baseline.json (a ratchet: today's
 *    failures are recorded, new ones fail).
 * 2. A visual snapshot per scene and theme.
 * With the overlay-host flag on, the toast region must also stay inside the
 * viewport with even gutters, clear of Connect and the menu trigger, and in
 * the top layer.
 *
 * Refresh the contrast baseline after fixing violations (one worker, so the
 * file is written once per test in order):
 *   UPDATE_CONTRAST_BASELINE=1 pnpm exec playwright test -c playwright.overlays.config.ts --workers=1 -g contrast
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENES = [
  'toast-pair',
  'toast-error',
  'toast-warning',
  'notice-action',
  'achievement',
  'celebration',
  'milestone',
  'notification-card',
  'outreach',
  'offline-banner',
  'collision',
  'modal',
  'sheet',
  'toast-over-sheet',
  'permission',
  'action-confirmation',
  'call-notice',
  'command-palette',
  'coach-mark',
] as const;

const BASELINE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'contrast-baseline.json');
const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
const updating = process.env.UPDATE_CONTRAST_BASELINE === '1';

/** Wait until no finite animation or transition is still running (5 s cap). */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
      null,
      { timeout: 5_000 }
    )
    .catch(() => undefined);
}

async function openScene(page: Page, scene: string, flagOn = false): Promise<void> {
  await page.addInitScript(
    ([withAchievement, overlayHost]) => {
      try {
        // The first chat of the day unlocks Early Bird; keep it to the scenes that show it.
        if (!withAchievement)
          localStorage.setItem('ferni-last-interaction-date', new Date().toDateString());
        if (overlayHost) localStorage.setItem('ferni:flag:overlay-host', 'true');
        // The welcome tour is not a gallery scene; on a slow runner it opened mid-test.
        localStorage.setItem('ferni:onboarding:complete', 'true');
      } catch {
        // Storage unavailable: the scene still renders.
      }
    },
    [scene === 'achievement' || scene === 'collision', flagOn] as const
  );
  // Pin the wall clock: greetings, countdowns and time-of-day features must not
  // depend on when CI runs (a run between 00:00 and 05:00 showed Night Owl).
  await page.clock.setFixedTime(new Date('2026-10-12T14:00:00'));
  await page.goto(`/?e2e=1&gallery=overlays&scene=${scene}`);
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready,
    null,
    {
      timeout: 45_000,
    }
  );
  await page.waitForTimeout(600); // entrance transitions
  // Wait for the app shell to stop moving (late chips and badges shift it by a few px).
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => {
      const r = document.getElementById('connectBtn')?.getBoundingClientRect();
      return r ? `${r.x},${r.y},${r.width},${r.height}` : '';
    });
    if (now && now === last) break;
    last = now;
    await page.waitForTimeout(250);
  }
  // Let finite entrance animations and transitions finish (the busier the machine, the longer).
  await settleAnimations(page);
  // Freeze transitions from here on, so a theme switch can't be measured mid-fade.
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
}

/** Switch theme in place (the gallery keeps its overlays open). */
async function useTheme(page: Page, theme: 'zen' | 'midnight'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme === 'midnight' ? 'dark' : 'light' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  // A late entrance (a coach mark fading in) can still be running; measure it settled.
  await settleAnimations(page);
}

/**
 * Scenes whose overlays keep animating (sparkles, the avatar's stretch, several
 * arrivals at once) are contrast-checked but not pixel-compared: their frames
 * differ run to run on a busy runner.
 */
const NO_SNAPSHOT = new Set(['achievement', 'celebration', 'collision']);

/** Text that changes with the clock or animates, kept out of the pixel diff. */
const MASKS = ['.avatar-container', '.settings-menu__header-eyebrow', '.countdown-text'];

test('the spec covers every gallery scene', async ({ page }) => {
  await openScene(page, 'toast-pair');
  const scenes = await page.evaluate(
    () => (window as unknown as { __overlayGallery: { scenes: string[] } }).__overlayGallery.scenes
  );
  expect([...scenes].sort()).toEqual([...SCENES].sort());
});

for (const scene of SCENES) {
  test(`${scene}: contrast and snapshot`, async ({ page }, testInfo) => {
    await openScene(page, scene);
    for (const theme of ['zen', 'midnight'] as const) {
      await useTheme(page, theme);

      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      const failing = results.violations.flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
      );
      // axe skips text on gradients (Early Bird); the gallery probe resolves the first stop.
      const probe = await page.evaluate(() =>
        (
          window as unknown as {
            __overlayGallery: {
              probe(): { overlays: { selector: string; lowContrast: string[] }[] };
            };
          }
        ).__overlayGallery
          .probe()
          .overlays.flatMap((o) => o.lowContrast.map((c) => `${o.selector}: ${c}`))
      );
      failing.push(...probe.filter((p) => !failing.some((f) => f.includes(p))));
      const key = `${testInfo.project.name}/${scene}/${theme}`;
      if (updating) {
        const current: Record<string, number> = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
        current[key] = failing.length;
        writeFileSync(
          BASELINE_FILE,
          `${JSON.stringify(current, Object.keys(current).sort(), 2)}\n`
        );
      } else {
        expect(
          failing.length,
          `new contrast failures in ${key}:\n${failing.join('\n')}`
        ).toBeLessThanOrEqual(baseline[key] ?? 0);
      }

      if (NO_SNAPSHOT.has(scene)) continue;
      await expect(page).toHaveScreenshot(`${scene}-${theme}.png`, {
        mask: MASKS.map((s) => page.locator(s)),
      });
    }
  });
}

for (const scene of ['toast-pair', 'notice-action', 'toast-over-sheet'] as const) {
  test(`${scene}: toast region geometry with the overlay host on`, async ({ page }, testInfo) => {
    await openScene(page, scene, true);
    const g = await page.evaluate(() => {
      const box = (el: Element | null) => {
        if (!el || el.getClientRects().length === 0) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      };
      const region = document.querySelector('.ferni-toast-region');
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        open: region?.matches(':popover-open') ?? false,
        region: box(region),
        toasts: document.querySelectorAll('.ferni-toast').length,
        avoid: ['#connectBtn', '.mobile-menu-trigger']
          .map((s) => box(document.querySelector(s)))
          .filter(Boolean),
      };
    });
    const region = g.region;
    expect(g.open).toBe(true);
    expect(region).not.toBeNull();
    if (!region) return;

    const left = region.x;
    const right = g.vw - (region.x + region.w);
    expect(left).toBeGreaterThanOrEqual(15);
    expect(right).toBeGreaterThanOrEqual(15);
    expect(region.y + region.h).toBeLessThanOrEqual(g.vh / 2);
    if (testInfo.project.name === 'phone') {
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      expect(g.toasts).toBe(1);
    } else {
      expect(Math.round(right)).toBe(24);
      expect(g.toasts).toBeLessThanOrEqual(2);
    }
    for (const a of g.avoid) {
      if (!a) continue;
      const overlaps =
        region.x < a.x + a.w &&
        a.x < region.x + region.w &&
        region.y < a.y + a.h &&
        a.y < region.y + region.h;
      expect(overlaps).toBe(false);
    }
  });
}
