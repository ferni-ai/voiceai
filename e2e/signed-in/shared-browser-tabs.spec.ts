/**
 * Two tabs on one shared browser: when one tab signs out or a different person
 * signs in, every other open tab starts over from the sign-in screen instead of
 * going on showing the last person's page.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, openSettingsMenu, signIn } from './support';

const GATE = '.sign-in-gate-overlay';

/** Marks this page load, so a later check can tell whether the page was rebuilt since. */
function markPageLoad(page: Page, mark: string): Promise<void> {
  return page.evaluate((value) => {
    (window as { pageLoadMark?: string }).pageLoadMark = value;
  }, mark);
}

async function whatTheTabShows(page: Page): Promise<{ mark: string | null; uid: string | null }> {
  return page.evaluate(async () => {
    const firebase = await import(/* @vite-ignore */ '/src/config/firebase.ts');
    return {
      mark: (window as { pageLoadMark?: string }).pageLoadMark ?? null,
      uid: firebase.getFirebaseAuth()?.currentUser?.uid ?? null,
    };
  });
}

async function openSecondTab(page: Page): Promise<Page> {
  const other = await page.context().newPage();
  await other.goto('/');
  await expectHome(other);
  await markPageLoad(other, 'first person');
  return other;
}

async function signOutFromMenu(page: Page): Promise<void> {
  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="sign-out"]').click();
  await expect(page.locator(GATE)).toBeVisible({ timeout: 30_000 });
}

test('signing out in one tab takes the other open tab to the sign-in screen', async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
  const otherTab = await openSecondTab(page);

  await signOutFromMenu(page);

  await expect(
    otherTab.locator(GATE),
    'the other tab still shows the signed-out person'
  ).toBeVisible({
    timeout: 5_000,
  });
});

test("a tab left open never goes on showing the last person's page once the next person signs in", async ({
  page,
}) => {
  await signIn(page, await createUser());
  await expectHome(page);
  const otherTab = await openSecondTab(page);
  await signOutFromMenu(page);

  const next = await createUser();
  await signIn(page, next);
  await expectHome(page);

  await expect
    .poll(async () => (await whatTheTabShows(otherTab)).uid, { timeout: 15_000 })
    .toBe(next.uid);
  expect(
    (await whatTheTabShows(otherTab)).mark,
    'the other tab kept the first person on screen after the next person signed in'
  ).toBeNull();
});

test('signing in from the sign-in screen, then a token refresh, loads the page once', async ({
  page,
}) => {
  let loads = 0;
  page.on('load', () => loads++);
  await signIn(page, await createUser());
  await expectHome(page);
  await page.evaluate(async () => {
    const firebase = await import(/* @vite-ignore */ '/src/config/firebase.ts');
    await firebase.getFirebaseAuth()?.currentUser?.getIdToken(true);
  });
  await page.waitForTimeout(3_000); // a reload, if one were coming, starts well inside this
  await expectHome(page);
  expect(loads).toBe(1);
});
