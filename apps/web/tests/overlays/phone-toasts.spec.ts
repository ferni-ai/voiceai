/**
 * Toasts on a notched phone (playwright.overlays.config.ts, phone project, Chromium).
 *
 * With the defaults prod builds with, a toast must never cover Connect, the
 * home buttons or the menu button, never cut its text short, never sit on
 * another toast, and stay clear of the status bar and a landscape notch.
 * Before the toast-region flag (src/ui/overlay/toast-flag.ts) the old
 * per-surface toasts did all four: a bottom pill over the home buttons, errors
 * clamped to two lines, the notification and outreach cards stacked at the
 * top, and the notification card under the status bar.
 *
 * Portrait 390x844 and landscape 844x390, light (zen) and dark (midnight),
 * with iPhone safe-area insets from Chromium's override.
 */

import { expect, test, type Page } from '@playwright/test';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const LAYOUTS = [
  { name: 'portrait', width: 390, height: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  {
    name: 'landscape',
    width: 844,
    height: 390,
    insets: { top: 0, bottom: 21, left: 47, right: 47 },
  },
] as const;

/** Scenes that show at least one toast, and the long one whose whole text must show. */
const SCENES = [
  'toast-pair',
  'toast-error',
  'toast-long',
  'notice-action',
  'notification-card',
  'outreach',
  'collision',
] as const;
const LONG_TAIL = 'Reconnect your calendar from Settings and try again.';

async function openScene(page: Page, scene: string, insets: Insets): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
  await page.addInitScript((withAchievement) => {
    try {
      if (!withAchievement)
        localStorage.setItem('ferni-last-interaction-date', new Date().toDateString());
      localStorage.setItem('ferni:onboarding:complete', 'true');
    } catch {
      // Storage unavailable: the scene still renders.
    }
  }, scene === 'collision');
  await page.clock.setFixedTime(new Date('2026-10-12T14:00:00'));
  await page.goto(`/?e2e=1&gallery=overlays&scene=${scene}`);
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready,
    null,
    { timeout: 45_000 }
  );
  await page.waitForTimeout(1_200); // entrance transitions
}

async function useTheme(page: Page, theme: 'zen' | 'midnight'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme === 'midnight' ? 'dark' : 'light' });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(400);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Measured {
  vw: number;
  vh: number;
  toasts: { name: string; box: Box; text: string; cut: string[] }[];
  controls: { name: string; box: Box }[];
}

/** Every toast on screen, old or new, and the controls a toast must keep clear of. */
async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const TOASTS = [
      '.ferni-toast',
      '.moments-container',
      '.notifications-container > *',
      '.proactive-outreach-container > *',
      '.achievement-notification',
      '.moment-celebration',
      '.ferni-milestone',
      '.connection-quality--visible',
    ].join(', ');
    const CONTROLS =
      '#connectBtn, .engagement-trigger-btn, .mobile-menu-trigger, .settings-trigger';
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        opacity *= Number(cs.opacity || 1);
      }
      return opacity > 0.05;
    };
    const box = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}`;
    const toastEls = [...document.querySelectorAll(TOASTS)].filter(
      (el) => shown(el) && (el.textContent ?? '').trim().length > 0
    );
    // A toast inside another (the region's item in its list) counts once, as the inner one.
    const outermost = toastEls.filter((el) => !toastEls.some((o) => o !== el && el.contains(o)));
    return {
      vw: innerWidth,
      vh: innerHeight,
      toasts: outermost.map((el) => ({
        name: name(el),
        box: box(el),
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
        // Text cut short: a clamped or ellipsised line has more content than room
        cut: [...el.querySelectorAll('*'), el]
          .filter((t) => [...t.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim()))
          .filter((t) => t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1)
          .map((t) => `${name(t)}: ${(t.textContent ?? '').trim().slice(0, 40)}`),
      })),
      controls: [...document.querySelectorAll(CONTROLS)]
        .filter(shown)
        .map((el) => ({ name: el.id || name(el), box: box(el) })),
    };
  });
}

const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

test.describe('toasts on a notched phone', () => {
  test.beforeEach(async ({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
    test.skip(browserName !== 'chromium', 'safe-area override is Chromium-only');
  });

  for (const layout of LAYOUTS) {
    test(`${layout.name} weak connection: shown in the status island, below the status bar`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: layout.width, height: layout.height });
      await openScene(page, 'weak-connection', layout.insets);
      for (const theme of ['zen', 'midnight'] as const) {
        await useTheme(page, theme);
        // Not the old corner pill, which sat under the status bar and on the toasts
        await expect(page.locator('.connection-quality--visible')).toHaveCount(0);
        const weak = page.locator('.status-island__connection[data-state="weak"]');
        await expect(weak).toBeVisible();
        const box = await weak.boundingBox();
        expect(box?.y ?? -1, `${layout.name} ${theme}: under the status bar`).toBeGreaterThanOrEqual(
          layout.insets.top
        );
      }
    });

    for (const scene of SCENES) {
      test(`${layout.name} ${scene}: clear of the controls, whole, not stacked, below the status bar`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: layout.width, height: layout.height });
        await openScene(page, scene, layout.insets);

        // Soft, so a failure reports every broken rule, not just the first
        for (const theme of ['zen', 'midnight'] as const) {
          await useTheme(page, theme);
          const m = await measure(page);
          const where = `${layout.name} ${theme}`;

          expect(m.toasts.length, `${where}: a toast is on screen`).toBeGreaterThan(0);
          for (const t of m.toasts) {
            for (const c of m.controls) {
              expect
                .soft(overlap(t.box, c.box), `${where}: ${t.name} covers ${c.name}`)
                .toBe(false);
            }
            expect.soft(t.cut, `${where}: ${t.name} cuts its text short`).toEqual([]);
            expect
              .soft(t.box.y, `${where}: ${t.name} is under the status bar`)
              .toBeGreaterThanOrEqual(layout.insets.top);
            expect
              .soft(t.box.x, `${where}: ${t.name} is under the left notch`)
              .toBeGreaterThanOrEqual(layout.insets.left);
            expect
              .soft(t.box.x + t.box.w, `${where}: ${t.name} is under the right notch`)
              .toBeLessThanOrEqual(m.vw - layout.insets.right);
            expect
              .soft(t.box.y + t.box.h, `${where}: ${t.name} runs off the screen`)
              .toBeLessThanOrEqual(m.vh);
          }
          for (let i = 0; i < m.toasts.length; i++) {
            for (let j = i + 1; j < m.toasts.length; j++) {
              const [a, b] = [m.toasts[i]!, m.toasts[j]!];
              expect
                .soft(overlap(a.box, b.box), `${where}: ${a.name} sits on ${b.name}`)
                .toBe(false);
            }
          }
          if (scene === 'toast-long') {
            expect
              .soft(
                m.toasts.some((t) => t.text.includes(LONG_TAIL)),
                `${where}: the long error shows what to do`
              )
              .toBe(true);
          }
        }
      });
    }
  }
});
