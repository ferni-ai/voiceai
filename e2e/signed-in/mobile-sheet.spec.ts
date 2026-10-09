/**
 * On phones the settings button gives way to a quick-actions sheet. Each action
 * must open its screen without errors, and Escape must close it.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  rawKeysOnScreen,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

/** data-action of each row in the mobile sheet (apps/web/src/ui/mobile-bottom-sheet.ui.ts) */
const ACTIONS = ['settings', 'team', 'music', 'calendar', 'history', 'people', 'insights'];

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
  test.skip(!(await page.locator('.mobile-menu-trigger').isVisible()), 'phone layout only');
});

for (const action of ACTIONS) {
  test(`quick action "${action}" opens and closes cleanly`, async ({ page }) => {
    const problems = watchProblems(page);
    await page.locator('.mobile-menu-trigger').click();
    const row = page.locator(`.mobile-bottom-sheet [data-action="${action}"]`);
    await expect(row).toBeVisible();
    const before = await shownDialogs(page);
    await row.click();

    if (action === 'settings') {
      // The settings menu itself; the walk covers what it opens
      await expect(page.locator('.settings-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.settings-menu')).toBeHidden({ timeout: 5_000 });
      expect(problems.take(), 'settings raised problems').toEqual([]);
      return;
    }
    const panel = await newPanel(page, before, action);
    const id = (await panel.getAttribute('data-e2e-dialog')) as string;
    await page.waitForTimeout(1_500); // let the screen load its data
    expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => isGone(page, id), { message: `${action} did not close on Escape`, timeout: 5_000 })
      .toBe(true);
    expect(problems.take(), `${action} raised problems`).toEqual([]);
  });
}
