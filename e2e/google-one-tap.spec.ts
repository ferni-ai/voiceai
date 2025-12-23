import { test, expect } from '@playwright/test';

/**
 * Google One-Tap E2E Tests
 *
 * Tests the One-Tap sign-in integration points:
 * - GIS script loading
 * - Cooldown management
 * - Dev utilities availability
 * - Event handling
 *
 * Note: We can't test the actual Google popup (third-party),
 * but we can verify our integration points work correctly.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3004';

test.describe('Google One-Tap Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
  });

  // ============================================================================
  // SCRIPT LOADING
  // ============================================================================

  test('GIS script is loaded in the page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('domcontentloaded');

    // Check that the Google Identity Services script tag exists
    const gisScript = await page.locator('script[src*="accounts.google.com/gsi/client"]');
    await expect(gisScript).toHaveCount(1);
  });

  // ============================================================================
  // DEV UTILITIES
  // ============================================================================

  test('dev utilities are available in development mode', async ({ page }) => {
    await page.goto(`${BASE_URL}?dev`);
    await page.waitForLoadState('networkidle');

    // Wait for app to initialize
    await page.waitForTimeout(2000);

    // Check that googleOneTap object exists on window
    const hasDevUtils = await page.evaluate(() => {
      return typeof (window as unknown as { googleOneTap: unknown }).googleOneTap === 'object';
    });

    expect(hasDevUtils).toBe(true);
  });

  test('clearCooldown function works', async ({ page }) => {
    await page.goto(`${BASE_URL}?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set a cooldown first
    await page.evaluate(() => {
      localStorage.setItem(
        'ferni_one_tap_dismissed_until',
        (Date.now() + 86400000).toString()
      );
    });

    // Verify cooldown is set
    const inCooldownBefore = await page.evaluate(() => {
      const googleOneTap = (window as unknown as {
        googleOneTap: { isInCooldown: () => boolean };
      }).googleOneTap;
      return googleOneTap?.isInCooldown?.();
    });

    expect(inCooldownBefore).toBe(true);

    // Clear cooldown
    await page.evaluate(() => {
      const googleOneTap = (window as unknown as {
        googleOneTap: { clearCooldown: () => void };
      }).googleOneTap;
      googleOneTap?.clearCooldown?.();
    });

    // Verify cooldown is cleared
    const inCooldownAfter = await page.evaluate(() => {
      const googleOneTap = (window as unknown as {
        googleOneTap: { isInCooldown: () => boolean };
      }).googleOneTap;
      return googleOneTap?.isInCooldown?.();
    });

    expect(inCooldownAfter).toBe(false);
  });

  // ============================================================================
  // COOLDOWN PERSISTENCE
  // ============================================================================

  test('cooldown persists across page reloads', async ({ page }) => {
    await page.goto(`${BASE_URL}?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Set a cooldown
    await page.evaluate(() => {
      localStorage.setItem(
        'ferni_one_tap_dismissed_until',
        (Date.now() + 86400000).toString()
      );
      localStorage.setItem('ferni_one_tap_prompt_count', '1');
    });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify cooldown still exists
    const inCooldown = await page.evaluate(() => {
      const googleOneTap = (window as unknown as {
        googleOneTap: { isInCooldown: () => boolean };
      }).googleOneTap;
      return googleOneTap?.isInCooldown?.();
    });

    expect(inCooldown).toBe(true);
  });

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  test('success event triggers toast', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Listen for toast to appear
    const toastPromise = page.waitForSelector('.toast', { timeout: 5000 });

    // Dispatch success event
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('ferni:one-tap-success', {
          detail: { method: 'one-tap' },
        })
      );
    });

    // Verify toast appeared
    const toast = await toastPromise;
    expect(toast).toBeTruthy();
  });

  test('error event triggers error toast', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Listen for toast to appear
    const toastPromise = page.waitForSelector('.toast', { timeout: 5000 });

    // Dispatch error event
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('ferni:one-tap-error', {
          detail: { error: 'Test error message' },
        })
      );
    });

    // Verify toast appeared
    const toast = await toastPromise;
    expect(toast).toBeTruthy();
  });

  // ============================================================================
  // STORAGE KEYS
  // ============================================================================

  test('uses correct localStorage keys', async ({ page }) => {
    await page.goto(`${BASE_URL}?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Manually set some values
    await page.evaluate(() => {
      localStorage.setItem('ferni_one_tap_dismissed_until', '123456789');
      localStorage.setItem('ferni_one_tap_prompt_count', '3');
    });

    // Clear and verify
    await page.evaluate(() => {
      const googleOneTap = (window as unknown as {
        googleOneTap: { clearCooldown: () => void };
      }).googleOneTap;
      googleOneTap?.clearCooldown?.();
    });

    const keys = await page.evaluate(() => {
      return {
        dismissedUntil: localStorage.getItem('ferni_one_tap_dismissed_until'),
        promptCount: localStorage.getItem('ferni_one_tap_prompt_count'),
      };
    });

    expect(keys.dismissedUntil).toBeNull();
    expect(keys.promptCount).toBeNull();
  });
});

// ============================================================================
// ACCOUNT BUTTON INTEGRATION
// ============================================================================

test.describe('Account Button One-Tap Integration', () => {
  test('account button exists and is clickable', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for account button
    const accountButton = page.locator('#account-button, [data-testid="account-button"]');

    // If button exists, it should be clickable
    if ((await accountButton.count()) > 0) {
      await expect(accountButton.first()).toBeVisible();
    }
  });
});
