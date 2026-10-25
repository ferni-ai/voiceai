/**
 * The app shell fits a notched phone (playwright.overlays.config.ts, phone project).
 *
 * <html> used to be padded by the safe-area insets while #app was a full
 * 100dvh tall inside it, and html/body don't scroll. So #app started one inset
 * down, ran off the bottom of the screen, and nothing could be scrolled to: on
 * a 390x844 iPhone the home buttons sat under the home indicator, a failed
 * Connect pushed them off the screen, and in landscape everything below 390 px
 * (the home buttons, the helper line) could not be reached at all.
 *
 * The insets come from Chromium's safe-area override, so this runs on Chromium only.
 */

import { expect, test, type Page } from '@playwright/test';

interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const PORTRAIT: Insets = { top: 47, bottom: 34, left: 0, right: 0 }; // iPhone 15
const LANDSCAPE: Insets = { top: 0, bottom: 21, left: 47, right: 47 };

async function setInsets(page: Page, insets: Insets): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never);
}

/** Opens a gallery scene; `call-notice` is a failed Connect, the tallest home state. */
async function openScene(page: Page, scene: string): Promise<void> {
  await page.goto(`/?e2e=1&gallery=overlays&scene=${scene}`);
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready,
    null,
    { timeout: 45_000 }
  );
}

/** Scroll the page the way a person can (only containers that scroll), then measure each control. */
async function controlsAfterScrollingToEnd(page: Page) {
  return page.evaluate(() => {
    const app = document.getElementById('app') as HTMLElement;
    const style = getComputedStyle(app);
    const scrolls = /(auto|scroll)/.test(style.overflowY) && app.scrollHeight > app.clientHeight;
    if (scrolls) app.scrollTop = app.scrollHeight;
    const appBox = app.getBoundingClientRect();
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        '#connectBtn, .engagement-trigger-btn, .call-status button'
      ),
    ]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: el.id || el.className,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
        };
      });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      app: {
        top: Math.round(appBox.top),
        bottom: Math.round(appBox.bottom),
        right: Math.round(appBox.right),
      },
      controls,
    };
  });
}

test.describe('app shell on a notched phone', () => {
  test.beforeEach(async ({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
    test.skip(browserName !== 'chromium', 'safe-area override is Chromium-only');
  });

  test('portrait: the app fills the screen and every home control clears the home indicator', async ({
    page,
  }) => {
    await setInsets(page, PORTRAIT);
    await openScene(page, 'call-notice');
    const m = await controlsAfterScrollingToEnd(page);

    expect(m.app.top, 'the app starts at the top of the screen').toBe(0);
    expect(m.app.bottom, 'the app ends at the bottom of the screen').toBeLessThanOrEqual(
      m.viewport.height
    );
    expect(m.controls.length).toBeGreaterThanOrEqual(4);
    for (const c of m.controls) {
      expect(c.bottom, `${c.name} is above the home indicator`).toBeLessThanOrEqual(
        m.viewport.height - PORTRAIT.bottom
      );
    }
  });

  test('landscape: everything below the fold can be scrolled to', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await setInsets(page, LANDSCAPE);
    await openScene(page, 'call-notice');
    const m = await controlsAfterScrollingToEnd(page);

    expect(m.app.right, 'the app is no wider than the screen').toBeLessThanOrEqual(
      m.viewport.width
    );
    expect(m.controls.length).toBeGreaterThanOrEqual(4);
    for (const c of m.controls) {
      expect(c.bottom, `${c.name} can be reached`).toBeLessThanOrEqual(m.viewport.height);
    }
  });
});
