/**
 * Try-first on the sign-in gate, in a real browser, at phone width.
 *
 * The network is mocked: /demo-token never reaches a server, so this runs in CI
 * without secrets. A real LiveKit call can't run here, so the in-call and
 * end-of-call states are covered by src/ui/__tests__/try-first.test.ts; this
 * checks what a visitor sees and that the button asks for a demo room.
 *
 *   npx playwright test tests/e2e/try-first.spec.ts --project=chromium
 *
 * Set TRY_FIRST_SCREENSHOT=<path> to save the flag-on screen.
 */

import { expect, test, type Page } from '@playwright/test';

const PHONE = { width: 390, height: 844 };

async function openGate(page: Page, flag: 'true' | 'false'): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('ferni:flag:try-first', value);
  }, flag);
  await page.goto('/');
  await expect(page.locator('.sign-in-gate-overlay')).toBeVisible({ timeout: 20_000 });
}

// The app's service worker would answer /demo-token before page.route sees it.
test.use({ viewport: PHONE, isMobile: true, hasTouch: true, serviceWorkers: 'block' });

test('flag off: the gate is the sign-in wall it was', async ({ page }) => {
  await openGate(page, 'false');
  await expect(page.locator('[data-provider="google"]')).toBeVisible();
  // Apple sign-in is hidden on the web until VITE_APPLE_WEB_SIGNIN is on.
  await expect(page.locator('[data-provider="apple"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Talk to Ferni now' })).toHaveCount(0);
});

test('flag on: "Talk to Ferni now" leads, above sign-in, and fits a phone', async ({ page }) => {
  await openGate(page, 'true');
  const talk = page.getByRole('button', { name: 'Talk to Ferni now' });
  await expect(talk).toBeVisible();
  await expect(page.getByText('No account needed. Just say hello.')).toBeVisible();
  await expect(
    page.getByText('Say hello first. Sign in whenever you want to keep the conversation.')
  ).toBeVisible();

  const talkBox = (await talk.boundingBox())!;
  const googleBox = (await page.locator('[data-provider="google"]').boundingBox())!;
  expect(talkBox.y).toBeLessThan(googleBox.y);
  expect(talkBox.height).toBeGreaterThanOrEqual(44);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(PHONE.width);

  const shot = process.env.TRY_FIRST_SCREENSHOT;
  if (shot) await page.screenshot({ path: shot });
});

test('flag on: the button asks /demo-token for a room, and a used-up day says so', async ({
  page,
}) => {
  // Headless CI has no microphone: hand the page a silent stream instead.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () =>
      new AudioContext().createMediaStreamDestination().stream;
  });
  const asked: string[] = [];
  await page.route('**/demo-token**', async (route) => {
    asked.push(new URL(route.request().url()).search);
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'daily_limit', message: 'limit' }),
    });
  });
  await openGate(page, 'true');
  await page.getByRole('button', { name: 'Talk to Ferni now' }).click();

  await expect(
    page.getByText("That's all the free calls for today. Sign in to keep talking.")
  ).toBeVisible();
  expect(asked).toEqual(['?persona_id=ferni']);
  await expect(page.getByRole('button', { name: 'Talk to Ferni now' })).toBeHidden();
  await expect(page.locator('[data-provider="google"]')).toBeVisible();
});
