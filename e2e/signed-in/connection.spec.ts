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
  expect(
    await banner.evaluate((el) => el.inert),
    'the notice can be read and its button reached'
  ).toBe(false);
  await expect(banner.getByRole('button')).toBeVisible();

  await context.setOffline(false);
  // Online, the notice is not in the page at all: no "You're offline" alert for
  // screen readers, nothing in the tab order
  await expect(banner, 'removed once the connection is back').toHaveCount(0, { timeout: 15_000 });
  // Requests that failed while offline are expected; nothing should have crashed
  expect(problems.take().filter((p) => p.startsWith('pageerror'))).toEqual([]);
});

test('a probe answered at the moment of the drop still shows the notice', async ({
  page,
  context,
}) => {
  await signIn(page, await createUser());
  await expectHome(page);
  const banner = page.locator('.offline-banner');
  // 2026-10-19 nightly (#2180): the connectivity probe sent on the offline event
  // got a 200 (it raced the drop), the app stopped checking, and the notice
  // never showed. Answer the first probe, then let the rest fail as offline ones do.
  let probes = 0;
  await context.route('**/health/circuits', (route) =>
    probes++ === 0 ? route.fulfill({ status: 200 }) : route.abort('internetdisconnected')
  );

  await context.setOffline(true);
  await expect(banner).toHaveClass(/visible/, { timeout: 5_000 });
  expect(probes, 'the first probe answered, a later one decided').toBeGreaterThanOrEqual(2);
});
