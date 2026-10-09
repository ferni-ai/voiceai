/**
 * Losing and regaining the connection: the app says it's offline, the message
 * can be read and acted on, and it goes away when the connection is back.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import { createUser, expectHome, signIn, watchProblems } from './support';

test('going offline shows a reachable notice; coming back clears it', async ({ page, context }) => {
  await signIn(page, await createUser());
  await expectHome(page);
  const problems = watchProblems(page);
  const banner = page.locator('.offline-banner');

  await context.setOffline(true);
  await expect(banner).toHaveClass(/visible/, { timeout: 10_000 });
  await expect(banner).toBeInViewport();
  expect(await banner.evaluate((el) => el.inert), 'the notice can be read and its button reached').toBe(false);
  await expect(banner.getByRole('button')).toBeVisible();

  await context.setOffline(false);
  await expect(banner).not.toHaveClass(/visible/, { timeout: 15_000 });
  expect(await banner.evaluate((el) => el.inert), 'hidden again, and out of reach').toBe(true);
  // Requests that failed while offline are expected; nothing should have crashed
  expect(problems.take().filter((p) => p.startsWith('pageerror'))).toEqual([]);
});
