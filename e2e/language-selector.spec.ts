/**
 * E2E Tests for Language Selector Feature
 *
 * Tests the language/locale selection functionality:
 * - Opening language selector
 * - Changing language
 * - Language persistence
 * - RTL support
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';

test.describe('Language Selector UI', () => {
  test('opens language selector from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Language toggle (in Personalize section)
    const languageButton = page.locator('[data-action="toggle-language"]');
    if (!(await languageButton.isVisible())) {
      // Expand Personalize section if collapsed
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await languageButton.click();
    await page.waitForTimeout(300);

    // Language list should be visible
    const languageList = page.locator('.settings-menu__language-list[data-expanded="true"]');
    await expect(languageList).toBeVisible();
  });

  test('displays available languages', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const languageButton = page.locator('[data-action="toggle-language"]');
    if (!(await languageButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await languageButton.click();
    await page.waitForTimeout(300);

    // Should show multiple language options
    const languageOptions = page.locator('.settings-menu__language-option');
    const count = await languageOptions.count();
    expect(count).toBeGreaterThan(1);
  });

  test('shows current language with checkmark', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const languageButton = page.locator('[data-action="toggle-language"]');
    if (!(await languageButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await languageButton.click();
    await page.waitForTimeout(300);

    // Active language should have checkmark
    const activeOption = page.locator('.settings-menu__language-option--active');
    await expect(activeOption).toBeVisible();

    const checkmark = activeOption.locator('.settings-menu__language-check');
    await expect(checkmark).toBeVisible();
  });

  test('changes language when option clicked', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const languageButton = page.locator('[data-action="toggle-language"]');
    if (!(await languageButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await languageButton.click();
    await page.waitForTimeout(300);

    // Get current language
    const currentOption = page.locator('.settings-menu__language-option--active');
    const currentLocale = await currentOption.getAttribute('data-locale');

    // Find a different language option
    const otherOptions = page.locator(
      `.settings-menu__language-option:not([data-locale="${currentLocale}"])`
    );
    if ((await otherOptions.count()) > 0) {
      const newLocale = await otherOptions.first().getAttribute('data-locale');
      await otherOptions.first().click();

      await page.waitForTimeout(500);

      // Menu should re-render with new language
      await page.click('.settings-trigger');
      await page.waitForSelector('.settings-menu--visible');

      // HTML lang attribute should update
      const htmlLang = await page.getAttribute('html', 'lang');
      expect(htmlLang).toBe(newLocale);
    }
  });

  test('language persists after page reload', async ({ page }) => {
    await page.goto(BASE_URL);

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
    await page.goto(BASE_URL);

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
    await page.goto(BASE_URL);

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
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const languageButton = page.locator('[data-action="toggle-language"]');
    if (!(await languageButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Current language flag should be visible
    const currentFlag = languageButton.locator('.settings-menu__language-flag');
    await expect(currentFlag).toBeVisible();

    // Flag should contain emoji
    const flagText = await currentFlag.textContent();
    expect(flagText).toBeTruthy();
  });
});
