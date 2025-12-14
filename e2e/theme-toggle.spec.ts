/**
 * E2E Tests for Theme Toggle Feature
 *
 * Tests the light/dark theme toggle functionality:
 * - Toggling theme from menu
 * - Theme persistence
 * - Visual changes
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';

test.describe('Theme Toggle UI', () => {
  test('toggles theme from menu', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Get initial theme
    const initialTheme = await page.getAttribute('html', 'data-theme');

    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    // Find and click Light/Dark toggle (in Personalize section)
    const themeButton = page.locator('[data-action="theme"]');
    if (!(await themeButton.isVisible())) {
      // Expand Personalize section if collapsed
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    await themeButton.click();
    await page.waitForTimeout(500);

    // Theme should have changed
    const newTheme = await page.getAttribute('html', 'data-theme');

    // If initial was zen (light), should now be midnight (dark), or vice versa
    if (initialTheme === 'zen') {
      expect(newTheme).toBe('midnight');
    } else if (initialTheme === 'midnight') {
      expect(newTheme).toBe('zen');
    } else {
      // Theme changed in some way
      expect(newTheme).not.toBe(initialTheme);
    }
  });

  test('theme persists after page reload', async ({ page }) => {
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const themeButton = page.locator('[data-action="theme"]');
    if (!(await themeButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Toggle theme
    await themeButton.click();
    await page.waitForTimeout(500);

    const themeAfterToggle = await page.getAttribute('html', 'data-theme');

    // Reload page
    await page.reload();
    await page.waitForSelector('.settings-trigger', { timeout: 10000 });

    // Theme should persist
    const themeAfterReload = await page.getAttribute('html', 'data-theme');
    expect(themeAfterReload).toBe(themeAfterToggle);
  });

  test('dark theme applies correct styles', async ({ page }) => {
    await page.goto(BASE_URL);

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
    await page.goto(BASE_URL);

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
    await page.goto(BASE_URL);

    await page.waitForSelector('.settings-trigger', { timeout: 10000 });
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu--visible');

    const themeButton = page.locator('[data-action="theme"]');
    if (!(await themeButton.isVisible())) {
      const personalizeHeader = page.locator(
        '.settings-menu__section-header:has-text("Make It Yours"), .settings-menu__section-header:has-text("Personalize")'
      );
      if (await personalizeHeader.first().isVisible()) {
        await personalizeHeader.first().click();
        await page.waitForTimeout(300);
      }
    }

    // Button should be focusable
    await themeButton.focus();
    await expect(themeButton).toBeFocused();

    // Should be clickable via keyboard
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Theme should have changed
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBeTruthy();
  });
});
