/**
 * Chip In (VITE_VENMO_CHIP_IN with a handle, on in prod): while Ferni is free the
 * menu's footer offers Chip In instead of "Your Contribution", and it opens the
 * Venmo card ready to use. The walk's handle is a placeholder
 * (scripts/ci/prod-web-flags.mjs), never prod's.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { expect, test } from '@playwright/test';
import {
  createUser,
  expectHome,
  isGone,
  newPanel,
  openSettingsMenu,
  rawKeysOnScreen,
  shownDialogs,
  signIn,
  watchProblems,
} from './support';

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('chip in: the menu offers Chip In, not Your Contribution, and the card is ready', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await openSettingsMenu(page);
  await expect(page.locator('.settings-menu [data-action="billing"]')).toHaveCount(0);
  const before = await shownDialogs(page);
  await page.locator('.settings-menu [data-action="support-ferni"]').click();

  const card = await newPanel(page, before, 'support-ferni');
  await expect(card.locator('h2')).toHaveText('A dollar keeps the conversation going');
  await expect(card.locator('.vci-handle')).toHaveText('@ferni-e2e-placeholder');
  await expect(card.locator('a.vci-open')).toHaveAttribute(
    'href',
    /venmo\.com\/.*ferni-e2e-placeholder/
  );
  await expect(card.locator('.vci-later')).toBeFocused(); // never a pay button first
  expect(await rawKeysOnScreen(page), 'raw i18n keys on screen').toEqual([]);

  const id = (await card.getAttribute('data-e2e-dialog')) as string;
  await page.keyboard.press('Escape');
  await expect
    .poll(() => isGone(page, id), { message: 'did not close on Escape', timeout: 5_000 })
    .toBe(true);
  expect(problems.take()).toEqual([]);
});
