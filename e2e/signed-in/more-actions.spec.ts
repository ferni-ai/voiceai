/**
 * More things a person does inside the app, checked for what actually happens:
 * the tour moves and ends, planting seeds spends them and sticks, and searching
 * your people finds them.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, newPanel, openSettingsMenu, shownDialogs, signIn, watchProblems } from './support';

async function openPanel(page: Page, action: string) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator(`.settings-menu [data-action="${action}"]`).click();
  return newPanel(page, before, action);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('the tour: Next moves on, Back returns, Skip ends it for good', async ({ page }) => {
  const problems = watchProblems(page);
  const tour = await openPanel(page, 'help');
  const first = await tour.textContent();
  await tour.locator('[data-action="next"]').click();
  await expect.poll(() => tour.textContent()).not.toBe(first);
  await tour.locator('[data-action="prev"], [data-action="back"]').first().click();
  await expect.poll(() => tour.textContent()).toBe(first);

  await tour.locator('[data-action="skip"]').click();
  await expect(page.locator('.onboarding--visible')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ferni:onboarding:complete'))).toBe('true');
  expect(problems.take()).toEqual([]);
});

test("what's coming: planting seeds spends them, and it sticks", async ({ page }) => {
  const problems = watchProblems(page);
  let panel = await openPanel(page, 'whats-growing');
  const balance = () => panel.locator('.roadmap-panel__seed-count, [class*="seed-balance"]').first().textContent();
  const before = Number((await balance())?.match(/\d+/)?.[0]);
  expect(before, 'a new account starts with seeds').toBeGreaterThan(0);

  await panel.locator('[data-feature-id]').first().click();
  await panel.locator('[data-action="plant-multiple"]').click();
  await expect.poll(async () => Number((await balance())?.match(/\d+/)?.[0]), { timeout: 10_000 }).toBe(before - 1);
  await page.keyboard.press('Escape');

  await page.reload();
  await expectHome(page);
  panel = await openPanel(page, 'whats-growing');
  await expect.poll(async () => Number((await balance())?.match(/\d+/)?.[0]), { message: 'kept after a reload' }).toBe(before - 1);
  expect(problems.take()).toEqual([]);
});

test('your people: search finds the person you typed', async ({ page }) => {
  const panel = await openPanel(page, 'contacts');
  for (const person of ['Priya Raman', 'Tomás Ortega']) {
    await panel.locator('[data-action="add-person"]').click();
    // The form open now; the previous one may still be fading out (and must not take this one with it)
    const form = page.locator('.add-person-overlay.open');
    await form.getByPlaceholder('e.g., Mom, Sarah Chen, Dr. Rivera').fill(person);
    await form.locator('[data-relationship="friend"]').click();
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(panel).toContainText(person, { timeout: 10_000 });
  }
  await panel.getByRole('searchbox').or(panel.locator('input[type="search"]')).first().fill('Tom');
  await expect(panel).toContainText('Tomás Ortega');
  await expect(panel).not.toContainText('Priya Raman');
});
