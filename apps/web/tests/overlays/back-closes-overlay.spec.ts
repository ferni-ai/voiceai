/**
 * Back closes what's open instead of leaving the app (playwright.overlays.config.ts, phone project).
 *
 * The Play app is a TWA, where Android's back gesture is history back. Nothing
 * in the app used the history API, so with the quick-actions sheet or the
 * settings menu open, back navigated away from the app and the panel never
 * closed. Each panel is opened with a real tap, as a person would.
 */

import { expect, test, type Page } from '@playwright/test';

async function openHome(page: Page): Promise<string> {
  await page.goto('/?e2e=1&gallery=overlays');
  await page.waitForFunction(
    () => (window as unknown as { __overlayGallery?: { ready: boolean } }).__overlayGallery?.ready,
    null,
    { timeout: 45_000 }
  );
  return page.url();
}

const sheetOpen = (page: Page) => page.locator('.mobile-bottom-sheet.open');

test.describe('back on a phone', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
  });

  test('back closes the quick-actions sheet and stays in the app', async ({ page }) => {
    const home = await openHome(page);
    await page.locator('.mobile-menu-trigger').click();
    // Fully slid in, as a person would see it before pressing back
    await expect(sheetOpen(page)).toBeInViewport({ ratio: 1 });

    await page.goBack();
    await expect(sheetOpen(page)).toHaveCount(0);
    expect(page.url()).toBe(home);
    await expect(page.locator('#connectBtn')).toBeVisible();
  });

  test('back closes the top panel first, then the one under it', async ({ page }) => {
    const home = await openHome(page);
    await page.locator('.mobile-menu-trigger').click();
    await page.locator('.mobile-bottom-sheet [data-action="settings"]').click();
    await expect(page.locator('.settings-menu--visible')).toBeInViewport({ ratio: 1 });

    await page.goBack();
    await expect(page.locator('.settings-menu--visible')).toHaveCount(0);
    expect(page.url()).toBe(home);
    await expect(page.locator('#connectBtn')).toBeVisible();
  });

  test('closing a panel by its own control leaves no extra back step', async ({ page }) => {
    const home = await openHome(page);
    const before = await page.evaluate(() => history.length);
    await page.locator('.mobile-menu-trigger').click();
    await expect(sheetOpen(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheetOpen(page)).toHaveCount(0);
    // The entry held while the sheet was open is popped again: back now leaves, as before
    await expect
      .poll(() =>
        page.evaluate(
          () => (history.state as { ferniOverlay?: boolean } | null)?.ferniOverlay ?? false
        )
      )
      .toBe(false);
    expect(await page.evaluate(() => history.length)).toBeGreaterThanOrEqual(before);
    expect(page.url()).toBe(home);
  });
});
