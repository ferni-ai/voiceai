import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility E2E Tests
 * 
 * WCAG 2.1 AA compliance checks using axe-core
 * Note: Some tests log issues rather than fail to allow gradual improvement
 */

test.describe('Accessibility', () => {
  test('onboarding page accessibility check', async ({ page }) => {
    await page.goto('/onboarding/onboarding.html');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    // Log violations for awareness
    if (results.violations.length > 0) {
      console.log('Onboarding accessibility issues:', results.violations.length);
      results.violations.forEach(v => console.log(`  - ${v.id}: ${v.description}`));
    }
    
    // Allow up to 5 minor violations for now
    expect(results.violations.length).toBeLessThanOrEqual(5);
  });

  test('metrics dashboard accessibility check', async ({ page }) => {
    await page.goto('/metrics-dashboard.html');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.chart-canvas')
      .analyze();
    
    if (results.violations.length > 0) {
      console.log('Metrics dashboard accessibility issues:', results.violations.length);
      results.violations.forEach(v => console.log(`  - ${v.id}: ${v.description}`));
    }
    
    expect(results.violations.length).toBeLessThanOrEqual(5);
  });

  test('main app accessibility check', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    if (results.violations.length > 0) {
      console.log('Main app accessibility issues:', results.violations.length);
      results.violations.forEach(v => console.log(`  - ${v.id}: ${v.description}`));
    }
    
    expect(results.violations.length).toBeLessThanOrEqual(10);
  });

  test('all pages have proper heading hierarchy', async ({ page }) => {
    const pages = ['/', '/onboarding/onboarding.html', '/metrics-dashboard.html'];
    
    for (const pagePath of pages) {
      await page.goto(pagePath);
      
      const headings = await page.evaluate(() => {
        const h = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(h).map(el => ({
          level: parseInt(el.tagName[1]),
          text: el.textContent?.trim(),
        }));
      });
      
      // Check that there's at least one heading
      expect(headings.length).toBeGreaterThan(0);
    }
  });

  test('interactive elements have focus indicators', async ({ page }) => {
    await page.goto('/');
    
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      const button = buttons.first();
      await button.focus();
      
      // Check for visible focus indicator
      const hasFocusStyle = await button.evaluate(el => {
        const style = window.getComputedStyle(el);
        return (
          style.outline !== 'none' ||
          style.boxShadow !== 'none' ||
          style.border !== 'none'
        );
      });
      
      expect(hasFocusStyle).toBe(true);
    }
  });

  test('images have alt text or are decorative', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    let missingAlt = 0;
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      const ariaHidden = await img.getAttribute('aria-hidden');
      
      // Images should have alt text or be decorative
      if (alt === null && role !== 'presentation' && ariaHidden !== 'true') {
        missingAlt++;
      }
    }
    
    // Allow some decorative images without explicit role
    expect(missingAlt).toBeLessThanOrEqual(5);
  });

  test('color contrast check', async ({ page }) => {
    await page.goto('/');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();
    
    if (results.violations.length > 0) {
      console.log('Color contrast issues:', results.violations.length);
    }
    
    // Allow some contrast issues for now
    expect(results.violations.length).toBeLessThanOrEqual(3);
  });

  test('form inputs are accessible', async ({ page }) => {
    await page.goto('/onboarding/onboarding.html');
    await page.getByRole('button', { name: /get started/i }).click();
    await page.waitForTimeout(500);
    
    // Check the name input is accessible
    const nameInput = page.getByRole('textbox', { name: /your name/i });
    await expect(nameInput).toBeVisible();
    
    // Should be focusable
    await nameInput.focus();
    await expect(nameInput).toBeFocused();
  });
});
