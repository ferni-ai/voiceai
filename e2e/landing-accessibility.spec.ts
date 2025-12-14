/**
 * Landing Page Accessibility E2E Tests
 *
 * WCAG 2.1 AA compliance checks specific to ferni.ai landing page
 * Uses axe-core for automated accessibility testing
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const LANDING_URL = 'https://ferni.ai';

test.describe('Landing Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to landing page
    await page.goto(LANDING_URL);
    await page.waitForLoadState('networkidle');
  });

  // ============================================================================
  // AXE-CORE AUTOMATED TESTS
  // ============================================================================

  test('full page WCAG 2.1 AA compliance', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .exclude('.hero__bg-orb') // Decorative elements
      .analyze();

    if (results.violations.length > 0) {
      console.log('Landing page accessibility violations:');
      results.violations.forEach((v) => {
        console.log(`  - ${v.id}: ${v.description}`);
        console.log(`    Impact: ${v.impact}`);
        console.log(`    Nodes: ${v.nodes.length}`);
      });
    }

    // Allow no critical/serious violations
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations).toHaveLength(0);
  });

  test('color contrast meets WCAG AA', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();

    if (results.violations.length > 0) {
      console.log('Color contrast issues:');
      results.violations.forEach((v) => {
        v.nodes.forEach((node) => {
          console.log(`  - ${node.html.slice(0, 80)}...`);
        });
      });
    }

    // No contrast violations allowed
    expect(results.violations).toHaveLength(0);
  });

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================

  test('skip link is present and functional', async ({ page }) => {
    // Skip link should exist
    const skipLink = page.locator('.skip-link, [href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Tab to skip link (first focusable element)
    await page.keyboard.press('Tab');

    // Skip link should be visible when focused
    const skipLinkVisible = await skipLink.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && style.visibility !== 'hidden';
    });
    expect(skipLinkVisible).toBe(true);

    // Activating skip link should move focus to main content
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.id || document.activeElement?.tagName;
    });
    expect(focusedElement === 'main-content' || focusedElement === 'MAIN').toBe(true);
  });

  test('all interactive elements are keyboard accessible', async ({ page }) => {
    // Tab through the page and count focusable elements
    const focusableElements: string[] = [];
    let tabCount = 0;
    const maxTabs = 50;

    while (tabCount < maxTabs) {
      await page.keyboard.press('Tab');
      tabCount++;

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return {
          tag: el.tagName,
          text: el.textContent?.slice(0, 30),
          role: el.getAttribute('role'),
        };
      });

      if (!focused) break;
      focusableElements.push(`${focused.tag}: ${focused.text}`);
    }

    // Should have multiple focusable elements
    expect(focusableElements.length).toBeGreaterThan(10);
    console.log(`Found ${focusableElements.length} focusable elements`);
  });

  test('focus indicators are visible', async ({ page }) => {
    // Get all buttons
    const buttons = page.locator('button, .btn, [role="button"]');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      const firstButton = buttons.first();
      await firstButton.focus();

      // Check for visible focus indicator
      const hasFocusIndicator = await firstButton.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.outlineStyle !== 'none' ||
          style.boxShadow !== 'none' ||
          el.classList.contains('focus-visible')
        );
      });

      expect(hasFocusIndicator).toBe(true);
    }
  });

  // ============================================================================
  // SEMANTIC HTML
  // ============================================================================

  test('has proper heading hierarchy', async ({ page }) => {
    const headings = await page.evaluate(() => {
      const h = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(h).map((el) => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim().slice(0, 50),
      }));
    });

    // Should have exactly one h1
    const h1s = headings.filter((h) => h.level === 1);
    expect(h1s.length).toBe(1);

    // Check for skipped heading levels
    let previousLevel = 0;
    let hasSkippedLevel = false;

    headings.forEach((h) => {
      if (h.level > previousLevel + 1 && previousLevel !== 0) {
        hasSkippedLevel = true;
        console.log(`Skipped heading level: h${previousLevel} -> h${h.level} ("${h.text}")`);
      }
      previousLevel = h.level;
    });

    // Warn but don't fail for skipped levels
    if (hasSkippedLevel) {
      console.log('Warning: Some heading levels are skipped');
    }
  });

  test('landmarks are properly defined', async ({ page }) => {
    const landmarks = await page.evaluate(() => {
      return {
        main: document.querySelectorAll('main, [role="main"]').length,
        nav: document.querySelectorAll('nav, [role="navigation"]').length,
        footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
        regions: document.querySelectorAll('[role="region"][aria-label]').length,
      };
    });

    expect(landmarks.main).toBe(1);
    expect(landmarks.nav).toBeGreaterThanOrEqual(1);
    expect(landmarks.footer).toBeGreaterThanOrEqual(1);
  });

  // ============================================================================
  // IMAGES
  // ============================================================================

  test('images have appropriate alt text', async ({ page }) => {
    const imageAudit = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const issues: string[] = [];

      images.forEach((img) => {
        const alt = img.getAttribute('alt');
        const role = img.getAttribute('role');
        const ariaHidden = img.getAttribute('aria-hidden');

        // Images must have alt OR be marked decorative
        if (alt === null && role !== 'presentation' && ariaHidden !== 'true') {
          issues.push(img.src);
        }

        // Alt text shouldn't say "image of" or "picture of"
        if (alt && /^(image|picture|photo) of/i.test(alt)) {
          issues.push(`Redundant alt: "${alt}"`);
        }
      });

      return {
        total: images.length,
        issues,
      };
    });

    if (imageAudit.issues.length > 0) {
      console.log('Image accessibility issues:', imageAudit.issues);
    }

    expect(imageAudit.issues.length).toBe(0);
  });

  // ============================================================================
  // FORMS
  // ============================================================================

  test('form inputs have labels', async ({ page }) => {
    const inputAudit = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, select');
      const issues: string[] = [];

      inputs.forEach((input) => {
        const id = input.id;
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        const placeholder = input.getAttribute('placeholder');
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;

        // Input must have a label, aria-label, or aria-labelledby
        if (!label && !ariaLabel && !ariaLabelledBy) {
          issues.push(`Input without label: ${input.outerHTML.slice(0, 80)}`);
        }
      });

      return issues;
    });

    if (inputAudit.length > 0) {
      console.log('Form accessibility issues:', inputAudit);
    }

    // Allow some issues for now
    expect(inputAudit.length).toBeLessThanOrEqual(2);
  });

  // ============================================================================
  // INTERACTIVE ELEMENTS
  // ============================================================================

  test('buttons have accessible names', async ({ page }) => {
    const buttonAudit = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, [role="button"]');
      const issues: string[] = [];

      buttons.forEach((btn) => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const ariaLabelledBy = btn.getAttribute('aria-labelledby');
        const title = btn.getAttribute('title');

        if (!text && !ariaLabel && !ariaLabelledBy && !title) {
          issues.push(btn.outerHTML.slice(0, 100));
        }
      });

      return issues;
    });

    expect(buttonAudit).toHaveLength(0);
  });

  test('links have descriptive text', async ({ page }) => {
    const linkAudit = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      const vagueLinkTexts = ['click here', 'read more', 'learn more', 'here', 'more'];
      const issues: string[] = [];

      links.forEach((link) => {
        const text = link.textContent?.trim().toLowerCase();
        const ariaLabel = link.getAttribute('aria-label')?.toLowerCase();

        if (text && vagueLinkTexts.includes(text) && !ariaLabel) {
          issues.push(`Vague link text: "${text}"`);
        }
      });

      return issues;
    });

    if (linkAudit.length > 0) {
      console.log('Vague link texts found:', linkAudit);
    }

    // Warn but don't fail
    expect(linkAudit.length).toBeLessThanOrEqual(3);
  });

  // ============================================================================
  // ARIA
  // ============================================================================

  test('ARIA attributes are valid', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .options({ runOnly: ['aria-valid-attr', 'aria-valid-attr-value', 'aria-roles'] })
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  // ============================================================================
  // AI CHAT WIDGET (if present)
  // ============================================================================

  test('AI chat widget is accessible', async ({ page }) => {
    // Check if chat widget exists
    const chatWidget = page.locator('#ferni-live-chat, .ferni-chat-trigger');
    const exists = (await chatWidget.count()) > 0;

    if (!exists) {
      test.skip();
      return;
    }

    // Chat trigger should be accessible
    const trigger = page.locator('.ferni-chat-trigger');
    if ((await trigger.count()) > 0) {
      const ariaLabel = await trigger.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    }

    // Messages area should have aria-live
    const messages = page.locator('.ferni-chat-panel__messages');
    if ((await messages.count()) > 0) {
      const ariaLive = await messages.getAttribute('aria-live');
      expect(ariaLive).toBe('polite');
    }
  });
});
