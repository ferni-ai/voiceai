import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility E2E Tests
 * 
 * WCAG 2.1 AA compliance checks using axe-core
 */

test.describe('Accessibility', () => {
  test('onboarding page has no accessibility violations', async ({ page }) => {
    await page.goto('/onboarding/onboarding.html');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('metrics dashboard has no accessibility violations', async ({ page }) => {
    await page.goto('/metrics-dashboard.html');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.chart-canvas') // Charts may have known issues
      .analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('main app has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    
    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log('Accessibility violations:', JSON.stringify(results.violations, null, 2));
    }
    
    expect(results.violations).toEqual([]);
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
      
      // Check heading hierarchy
      let previousLevel = 0;
      for (const heading of headings) {
        // Headings should not skip more than one level
        if (previousLevel > 0) {
          expect(heading.level).toBeLessThanOrEqual(previousLevel + 1);
        }
        previousLevel = heading.level;
      }
    }
  });

  test('interactive elements have focus indicators', async ({ page }) => {
    await page.goto('/');
    
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
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

  test('images have alt text', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const imageCount = await images.count();
    
    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const role = await img.getAttribute('role');
      
      // Images should have alt text or be decorative (role=presentation)
      expect(alt !== null || role === 'presentation').toBe(true);
    }
  });

  test('color contrast meets WCAG AA', async ({ page }) => {
    await page.goto('/');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('form inputs have labels', async ({ page }) => {
    await page.goto('/onboarding/onboarding.html');
    
    const inputs = page.locator('input, textarea, select');
    const inputCount = await inputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      // Input should have associated label
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = await label.count() > 0;
        expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
      } else {
        expect(ariaLabel || ariaLabelledBy).toBeTruthy();
      }
    }
  });
});

