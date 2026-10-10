/**
 * First sign-in: who gets in, and what everyone else is told.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import { createUser, expectHome, signIn } from './support';

const waitlist = (page: import('@playwright/test').Page) => page.locator('.sign-in-gate-waitlist.visible');

test('a new, verified person lands on the home screen', async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
  await expect(waitlist(page)).toHaveCount(0);
});

test('an unverified email is asked to verify, not put on the waitlist', async ({ page }) => {
  await signIn(page, await createUser({ verified: false }));
  await expect(waitlist(page)).toContainText(/verify your email/i, { timeout: 20_000 });
  await expect(waitlist(page)).not.toContainText(/on the list/i);
});

test('a failing access check offers Retry, and Retry gets them in', async ({ page }) => {
  let failing = true;
  await page.route('**/api/waitlist/check**', (route) =>
    failing ? route.fulfill({ status: 500, body: '{}' }) : route.continue()
  );
  await signIn(page, await createUser());
  await expect(waitlist(page)).toContainText(/couldn.t check your access/i, { timeout: 30_000 });
  await expect(waitlist(page)).not.toContainText(/on the list/i);

  failing = false;
  await waitlist(page).getByRole('button', { name: /try again/i }).click();
  await expectHome(page);
});

test('signing in again and again never lands an approved user on the waitlist', async ({ browser }) => {
  test.setTimeout(240_000);
  const user = await createUser();
  // Eight loads in about a minute can spend this person's own request budget, and a
  // rate-limited check honestly says it couldn't check. It must never say "on the list".
  for (let i = 0; i < 8; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, user);
    const settled = page.locator('#connectBtn:visible, .sign-in-gate-waitlist.visible');
    await expect(settled.first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/on the list/i)).toHaveCount(0);
    await context.close();
  }
});
