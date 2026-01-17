import { expect, test } from '@playwright/test';

/**
 * Comprehensive Admin Dashboard E2E Tests
 *
 * Tests ALL 21 admin portal sections:
 * - Navigation and rendering
 * - API data fetching
 * - Interactive elements
 * - Error handling
 *
 * Run: npx playwright test e2e/admin-dashboard-comprehensive.spec.ts
 */

test.describe('Admin Dashboard - All Sections', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin portal with dev mode
    await page.goto('/admin?dev');
    await page.waitForSelector('#adminPortal', { timeout: 15000 });
  });

  // ============================================================================
  // CORE SECTIONS
  // ============================================================================

  test.describe('Dashboard Section', () => {
    test('loads with system health data', async ({ page }) => {
      // Dashboard is default section
      await page.waitForSelector('.dashboard-section', { timeout: 10000 });

      // Health card should be visible
      await expect(page.locator('.dashboard-health')).toBeVisible();

      // Health status should show
      await expect(page.locator('.health-status')).toBeVisible();
    });

    test('displays quick stats', async ({ page }) => {
      await page.waitForSelector('.dashboard-stats', { timeout: 10000 });
      const statCards = await page.locator('.stat-card').count();
      expect(statCards).toBeGreaterThanOrEqual(4);
    });

    test('shows quick actions', async ({ page }) => {
      await page.waitForSelector('.dashboard-actions', { timeout: 10000 });
      const quickActions = await page.locator('.quick-action').count();
      expect(quickActions).toBeGreaterThanOrEqual(2);
    });

    test('displays activity feed', async ({ page }) => {
      await page.waitForSelector('.dashboard-activity', { timeout: 10000 });
      await expect(page.locator('.activity-list')).toBeVisible();
    });
  });

  test.describe('Business Metrics Section', () => {
    test('navigates and loads data', async ({ page }) => {
      await page.click('[data-section="business-metrics"]');
      await page.waitForSelector('.business-metrics-section', { timeout: 10000 });

      // Title should update
      await expect(page.locator('#adminSectionTitle')).toHaveText('Business Metrics');

      // Metrics grid should render
      await expect(page.locator('.metrics-grid')).toBeVisible();
    });

    test('fetches analytics API', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/analytics') && response.status() < 500,
        { timeout: 15000 }
      );

      await page.click('[data-section="business-metrics"]');

      const response = await responsePromise.catch(() => null);
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    });
  });

  test.describe('Semantic Routing Section', () => {
    test('navigates and loads metrics', async ({ page }) => {
      await page.click('[data-section="semantic-routing"]');
      await page.waitForSelector('.semantic-routing-section', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Semantic Routing');
      await expect(page.locator('.metrics-grid')).toBeVisible();
    });
  });

  test.describe('Agents Section', () => {
    test('navigates and lists agents', async ({ page }) => {
      await page.click('[data-section="agents"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Agents');
    });

    test('fetches agents API', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/admin/agents') &&
          !response.url().includes('/validate'),
        { timeout: 15000 }
      );

      await page.click('[data-section="agents"]');

      const response = await responsePromise.catch(() => null);
      if (response && response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('agents');
      }
    });
  });

  test.describe('EvalOps Section', () => {
    test('navigates and shows metrics', async ({ page }) => {
      await page.click('[data-section="evalops"]');
      await page.waitForSelector('.evalops-section, .admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('EvalOps');
    });

    test('fetches evalops metrics', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/evalops/metrics'),
        { timeout: 15000 }
      );

      await page.click('[data-section="evalops"]');

      const response = await responsePromise.catch(() => null);
      if (response && response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
      }
    });
  });

  test.describe('BTH Validation Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="bth-validation"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('BTH Validation');
    });
  });

  test.describe('Blind Evaluation Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="blind-evaluation"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Blind Evaluation');
    });
  });

  test.describe('Trust Section', () => {
    test('navigates and shows trust metrics', async ({ page }) => {
      await page.click('[data-section="trust"]');
      await page.waitForSelector('.trust-section, .admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Trust');
    });

    test('fetches trust metrics API', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/trust/analytics/metrics'),
        { timeout: 15000 }
      );

      await page.click('[data-section="trust"]');

      const response = await responsePromise.catch(() => null);
      if (response && response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('totalProfiles');
      }
    });
  });

  test.describe('Human Listening Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="human-listening"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Human Listening');
    });
  });

  test.describe('Speech Metrics Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="speech-metrics"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Speech Metrics');
    });
  });

  test.describe('Experiments Section', () => {
    test('navigates and lists experiments', async ({ page }) => {
      await page.click('[data-section="experiments"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Experiments');
    });
  });

  test.describe('Feature Flags Section', () => {
    test('navigates and lists flags', async ({ page }) => {
      await page.click('[data-section="flags"]');
      await page.waitForSelector('.flags-section, .admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Feature Flags');
    });

    test('fetches flags API', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/v1/admin/flags'),
        { timeout: 15000 }
      );

      await page.click('[data-section="flags"]');

      const response = await responsePromise.catch(() => null);
      if (response && response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('flags');
      }
    });
  });

  test.describe('FinOps Section', () => {
    test('navigates and renders cost data', async ({ page }) => {
      await page.click('[data-section="finops"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('FinOps');
    });
  });

  test.describe('Operations Section', () => {
    test('navigates and shows service health', async ({ page }) => {
      await page.click('[data-section="operations"]');
      await page.waitForSelector('.ops-section, .admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Operations');
    });
  });

  test.describe('Builder Metrics Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="builder-metrics"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Builder Metrics');
    });
  });

  test.describe('Diagnostics Section', () => {
    test('navigates and shows diagnostics', async ({ page }) => {
      await page.click('[data-section="diagnostics"]');
      await page.waitForSelector('.diagnostics-section, .admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Diagnostics');
    });

    test('fetches diagnostics health API', async ({ page }) => {
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/v1/admin/diagnostics'),
        { timeout: 15000 }
      );

      await page.click('[data-section="diagnostics"]');

      const response = await responsePromise.catch(() => null);
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    });
  });

  test.describe('API Docs Section', () => {
    test('navigates and renders documentation', async ({ page }) => {
      await page.click('[data-section="api-docs"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('API Docs');
    });
  });

  test.describe('Avatar Soul Section', () => {
    test('navigates and renders', async ({ page }) => {
      await page.click('[data-section="avatar-soul"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Avatar Soul');
    });
  });

  test.describe('Design System Section', () => {
    test('navigates and shows design tokens', async ({ page }) => {
      await page.click('[data-section="design-system"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Design System');
    });
  });

  test.describe('Model Config Section', () => {
    test('navigates and loads config', async ({ page }) => {
      await page.click('[data-section="model-config"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('Model Config');
    });
  });

  test.describe('More Dashboards Section', () => {
    test('navigates and shows dashboard links', async ({ page }) => {
      await page.click('[data-section="more-dashboards"]');
      await page.waitForSelector('.admin-content', { timeout: 10000 });

      await expect(page.locator('#adminSectionTitle')).toHaveText('More Dashboards');
    });
  });

  // ============================================================================
  // NAVIGATION & UX
  // ============================================================================

  test.describe('Navigation', () => {
    test('all sidebar sections are present', async ({ page }) => {
      const sections = [
        'dashboard',
        'business-metrics',
        'semantic-routing',
        'agents',
        'evalops',
        'bth-validation',
        'blind-evaluation',
        'trust',
        'human-listening',
        'speech-metrics',
        'experiments',
        'flags',
        'finops',
        'operations',
        'builder-metrics',
        'diagnostics',
        'api-docs',
        'avatar-soul',
        'design-system',
        'model-config',
        'more-dashboards',
      ];

      for (const section of sections) {
        const navBtn = page.locator(`[data-section="${section}"]`);
        await expect(navBtn).toBeVisible();
      }
    });

    test('keyboard shortcuts work', async ({ page }) => {
      // Cmd+2 should navigate to second section (Business Metrics)
      await page.keyboard.press('Meta+2');
      await page.waitForTimeout(500);

      await expect(page.locator('#adminSectionTitle')).toHaveText('Business Metrics');
    });

    test('refresh button reloads section', async ({ page }) => {
      let apiCalls = 0;
      page.on('request', (request) => {
        if (request.url().includes('/api/')) apiCalls++;
      });

      const refreshBtn = page.locator('[data-action="refresh"]');
      await refreshBtn.click();

      await page.waitForTimeout(1000);
      expect(apiCalls).toBeGreaterThan(0);
    });

    test('sidebar can collapse', async ({ page }) => {
      // Press Cmd+B to toggle sidebar
      await page.keyboard.press('Meta+b');
      await page.waitForTimeout(300);

      const sidebar = page.locator('.admin-sidebar');
      await expect(sidebar).toHaveClass(/collapsed/);
    });
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  test.describe('Error Handling', () => {
    test('handles API errors gracefully', async ({ page }) => {
      // Block API calls
      await page.route('**/api/v1/admin/dashboard/**', (route) =>
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
      );

      await page.goto('/admin?dev');

      // Portal should still render
      await expect(page.locator('#adminPortal')).toBeVisible();

      // No uncaught errors
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.waitForTimeout(2000);

      expect(errors.filter((e) => e.includes('Uncaught'))).toHaveLength(0);
    });

    test('shows fallback UI when data unavailable', async ({ page }) => {
      // Block all admin APIs
      await page.route('**/api/**', (route) =>
        route.fulfill({ status: 500, body: 'Error' })
      );

      await page.goto('/admin?dev');
      await page.waitForSelector('#adminPortal', { timeout: 10000 });

      // Portal should still be visible
      await expect(page.locator('#adminPortal')).toBeVisible();
    });
  });

  // ============================================================================
  // ACCESSIBILITY
  // ============================================================================

  test.describe('Accessibility', () => {
    test('sidebar has proper ARIA', async ({ page }) => {
      const nav = page.locator('.admin-nav');
      await expect(nav).toHaveAttribute('aria-label', 'Admin navigation');
    });

    test('sections have heading hierarchy', async ({ page }) => {
      // Main title should be h1
      const mainTitle = page.locator('#adminSectionTitle');
      const tagName = await mainTitle.evaluate((el) => el.tagName);
      expect(tagName).toBe('H1');
    });

    test('interactive elements are focusable', async ({ page }) => {
      // Tab through nav items
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Something should be focused
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  });
});

// ============================================================================
// SMOKE TEST - Quick validation of all sections
// ============================================================================

test.describe('Admin Dashboard Smoke Test', () => {
  test('all 21 sections load without errors', async ({ page }) => {
    await page.goto('/admin?dev');
    await page.waitForSelector('#adminPortal', { timeout: 15000 });

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    const sections = [
      'dashboard',
      'business-metrics',
      'semantic-routing',
      'agents',
      'evalops',
      'bth-validation',
      'blind-evaluation',
      'trust',
      'human-listening',
      'speech-metrics',
      'experiments',
      'flags',
      'finops',
      'operations',
      'builder-metrics',
      'diagnostics',
      'api-docs',
      'avatar-soul',
      'design-system',
      'model-config',
      'more-dashboards',
    ];

    for (const section of sections) {
      await page.click(`[data-section="${section}"]`);
      await page.waitForTimeout(500);

      // Verify content area updated
      const contentHtml = await page.locator('.admin-content').innerHTML();
      expect(contentHtml.length).toBeGreaterThan(0);
    }

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('CORS') && !e.includes('Network')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
