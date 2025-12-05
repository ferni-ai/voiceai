import { test, expect } from '@playwright/test';

/**
 * Onboarding Flow E2E Tests
 * 
 * Tests the first-time user experience including:
 * - Welcome screen display
 * - Persona selection
 * - Preference setup
 * - Navigation to main app
 */

test.describe('Onboarding Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored onboarding state
    await page.goto('/onboarding/onboarding.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('displays welcome screen on first visit', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
  });

  test('navigates through all onboarding steps', async ({ page }) => {
    // Step 1: Welcome
    await page.getByRole('button', { name: /get started/i }).click();
    
    // Step 2: Persona selection
    await expect(page.getByText(/choose.*coach/i)).toBeVisible();
    await page.getByRole('button', { name: /dr\. sarah/i }).first().click();
    
    // Step 3: Preferences (if exists)
    const nextButton = page.getByRole('button', { name: /next|continue/i });
    if (await nextButton.isVisible()) {
      await nextButton.click();
    }
    
    // Step 4: Complete
    await expect(page.getByText(/ready|complete|start/i)).toBeVisible();
  });

  test('allows persona selection', async ({ page }) => {
    await page.getByRole('button', { name: /get started/i }).click();
    
    // Check multiple personas are available
    const personaButtons = page.locator('[data-persona-id]');
    await expect(personaButtons).toHaveCount({ min: 3 });
    
    // Select one
    await personaButtons.first().click();
    await expect(personaButtons.first()).toHaveAttribute('aria-selected', 'true');
  });

  test('saves onboarding completion to localStorage', async ({ page }) => {
    // Complete onboarding
    await page.getByRole('button', { name: /get started/i }).click();
    await page.getByRole('button', { name: /dr\. sarah/i }).first().click();
    
    // Find and click complete/finish button
    const completeButton = page.getByRole('button', { name: /complete|finish|start/i });
    if (await completeButton.isVisible()) {
      await completeButton.click();
    }
    
    // Check localStorage
    const completed = await page.evaluate(() => localStorage.getItem('onboardingCompleted'));
    expect(completed).toBeTruthy();
  });

  test('skips onboarding for returning users', async ({ page }) => {
    // Set onboarding as completed
    await page.evaluate(() => localStorage.setItem('onboardingCompleted', 'true'));
    await page.reload();
    
    // Should redirect or show main content
    await expect(page.getByRole('heading', { name: /welcome/i })).not.toBeVisible();
  });

  test('is keyboard accessible', async ({ page }) => {
    // Tab to first interactive element
    await page.keyboard.press('Tab');
    
    // Should be able to activate with Enter
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Navigate through with Tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Activate button with Enter
    await page.keyboard.press('Enter');
  });

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /get started/i })).toBeVisible();
    
    // Check button is tappable (reasonable size)
    const button = page.getByRole('button', { name: /get started/i });
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44); // iOS minimum tap target
  });
});

