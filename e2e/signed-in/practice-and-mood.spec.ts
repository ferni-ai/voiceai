/**
 * Starting a practice and setting a mood: each does something a person can see,
 * says so in their language, and points only at places that exist.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, isGone, newPanel, openSettingsMenu, shownDialogs, signIn, watchProblems } from './support';

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

test('the Sanctuary: starting a practice opens it, and Escape closes it', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openPanel(page, 'commands');
  const before = await shownDialogs(page);
  await panel.locator('[data-practice-id="gratitude"]').click();
  const practice = await newPanel(page, before, 'gratitude practice');
  await expect(practice).toHaveAccessibleName(/\S/);
  const id = (await practice.getAttribute('data-e2e-dialog')) as string;
  await page.keyboard.press('Escape');
  await expect.poll(() => isGone(page, id), { message: 'the practice did not close on Escape' }).toBe(true);
  expect(problems.take()).toEqual([]);
});

test('Set the Mood with nothing connected says so, in your language', async ({ page }) => {
  // Spanish, to prove the message is the app's own translation, not the server's English
  await page.evaluate(() => localStorage.setItem('ferni_locale', 'es'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es', { timeout: 30_000 });
  await expectHome(page);
  const spanish = JSON.parse(readFileSync(resolve('apps/web/src/i18n/locales/es.json'), 'utf8')).vibe.connectDevicesFirst as string;

  const panel = await openPanel(page, 'vibe-controller');
  await panel.locator('[data-preset="focus"]').first().click();
  await expect(page.getByText(spanish).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Your Home/)).toHaveCount(0); // a place that doesn't exist
});
