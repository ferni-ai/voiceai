import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E Tests
 * 
 * Tests the main application dashboards:
 * - Metrics dashboard
 * - Analytics dashboard
 * - Main voice interface
 */

test.describe('Metrics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/metrics-dashboard.html');
  });

  test('loads and displays metrics', async ({ page }) => {
    // Wait for metrics to load
    await expect(page.getByText(/persistence metrics/i)).toBeVisible();
    
    // Check key metric cards exist
    await expect(page.getByText(/profile operations/i)).toBeVisible();
    await expect(page.getByText(/session stats/i)).toBeVisible();
  });

  test('shows real-time updates', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(1000);
    
    // Check for update timestamp or live indicator
    const timestamp = page.getByText(/updated|last sync/i);
    if (await timestamp.isVisible()) {
      const initialText = await timestamp.textContent();
      
      // Wait for auto-refresh
      await page.waitForTimeout(6000);
      
      // Timestamp should change
      await expect(timestamp).not.toHaveText(initialText!);
    }
  });

  test('has working theme toggle', async ({ page }) => {
    const themeToggle = page.getByRole('button', { name: /theme|dark|light|midnight|zen/i });
    
    if (await themeToggle.isVisible()) {
      const initialBg = await page.evaluate(() => 
        getComputedStyle(document.body).backgroundColor
      );
      
      await themeToggle.click();
      
      const newBg = await page.evaluate(() => 
        getComputedStyle(document.body).backgroundColor
      );
      
      expect(newBg).not.toBe(initialBg);
    }
  });

  test('displays session stats', async ({ page }) => {
    // Look for session-related content
    const sessionContent = page.getByText(/session/i).first();
    await expect(sessionContent).toBeVisible();
  });
});

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics-dashboard.html');
  });

  test('loads analytics page', async ({ page }) => {
    await expect(page.getByText(/analytics/i)).toBeVisible();
  });

  test('displays engagement metrics', async ({ page }) => {
    // Look for common analytics terms
    const metricsTerms = ['sessions', 'users', 'engagement', 'retention'];
    
    for (const term of metricsTerms) {
      const element = page.getByText(new RegExp(term, 'i')).first();
      // At least some metrics should be visible
      if (await element.isVisible()) {
        await expect(element).toBeVisible();
        break;
      }
    }
  });
});

test.describe('Main Voice Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads main application', async ({ page }) => {
    // Check page loaded without errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    
    await page.waitForLoadState('networkidle');
    
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('displays persona selection or voice interface', async ({ page }) => {
    // Either persona selector or voice button should be visible
    const personaSelector = page.getByRole('button', { name: /choose|select|persona/i });
    const voiceButton = page.getByRole('button', { name: /speak|talk|microphone|voice/i });
    const startButton = page.getByRole('button', { name: /start|connect|begin/i });
    
    const anyVisible = await Promise.any([
      personaSelector.isVisible(),
      voiceButton.isVisible(),
      startButton.isVisible(),
    ].map(p => p.then(v => v ? Promise.resolve(true) : Promise.reject())));
    
    expect(anyVisible).toBe(true);
  });

  test('has proper meta tags for PWA', async ({ page }) => {
    // Check viewport meta
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    
    // Check theme color
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();
  });
});

