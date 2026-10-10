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

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099';

/** Whether these credentials can still sign in, asked of the Auth emulator directly */
async function canSignIn(user: { email: string; password: string }): Promise<boolean> {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true }),
  });
  return res.ok;
}

async function deleteMyAccount(page: import('@playwright/test').Page, answer: 'accept' | 'dismiss') {
  page.once('dialog', (d) => void (answer === 'accept' ? d.accept() : d.dismiss()));
  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="export"]').click();
  await page.getByRole('button', { name: /delete my account/i }).click();
}

test('Delete my account, cancelled, keeps the account', async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await expectHome(page);
  await deleteMyAccount(page, 'dismiss');
  await page.waitForTimeout(1_500);
  expect(await canSignIn(user)).toBe(true);
  await page.reload();
  await expectHome(page);
});

test('Delete my account removes the account and leaves this browser signed out', async ({ page }) => {
  const user = await createUser();
  await signIn(page, user);
  await expectHome(page);
  const theirs = '{"e2e-marker":"this person\'s milestones"}';
  await page.evaluate((v) => localStorage.setItem('ferni-milestones', v), theirs);
  const problems = watchProblems(page);

  await deleteMyAccount(page, 'accept');
  await expect(page.locator(signInButtons).first(), 'back at the sign-in screen').toBeVisible({ timeout: 30_000 });
  expect(await canSignIn(user), 'the login itself is gone').toBe(false);
  // The app writes fresh defaults on load; what matters is that theirs are gone
  expect(await page.evaluate(() => localStorage.getItem('ferni-milestones')), 'nothing of theirs left here').not.toBe(theirs);
  expect(problems.take().filter((p) => p.startsWith('pageerror'))).toEqual([]);
});
