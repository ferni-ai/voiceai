/**
 * Look & Feel: the theme and the language a person picks take effect, read
 * correctly (no raw keys, right-to-left where it should be), and survive a
 * reload.
 *
 * Needs the signed-in local stack (scripts/e2e/start-signed-in-stack.sh).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { expect, test, type Page } from '@playwright/test';
import { createUser, expectHome, openSettingsMenu, rawKeysOnScreen, signIn, watchProblems } from './support';

const LOCALES = ['en-GB', 'es', 'fr', 'de', 'ja', 'ko', 'zh-Hans', 'zh-Hant', 'ar', 'he'];
const RTL = new Set(['ar', 'he']);

/** A menu label as that locale's own file spells it */
function menuLabel(locale: string): string {
  const file = resolve('apps/web/src/i18n/locales', `${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).menu.items.takeTour as string;
}

async function openLookAndFeel(page: Page) {
  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="theme"]').click();
  const panel = page.locator('.theme-language-settings--visible');
  await expect(panel).toBeVisible();
  return panel;
}

test.beforeEach(async ({ page }) => {
  await signIn(page, await createUser());
  await expectHome(page);
});

test('a chosen theme applies and survives a reload', async ({ page }) => {
  const problems = watchProblems(page);
  const panel = await openLookAndFeel(page);
  const night = panel.locator('[data-action="set-theme"][data-theme="midnight"]');
  await night.click();
  await expect(night).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');

  await page.reload();
  await expectHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
  expect(problems.take()).toEqual([]);
});

for (const locale of LOCALES) {
  test(`in ${locale}, the app reads in that language and stays in it`, async ({ page }) => {
    const problems = watchProblems(page);
    const panel = await openLookAndFeel(page);
    await panel.locator(`[data-action="set-language"][data-locale="${locale}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale, { timeout: 10_000 });
    await expect(page.locator('html')).toHaveAttribute('dir', RTL.has(locale) ? 'rtl' : 'ltr');

    await page.reload();
    await expect(page.locator('html'), 'language survives a reload').toHaveAttribute('lang', locale, {
      timeout: 30_000,
    });
    await expect(page.locator('#connectBtn')).toBeVisible({ timeout: 30_000 });
    expect(await rawKeysOnScreen(page), 'raw keys on home').toEqual([]);

    await openSettingsMenu(page);
    await expect(page.locator('.settings-menu')).toContainText(menuLabel(locale));
    expect(await rawKeysOnScreen(page), 'raw keys in the settings menu').toEqual([]);
    expect(problems.take()).toEqual([]);
  });
}
