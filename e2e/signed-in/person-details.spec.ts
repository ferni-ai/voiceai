/**
 * A person's details: what you add is kept, what you clear is gone, and Add Notes
 * takes you to the notes.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  newPanel,
  openSettingsMenu,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

const PERSON = 'Priya Raman';

async function opens(page: Page, control: Locator, what: string) {
  const before = await shownDialogs(page);
  await control.click();
  return newPanel(page, before, what);
}

async function openCard(page: Page, add = false) {
  await openSettingsMenu(page);
  const people = await opens(
    page,
    page.locator('.settings-menu [data-action="contacts"]'),
    'contacts'
  );
  // Add on the first open only. After a reload the list loads late, so a count taken too early
  // reads 0 and added a second, identical person (CI: "resolved to 2 elements")
  if (add) {
    await people.locator('[data-action="add-person"]').click();
    const form = page.locator('.add-person-overlay.open');
    await form.getByPlaceholder('e.g., Mom, Sarah Chen, Dr. Rivera').fill(PERSON);
    await form.locator('[data-relationship="friend"]').click();
    await form.getByRole('button', { name: 'Add Person', exact: true }).click();
  }
  await expect(people.locator('.yp-person', { hasText: PERSON })).toHaveCount(1, { timeout: 10_000 });
  return opens(page, people.locator('.yp-person', { hasText: PERSON }), 'person card');
}

/** Edit the person: fill (or empty) the phone on Basic and the notes on Context, then save */
async function editDetails(page: Page, card: Locator, phone: string, notes: string) {
  const edit = await opens(page, card.locator('[data-action="edit"]'), 'edit');
  await edit.locator('#ep-phone').fill(phone);
  await edit.locator('.ep-tab[data-tab="context"]').click();
  await edit.locator('#ep-notes').fill(notes);
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().includes('/api/contacts/')
  );
  await edit.locator('#ep-save').click();
  expect((await saved).status()).toBe(200);
}

async function savedDetails(page: Page) {
  await page.reload();
  await expectHome(page);
  const card = await openCard(page);
  const edit = await opens(page, card.locator('[data-action="edit"]'), 'edit');
  const phone = await edit.locator('#ep-phone').inputValue();
  await edit.locator('.ep-tab[data-tab="context"]').click();
  return { phone, notes: await edit.locator('#ep-notes').inputValue() };
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('a phone and a note are kept, and once cleared they stay cleared', async ({ page }) => {
  const problems = watchProblems(page);
  await editDetails(page, await openCard(page, true), '+15555550123', 'Met at the climbing gym');
  expect(await savedDetails(page)).toEqual({
    phone: '+15555550123',
    notes: 'Met at the climbing gym',
  });

  await page.reload();
  await expectHome(page);
  await editDetails(page, await openCard(page), '', '');
  expect(await savedDetails(page), 'cleared, not brought back').toEqual({ phone: '', notes: '' });
  expect(problems.take()).toEqual([]);
});

test('Add Notes opens the notes', async ({ page }) => {
  const card = await openCard(page, true);
  await card.locator('.rc-tab[data-tab="notes"], .rc-tab', { hasText: 'Notes' }).first().click();
  const edit = await opens(page, card.locator('[data-action="edit-notes"]'), 'edit notes');
  await expect(edit.locator('#ep-notes')).toBeVisible();
  await expect(edit.locator('.ep-tab[data-tab="context"]')).toHaveClass(/active/);
});
