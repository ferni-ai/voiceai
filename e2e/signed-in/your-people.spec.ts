/**
 * Your People with someone in it: who needs attention, what Escape closes, and what's
 * really a button. Each test adds a person first.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  openSettingsMenu,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

const PERSON = 'Priya Raman';

async function openPeople(page: Page) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="contacts"]').click();
  return newPanel(page, before, 'contacts');
}

async function addPerson(page: Page, people: Locator) {
  await people.locator('[data-action="add-person"]').click();
  const form = page.locator('.add-person-overlay.open');
  await form.getByPlaceholder('e.g., Mom, Sarah Chen, Dr. Rivera').fill(PERSON);
  await form.locator('[data-relationship="friend"]').click();
  await form.getByRole('button', { name: 'Add Person', exact: true }).click();
  await expect(people.locator('.yp-person', { hasText: PERSON })).toBeVisible({ timeout: 10_000 });
}

/** Open a dialog from a control and return it */
async function opens(page: Page, control: Locator, what: string) {
  const before = await shownDialogs(page);
  await control.click();
  const dialog = await newPanel(page, before, what);
  return { dialog, id: (await dialog.getAttribute('data-e2e-dialog')) as string };
}

/** role="button" elements nested in, or wrapped around, a real control */
const fakeButtons = (scope: Locator) =>
  scope.evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>('[role="button"]')]
      .filter(
        (el) =>
          el.parentElement?.closest('button, a[href]') || el.querySelector('button, a[href], input')
      )
      .map((el) => el.className)
  );

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('someone you just added is not flagged as needing attention', async ({ page }) => {
  const problems = watchProblems(page);
  await addPerson(page, await openPeople(page));
  await page.reload();
  await expectHome(page);
  // The nudges arrive separately: wait for them, so their absence means something
  const nudges = page.waitForResponse((r) => r.url().includes('/api/contacts/nudges'));
  const people = await openPeople(page);
  expect((await nudges).status()).toBe(200);
  await expect(people.locator('.yp-person', { hasText: PERSON })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(
    people.locator('.yp-nudge', { hasText: PERSON }),
    'added today, so not overdue'
  ).toHaveCount(0);
  expect(problems.take()).toEqual([]);
});

test('Escape closes only the dialog on top', async ({ page }) => {
  const problems = watchProblems(page);
  const people = await openPeople(page);
  await addPerson(page, people);
  const card = await opens(page, people.locator('.yp-person', { hasText: PERSON }), 'person card');
  const moment = await opens(page, card.dialog.locator('[data-action="record"]'), 'log a moment');

  await page.keyboard.press('Escape');
  await expect.poll(() => isGone(page, moment.id), { message: 'Log a Moment closed' }).toBe(true);
  await page.waitForTimeout(500);
  expect(await isGone(page, card.id), 'the person card is still open under it').toBe(false);

  await page.keyboard.press('Escape');
  await expect.poll(() => isGone(page, card.id), { message: 'then the card closes' }).toBe(true);
  expect(problems.take()).toEqual([]);
});

test('no fake buttons in Your People or a person card', async ({ page }) => {
  const people = await openPeople(page);
  await addPerson(page, people);
  expect(await fakeButtons(people), 'Your People').toEqual([]);
  const card = await opens(page, people.locator('.yp-person', { hasText: PERSON }), 'person card');
  await page.waitForTimeout(800);
  expect(await fakeButtons(card.dialog), 'person card').toEqual([]);
});
