/**
 * Visual Regression Tests for Design System
 *
 * Run with: npx playwright test design-system/tests/visual.test.ts
 *
 * Prerequisites:
 *   npm install -D @playwright/test
 *   npx playwright install
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3333';

test.describe('Design System Visual Tests', () => {
  test.beforeAll(async () => {
    // Note: Start the dev server before running tests
    // npm run design-system:dev
  });

  test('style guide - midnight theme', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Ensure midnight theme is active
    await page.click('[data-theme="midnight"]');
    await page.waitForTimeout(300); // Wait for transition

    // Take screenshot
    await expect(page).toHaveScreenshot('styleguide-midnight.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('style guide - zen theme', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Switch to zen theme
    await page.click('[data-theme="zen"]');
    await page.waitForTimeout(300);

    await expect(page).toHaveScreenshot('styleguide-zen.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('persona colors - all personas', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const personas = [
      'ferni',
      'jack-bogle',
      'peter-lynch',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
    ];

    for (const persona of personas) {
      await page.selectOption('#personaSelect', persona);
      await page.waitForTimeout(100);

      // Screenshot just the persona demo section
      const personaDemo = page.locator('.persona-demo');
      await expect(personaDemo).toHaveScreenshot(`persona-${persona}.png`);
    }
  });

  test('components render correctly', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Scroll to components section
    await page.locator('.component-grid').scrollIntoViewIfNeeded();

    await expect(page.locator('.component-grid')).toHaveScreenshot(
      'components.png'
    );
  });

  test('buttons have correct hover states', async ({ page }) => {
    await page.goto(BASE_URL);

    const primaryBtn = page.locator('.btn-primary').first();
    await primaryBtn.scrollIntoViewIfNeeded();

    // Normal state
    await expect(primaryBtn).toHaveScreenshot('btn-primary-normal.png');

    // Hover state
    await primaryBtn.hover();
    await page.waitForTimeout(200);
    await expect(primaryBtn).toHaveScreenshot('btn-primary-hover.png');
  });

  test('shadows render correctly in both themes', async ({ page }) => {
    await page.goto(BASE_URL);

    const shadowGrid = page.locator('.shadow-grid');
    await shadowGrid.scrollIntoViewIfNeeded();

    // Midnight shadows
    await page.click('[data-theme="midnight"]');
    await page.waitForTimeout(300);
    await expect(shadowGrid).toHaveScreenshot('shadows-midnight.png');

    // Zen shadows
    await page.click('[data-theme="zen"]');
    await page.waitForTimeout(300);
    await expect(shadowGrid).toHaveScreenshot('shadows-zen.png');
  });

  test('contrast ratios meet WCAG AA', async ({ page }) => {
    await page.goto(BASE_URL);

    // Scroll to accessibility section
    await page.locator('#contrastResults').scrollIntoViewIfNeeded();

    // Check that no "FAIL" badges exist
    const failBadges = page.locator('.contrast-fail');
    await expect(failBadges).toHaveCount(0);
  });
});
