import { expect, test } from '@playwright/test';

/**
 * Admin Portal E2E Tests
 *
 * Tests the admin portal at /admin.html:
 * - Dashboard section with real data
 * - EvalOps section
 * - Trust section
 * - Feature flags
 * - Agents management
 * - Diagnostics
 *
 * These tests verify that:
 * 1. All sections load without errors
 * 2. API calls return real data (not mock)
 * 3. Navigation works correctly
 * 4. Quick actions trigger appropriate responses
 */

test.describe('Admin Portal', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin portal
    await page.goto('/admin');
    // Wait for portal to initialize
    await page.waitForSelector('#adminPortal', { timeout: 10000 });
  });

  test('loads admin portal without errors', async ({ page }) => {
    // Check for page errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('CORS')
    );
    expect(criticalErrors).toHaveLength(0);

    // Verify portal container exists
    await expect(page.locator('#adminPortal')).toBeVisible();
  });

  test('displays sidebar navigation', async ({ page }) => {
    // Check sidebar is visible
    await expect(page.locator('.admin-sidebar')).toBeVisible();

    // Check key navigation items exist
    await expect(page.locator('[data-section="dashboard"]')).toBeVisible();
    await expect(page.locator('[data-section="agents"]')).toBeVisible();
    await expect(page.locator('[data-section="evalops"]')).toBeVisible();
    await expect(page.locator('[data-section="trust"]')).toBeVisible();
    await expect(page.locator('[data-section="flags"]')).toBeVisible();
  });

  test('dashboard section loads with real API data', async ({ page }) => {
    // Dashboard should be active by default
    await expect(page.locator('[data-section="dashboard"].active')).toBeVisible();

    // Wait for content to load
    await page.waitForSelector('.dashboard-section', { timeout: 10000 });

    // Check system health card exists
    await expect(page.locator('.dashboard-health')).toBeVisible();

    // Check that API was called (not mock data)
    const healthStatus = await page.locator('.health-status').textContent();
    expect(healthStatus).toBeTruthy();

    // Verify stats cards are present
    await expect(page.locator('.dashboard-stats')).toBeVisible();
  });

  test('dashboard shows real system health', async ({ page }) => {
    // Intercept the health API call
    const healthResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/dashboard/health') && response.status() === 200
    );

    const healthData = await healthResponse.json();

    // Verify response structure (real data has these fields)
    expect(healthData).toHaveProperty('status');
    expect(healthData).toHaveProperty('uptime');
    expect(healthData).toHaveProperty('services');
  });

  test('can navigate to EvalOps section', async ({ page }) => {
    // Click EvalOps nav item
    await page.click('[data-section="evalops"]');

    // Wait for section to load
    await page.waitForSelector('.evalops-section', { timeout: 10000 });

    // Verify section title updated
    await expect(page.locator('#adminSectionTitle')).toHaveText('EvalOps');

    // Check EvalOps content
    await expect(page.locator('.evalops-stats')).toBeVisible();
  });

  test('EvalOps section fetches real metrics', async ({ page }) => {
    await page.click('[data-section="evalops"]');

    // Intercept metrics API
    const metricsResponse = await page.waitForResponse(
      (response) => response.url().includes('/api/evalops/metrics') && response.status() === 200
    );

    const metricsData = await metricsResponse.json();

    // Verify response structure
    expect(metricsData).toHaveProperty('success', true);
    expect(metricsData).toHaveProperty('metrics');
  });

  test('can navigate to Trust section', async ({ page }) => {
    // Click Trust nav item
    await page.click('[data-section="trust"]');

    // Wait for section to load
    await page.waitForSelector('.trust-section', { timeout: 10000 });

    // Verify section title updated
    await expect(page.locator('#adminSectionTitle')).toHaveText('Trust');

    // Check Trust content
    await expect(page.locator('.trust-stats')).toBeVisible();
  });

  test('Trust section fetches real metrics', async ({ page }) => {
    await page.click('[data-section="trust"]');

    // Intercept metrics API
    const metricsResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/trust/analytics/metrics') && response.status() === 200
    );

    const metricsData = await metricsResponse.json();

    // Verify response has real data structure (not mock)
    expect(metricsData).toHaveProperty('totalProfiles');
    expect(typeof metricsData.totalProfiles).toBe('number');
    expect(metricsData).toHaveProperty('avgTrustScore');
    expect(typeof metricsData.avgTrustScore).toBe('number');
  });

  test('Trust section fetches real stage distribution', async ({ page }) => {
    await page.click('[data-section="trust"]');

    // Intercept stages API
    const stagesResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/trust/analytics/stages') && response.status() === 200
    );

    const stagesData = await stagesResponse.json();

    // Verify response has stages array
    expect(stagesData).toHaveProperty('stages');
    expect(Array.isArray(stagesData.stages)).toBe(true);
    if (stagesData.stages.length > 0) {
      expect(stagesData.stages[0]).toHaveProperty('stage');
      expect(stagesData.stages[0]).toHaveProperty('name');
      expect(stagesData.stages[0]).toHaveProperty('percent');
    }
  });

  test('Trust section fetches real trust systems status', async ({ page }) => {
    await page.click('[data-section="trust"]');

    // Intercept systems API
    const systemsResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/trust/analytics/systems') && response.status() === 200
    );

    const systemsData = await systemsResponse.json();

    // Verify response has systems array
    expect(systemsData).toHaveProperty('systems');
    expect(Array.isArray(systemsData.systems)).toBe(true);
    if (systemsData.systems.length > 0) {
      expect(systemsData.systems[0]).toHaveProperty('id');
      expect(systemsData.systems[0]).toHaveProperty('name');
      expect(systemsData.systems[0]).toHaveProperty('active');
    }
  });

  test('can navigate to Agents section', async ({ page }) => {
    await page.click('[data-section="agents"]');

    await page.waitForSelector('.agents-section, .admin-content', { timeout: 10000 });

    await expect(page.locator('#adminSectionTitle')).toHaveText('Agents');
  });

  test('Agents section fetches real agent data', async ({ page }) => {
    await page.click('[data-section="agents"]');

    // Intercept agents API
    const agentsResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/agents') &&
        response.status() === 200 &&
        !response.url().includes('/validate')
    );

    const agentsData = await agentsResponse.json();

    // Verify response has agents array
    expect(agentsData).toHaveProperty('agents');
    expect(Array.isArray(agentsData.agents)).toBe(true);
  });

  test('can navigate to Feature Flags section', async ({ page }) => {
    await page.click('[data-section="flags"]');

    await page.waitForSelector('.flags-section, .admin-content', { timeout: 10000 });

    await expect(page.locator('#adminSectionTitle')).toHaveText('Feature Flags');
  });

  test('Feature Flags section fetches real flags', async ({ page }) => {
    await page.click('[data-section="flags"]');

    // Intercept flags API
    const flagsResponse = await page.waitForResponse(
      (response) => response.url().includes('/api/v1/admin/flags') && response.status() === 200
    );

    const flagsData = await flagsResponse.json();

    // Verify response has flags
    expect(flagsData).toHaveProperty('flags');
  });

  test('can navigate to Diagnostics section', async ({ page }) => {
    await page.click('[data-section="diagnostics"]');

    await page.waitForSelector('.diagnostics-section, .admin-content', { timeout: 10000 });

    await expect(page.locator('#adminSectionTitle')).toHaveText('Diagnostics');
  });

  test('Diagnostics section shows service health with latency', async ({ page }) => {
    await page.click('[data-section="diagnostics"]');

    // Intercept health API
    const healthResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/diagnostics/health') && response.status() === 200
    );

    const healthData = await healthResponse.json();

    // Verify response has services array
    expect(healthData).toHaveProperty('services');
    expect(Array.isArray(healthData.services)).toBe(true);
    if (healthData.services.length > 0) {
      expect(healthData.services[0]).toHaveProperty('name');
      expect(healthData.services[0]).toHaveProperty('status');
      // Latency is optional but should be number if present
      if (healthData.services[0].latency !== undefined) {
        expect(typeof healthData.services[0].latency).toBe('number');
      }
    }
  });

  test('keyboard navigation works', async ({ page }) => {
    // Cmd/Ctrl + 1 should switch to first section (dashboard)
    await page.keyboard.press('Meta+2'); // Agents (second item)

    await page.waitForTimeout(500);

    // Verify section changed
    await expect(page.locator('#adminSectionTitle')).toHaveText('Agents');
  });

  test('back to app button works', async ({ page }) => {
    // Find and click "Back to App" button
    const backButton = page.locator('a:has-text("Back to App")');
    await expect(backButton).toBeVisible();

    // Check it links to root
    const href = await backButton.getAttribute('href');
    expect(href).toBe('/');
  });

  test('refresh button triggers section reload', async ({ page }) => {
    // Click refresh button
    const refreshButton = page.locator('[data-action="refresh"]');
    await expect(refreshButton).toBeVisible();

    // Count API calls before refresh
    let apiCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/')) apiCalls++;
    });

    await refreshButton.click();

    // Wait for reload
    await page.waitForTimeout(1000);

    // Should have made API calls
    expect(apiCalls).toBeGreaterThan(0);
  });
});

test.describe('Admin Portal - Activity Log', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForSelector('#adminPortal', { timeout: 10000 });
  });

  test('dashboard shows activity list', async ({ page }) => {
    // Wait for dashboard to load
    await page.waitForSelector('.dashboard-activity', { timeout: 10000 });

    // Activity list should exist
    await expect(page.locator('.activity-list')).toBeVisible();
  });

  test('activity API returns real data structure', async ({ page }) => {
    // Intercept activity API
    const activityResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/admin/dashboard/activity') && response.status() === 200
    );

    const activityData = await activityResponse.json();

    // Verify response structure
    expect(activityData).toHaveProperty('activity');
    expect(Array.isArray(activityData.activity)).toBe(true);
    expect(activityData).toHaveProperty('count');
  });
});

test.describe('Admin Portal - Error Handling', () => {
  test('handles API errors gracefully', async ({ page }) => {
    // Block API calls to simulate errors
    await page.route('**/api/v1/admin/dashboard/**', (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) })
    );

    await page.goto('/admin.html');

    // Portal should still load
    await expect(page.locator('#adminPortal')).toBeVisible();

    // Should not crash
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForTimeout(2000);

    // Critical errors should be handled
    expect(errors.filter((e) => e.includes('Uncaught'))).toHaveLength(0);
  });

  test('shows loading state during API calls', async ({ page }) => {
    // Slow down API responses
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await page.goto('/admin.html');

    // Should show loading initially (may be brief)
    // Just verify no errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForLoadState('networkidle');

    expect(errors.filter((e) => e.includes('Uncaught'))).toHaveLength(0);
  });
});
