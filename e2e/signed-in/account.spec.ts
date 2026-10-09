/**
 * Your account on this browser: signing out from the settings menu ends the
 * session, leaves nothing of yours behind, and survives a reload.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import { createUser, expectHome, openSettingsMenu, signIn, watchProblems } from './support';

const signInButtons = '[data-provider="google"], [data-provider="emulator"]';

test('Sign Out ends the session and leaves this browser clean', async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
  // Something of this person's under each key prefix the app uses
  const personal = ['ferni_relationship', 'ferni:onboarding:complete', 'ferni-milestones'];
  await page.evaluate((keys) => keys.forEach((k) => localStorage.setItem(k, localStorage.getItem(k) ?? '{}')), personal);
  const problems = watchProblems(page);

  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="sign-out"]').click();

  await expect(page.locator(signInButtons).first()).toBeVisible({ timeout: 30_000 });
  const leftovers = await page.evaluate((keys) => keys.filter((k) => localStorage.getItem(k) !== null), personal);
  expect(leftovers, 'data left behind for the next person on this browser').toEqual([]);

  await page.reload();
  await expect(page.locator(signInButtons).first(), 'still signed out after a reload').toBeVisible({
    timeout: 30_000,
  });
  // The sign-in screen is what's in front, not the app underneath it
  expect(
    await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('.sign-in-gate-overlay'))
  ).toBe(true);
  expect(problems.take().filter((p) => p.startsWith('pageerror'))).toEqual([]);
});

test('signed out, the keyboard reaches only the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(signInButtons).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sign-in-gate-overlay')).toHaveAttribute('aria-modal', 'true');
  const behind: string[] = [];
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || el.closest('.sign-in-gate-overlay')) return null;
      return `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
    });
    if (where && !behind.includes(where)) behind.push(where);
  }
  expect(behind, 'reachable behind the sign-in screen').toEqual([]);
});
