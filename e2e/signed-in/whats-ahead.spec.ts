/**
 * What's Ahead: an intention checked off is saved, and unchecking it is saved too.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  createUser,
  expectHome,
  newPanel,
  openSettingsMenu,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

async function openWhatsAhead(page: Page) {
  await openSettingsMenu(page);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="calendar-settings"]').click();
  return newPanel(page, before, 'calendar-settings');
}

/** Click the box and wait until the server has answered */
async function toggle(page: Page, box: ReturnType<Page['locator']>) {
  const saved = page.waitForResponse((r) => /\/intentions\/[^/]+\/complete$/.test(r.url()));
  await box.click();
  expect((await saved).status(), 'the server saved it').toBe(200);
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('an intention checked off stays done, and unchecking it sticks too', async ({ page }) => {
  const problems = watchProblems(page);
  let panel = await openWhatsAhead(page);
  const boxes = panel.locator('input[data-intention-id]');
  await expect(boxes.first()).toBeVisible();
  await expect(boxes.first(), 'a new account has done nothing yet').not.toBeChecked();
  const name = (await boxes.nth(1).getAttribute('aria-label')) ?? '';

  await toggle(page, boxes.nth(1));
  await page.keyboard.press('Escape');
  await page.reload();
  await expectHome(page);
  panel = await openWhatsAhead(page);
  const box = panel.getByRole('checkbox', { name });
  await expect(box, 'kept after a reload').toBeChecked();
  await expect(
    panel.locator('input[data-intention-id]').first(),
    'only that one'
  ).not.toBeChecked();

  await toggle(page, box);
  await page.keyboard.press('Escape');
  await page.reload();
  await expectHome(page);
  panel = await openWhatsAhead(page);
  await expect(panel.getByRole('checkbox', { name }), 'unchecked after a reload').not.toBeChecked();
  expect(problems.take()).toEqual([]);
});
