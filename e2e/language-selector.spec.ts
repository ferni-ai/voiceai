/**
 * E2E Tests for Language Selector Feature
 *
 * Tests the language/locale selection functionality:
 * - Opening language selector
 * - Changing language
 * - Language persistence
 * - RTL support
 */

import { expect, test, type Page } from './support/fixtures';
import { APP_URL } from './support/env';
import { clickMenuItem } from './support/app';

// Language lives in the Theme & Language panel (ui/theme-language-settings.ui.ts),
// opened from the menu's "Theme & Language" item.
const PANEL = '.theme-language-settings .theme-language-settings__panel';

async function openThemeLanguage(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await clickMenuItem(page, 'theme');
  await expect(page.locator(PANEL)).toBeVisible();
}

test.describe('Language Selector UI', () => {
  test('opens language selector from menu', async ({ page }) => {
    await openThemeLanguage(page);

    // Language list should be visible
    const languageList = page.locator(`${PANEL} .theme-language-settings__languages[role="listbox"]`);
    await expect(languageList).toBeVisible();
  });

  test('displays available languages', async ({ page }) => {
    await openThemeLanguage(page);

    // Should show multiple language options
    const languageOptions = page.locator(`${PANEL} .theme-language-settings__language-option`);
    const count = await languageOptions.count();
    expect(count).toBeGreaterThan(1);
  });

  test('shows current language with checkmark', async ({ page }) => {
    await openThemeLanguage(page);

    // Active language should have checkmark
    const activeOption = page.locator(`${PANEL} .theme-language-settings__language-option--active`);
    await expect(activeOption).toBeVisible();
    await expect(activeOption).toHaveAttribute('aria-selected', 'true');

    const checkmark = activeOption.locator('.theme-language-settings__language-check');
    await expect(checkmark).toBeVisible();
  });

  test('changes language when option clicked', async ({ page }) => {
    await openThemeLanguage(page);

    // Get current language
    const currentOption = page.locator(`${PANEL} .theme-language-settings__language-option--active`);
    const currentLocale = await currentOption.getAttribute('data-locale');

    // Pick a different language
    const otherOption = page
      .locator(`${PANEL} .theme-language-settings__language-option:not([data-locale="${currentLocale}"])`)
      .first();
    const newLocale = await otherOption.getAttribute('data-locale');
    expect(newLocale).toBeTruthy();

    // Changing the locale reloads the app
    await Promise.all([page.waitForEvent('load'), otherOption.click()]);
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // HTML lang attribute should update
    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe(newLocale);
  });

  test('language persists after page reload', async ({ page }) => {
    await page.goto(APP_URL);

    // Set language via localStorage
    await page.evaluate(() => {
      localStorage.setItem('ferni_locale', 'es');
    });

    await page.reload();
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Check HTML lang attribute
    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('es');
  });

  test('RTL languages set correct direction', async ({ page }) => {
    await page.goto(APP_URL);

    // Set Arabic language
    await page.evaluate(() => {
      localStorage.setItem('ferni_locale', 'ar');
    });

    await page.reload();
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // HTML dir should be rtl
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');
  });

  test('Hebrew language sets RTL direction', async ({ page }) => {
    await page.goto(APP_URL);

    // Set Hebrew language
    await page.evaluate(() => {
      localStorage.setItem('ferni_locale', 'he');
    });

    await page.reload();
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // HTML dir should be rtl
    const htmlDir = await page.getAttribute('html', 'dir');
    expect(htmlDir).toBe('rtl');
  });

  test('language selector shows flag emoji', async ({ page }) => {
    await openThemeLanguage(page);

    // Current language flag should be visible
    const currentFlag = page.locator(
      `${PANEL} .theme-language-settings__language-option--active .theme-language-settings__language-flag`
    );
    await expect(currentFlag).toBeVisible();

    // Flag should contain emoji
    const flagText = await currentFlag.textContent();
    expect(flagText).toBeTruthy();
  });
});
