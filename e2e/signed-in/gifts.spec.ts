/**
 * Record a Gift: a gift you record is saved and listed on the person's card, and still
 * there after a reload.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, openSettingsMenu, shownDialogs, signIn, watchProblems } from './support';

const PERSON = 'Priya Raman';
const GIFT = 'A climbing chalk bag';

async function opens(page: Page, control: Locator, what: string) {
  const before = await shownDialogs(page);
  await control.click();
  return newPanel(page, before, what);
}

async function openGifts(page: Page) {
  await openSettingsMenu(page);
  const people = await opens(page, page.locator('.settings-menu [data-action="contacts"]'), 'contacts');
  if (!(await people.locator('.yp-person', { hasText: PERSON }).count())) {
    await people.locator('[data-action="add-person"]').click();
    const form = page.locator('.add-person-overlay.open');
    await form.getByPlaceholder('e.g., Mom, Sarah Chen, Dr. Rivera').fill(PERSON);
    await form.locator('[data-relationship="friend"]').click();
    await form.getByRole('button', { name: 'Add Person', exact: true }).click();
  }
  const card = await opens(page, people.locator('.yp-person', { hasText: PERSON }), 'person card');
  await card.locator('.rc-tab[data-tab="gifts"]').click();
  return card;
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('a recorded gift is saved, listed, and kept after a reload', async ({ page }) => {
  const problems = watchProblems(page);
  let card = await openGifts(page);
  const gift = await opens(page, card.locator('[data-action="add-gift"]').first(), 'record a gift');
  await gift.locator('#rg-item').fill(GIFT);
  await gift.locator('#rg-date').fill('2026-09-30');
  await gift.locator('.rg-reaction', { hasText: 'Loved it' }).click();
  const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/gifts'));
  await gift.locator('#rg-save').click();
  expect((await saved).status(), 'the gift was saved').toBe(201);
  await expect(card).toContainText(GIFT, { timeout: 10_000 });

  await page.reload();
  await expectHome(page);
  card = await openGifts(page);
  await expect(card, 'kept after a reload').toContainText(GIFT, { timeout: 10_000 });
  expect(problems.take()).toEqual([]);
});
