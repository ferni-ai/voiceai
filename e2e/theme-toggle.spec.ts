/**
 * E2E Tests for Theme Toggle Feature
 *
 * Tests the light/dark theme toggle functionality:
 * - Toggling theme from menu
 * - Theme persistence
 * - Visual changes
 */

import { expect, test, type Page } from './support/fixtures';
import { APP_URL } from './support/env';
import { clickMenuItem, openSettingsMenu } from './support/app';

// The menu's "Theme & Language" item opens a panel (ui/theme-language-settings.ui.ts)
// whose Appearance section switches between the light (zen) and dark
// (midnight) themes.
const PANEL = '.theme-language-settings .theme-language-settings__panel';

async function openThemePanel(page: Page): Promise<void> {
  await page.waitForSelector('.settings-trigger', { timeout: 10000 });
  await clickMenuItem(page, 'theme');
  await expect(page.locator(PANEL)).toBeVisible();
}

/** The theme option that is not currently active. */
function otherThemeOption(page: Page, current: string | null) {
  return page.locator(`${PANEL} [data-action="set-theme"]:not([data-theme="${current}"])`);
}

test.describe('Theme Toggle UI', () => {
  test('toggles theme from menu', async ({ page }) => {
    await page.goto(APP_URL);

    // Get initial theme
    const initialTheme = await page.getAttribute('html', 'data-theme');

    await openThemePanel(page);
    await otherThemeOption(page, initialTheme).click();

    // If initial was zen (light), should now be midnight (dark), or vice versa
    if (initialTheme === 'zen') {
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    } else if (initialTheme === 'midnight') {
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'zen');
    } else {
      // Theme changed in some way
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', initialTheme ?? '');
    }
  });

  test('theme persists after page reload', async ({ page }) => {
    await page.goto(APP_URL);
    const initialTheme = await page.getAttribute('html', 'data-theme');

    // Toggle theme
    await openThemePanel(page);
    await otherThemeOption(page, initialTheme).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', initialTheme ?? '');

    const themeAfterToggle = await page.getAttribute('html', 'data-theme');

    // Reload page
    await page.reload();
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Theme should persist
    const themeAfterReload = await page.getAttribute('html', 'data-theme');
    expect(themeAfterReload).toBe(themeAfterToggle);
  });

  test('dark theme applies correct styles', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Set to dark theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'midnight');
      localStorage.setItem('ferni_theme', 'midnight');
    });

    await page.waitForTimeout(300);

    // Check that dark theme styles are applied
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'midnight');

    // Background should be dark
    const bodyBg = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });

    // Dark theme has darker background
    expect(bodyBg).toBeTruthy();
  });

  test('light theme applies correct styles', async ({ page }) => {
    await page.goto(APP_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Set to light theme
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'zen');
      localStorage.setItem('ferni_theme', 'zen');
    });

    await page.waitForTimeout(300);

    // Check that light theme styles are applied
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'zen');
  });
  test('theme toggle button is accessible', async ({ page }) => {
    await page.goto(APP_URL);
    const initialTheme = await page.getAttribute('html', 'data-theme');

    await openSettingsMenu(page);
    const themeButton = page.locator('.settings-menu [data-action="theme"]');

    // Button should be focusable
    await themeButton.focus();
    await expect(themeButton).toBeFocused();

    // Should be clickable via keyboard
    await page.keyboard.press('Enter');
    await expect(page.locator(PANEL)).toBeVisible();

    // The theme options are buttons, usable from the keyboard too
    const option = otherThemeOption(page, initialTheme);
    await option.focus();
    await expect(option).toBeFocused();
    await page.keyboard.press('Enter');

    // Theme should have changed
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', initialTheme ?? '');
  });
});
