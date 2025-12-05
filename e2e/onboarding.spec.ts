import { test, expect } from '@playwright/test';

/**
 * Onboarding Flow E2E Tests
 * 
 * Tests the first-time user experience
 */

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/onboarding/onboarding.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
  });

  test('displays welcome screen on first visit', async ({ page }) => {
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
  });

  test('can enter name after clicking Get Started', async ({ page }) => {
    // Click Get Started
    await page.getByRole('button', { name: /get started/i }).click();
    
    // Wait for transition and name input to appear
    await page.waitForTimeout(500);
    const nameInput = page.getByRole('textbox', { name: /your name/i });
    await expect(nameInput).toBeVisible();
    
    // Enter name
    await nameInput.fill('Test User');
    await expect(nameInput).toHaveValue('Test User');
  });

  test('can select primary interest', async ({ page }) => {
    // Navigate to interest step
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForTimeout(400);
    
    await page.getByRole('textbox', { name: /your name/i }).fill('Test');
    
    // Find and click the visible Continue button
    const continueButtons = page.getByRole('button', { name: /continue/i });
    await continueButtons.first().click();
    await page.waitForTimeout(400);
    
    // Should see interest options (radio buttons)
    const radios = page.locator('input[type="radio"]');
    const count = await radios.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('can select persona', async ({ page }) => {
    // Navigate through to persona step
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForTimeout(500);
    
    await page.getByRole('textbox', { name: /your name/i }).fill('Test');
    await page.locator('[data-step="2"] button:has-text("Continue")').click();
    await page.waitForTimeout(500);
    
    // Select interest by clicking the option card label
    await page.locator('.option-card').first().click();
    await page.locator('[data-step="3"] button:has-text("Continue")').click();
    await page.waitForTimeout(500);
    
    // Should see persona selection heading
    await expect(page.getByRole('heading', { name: /choose your guide/i })).toBeVisible();
  });

  test('completes full onboarding flow', async ({ page }) => {
    // Step 1: Welcome
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForTimeout(500);
    
    // Step 2: Name
    await page.getByRole('textbox', { name: /your name/i }).fill('Test User');
    await page.locator('[data-step="2"] button:has-text("Continue")').click();
    await page.waitForTimeout(500);
    
    // Step 3: Interest - click option card
    await page.locator('.option-card').first().click();
    await page.locator('[data-step="3"] button:has-text("Continue")').click();
    await page.waitForTimeout(500);
    
    // Step 4: Persona - click persona card
    await page.locator('.persona-card').first().click();
    await page.locator('[data-step="4"] button:has-text("Continue")').click();
    await page.waitForTimeout(500);
    
    // Step 5: Complete
    await expect(page.getByRole('button', { name: /start talking/i })).toBeVisible();
  });

  test('is keyboard accessible', async ({ page }) => {
    // Get Started button should be focusable
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
    
    // Should be able to activate with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    
    // Name input should now be visible
    await expect(page.getByRole('textbox', { name: /your name/i })).toBeVisible();
  });

  test('works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Page should still be usable
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
    
    // Button should be visible and clickable
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole('textbox', { name: /your name/i })).toBeVisible();
  });
});
