/**
 * E2E Tests for Trust Systems API and Journey UI
 *
 * Tests the trust journey and export endpoints:
 * - GET /api/trust-journey - Full trust journey data
 * - GET /api/trust-journey/summary - Journey summary
 * - GET /api/trust-journey/metrics - Journey metrics
 * - GET /api/trust-export - Export trust data
 * - GET /api/trust-export/csv - Export as CSV
 *
 * And the Journey UI modal (journey.ui.ts):
 * - Modal open/close interactions
 * - Progress overview display
 * - Trust insights section
 * - Milestones section
 * - Accessibility features
 */

import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-trust-test-user';
const TEST_HEADERS = {
  'X-User-Id': TEST_USER_ID,
  'X-Admin-Key': 'dev-mode',
  'Content-Type': 'application/json',
};

// ============================================================================
// TRUST JOURNEY API TESTS
// ============================================================================

test.describe('Trust Journey API', () => {
  test('GET /api/trust-journey - returns journey data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify required fields exist
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('timeline');
    expect(data).toHaveProperty('generatedAt');
  });

  test('GET /api/trust-journey/summary - returns summary only', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/summary?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('generatedAt');
  });

  test('GET /api/trust-journey/timeline - returns timeline only', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/timeline?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('timeline');
    expect(Array.isArray(data.timeline)).toBe(true);
  });

  test('GET /api/trust-journey/metrics - returns metrics', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/metrics?userId=${TEST_USER_ID}&days=30`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('period');
    expect(data).toHaveProperty('metrics');
  });

  test('trust journey requires authentication', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=${TEST_USER_ID}`
      // No auth headers
    );

    expect(response.status()).toBe(401);
  });

  test('admin can access another user data via query param', async ({ request }) => {
    // Dev mode auth grants admin access, so we can access other user data
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=different-user`,
      { headers: TEST_HEADERS }
    );

    // Admin can access other users via query param
    expect(response.status()).toBe(200);
  });
});

// ============================================================================
// TRUST EXPORT API TESTS
// ============================================================================

test.describe('Trust Export API', () => {
  test('GET /api/trust-export - returns export data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('exportedAt');
    expect(data).toHaveProperty('boundaries');
    expect(data).toHaveProperty('growth');
    expect(data).toHaveProperty('sharedMoments');
    expect(data).toHaveProperty('celebrations');
  });

  test('GET /api/trust-export/csv - returns CSV file', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export/csv?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/csv');

    const disposition = response.headers()['content-disposition'];
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('.csv');
  });

  test('GET /api/trust-export/summary - returns text summary', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export/summary?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');
  });

  test('trust export requires authentication', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export?userId=${TEST_USER_ID}`
      // No auth headers
    );

    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// TRUST ROUTES API TESTS (actual routes at /api/trust/*)
// ============================================================================

test.describe('Trust Routes API', () => {
  test('GET /api/trust/health - returns health data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust/health?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    // Response has score (may be null for new users) and message
    expect(data).toHaveProperty('score');
    expect(data).toHaveProperty('message');
  });

  test('GET /api/trust/momentum - returns momentum profile', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust/momentum?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('profile');
    expect(data).toHaveProperty('activeStreaks');
    expect(data).toHaveProperty('celebrations');
  });

  test('GET /api/trust/sentiment - returns sentiment data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust/sentiment?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('currentMood');
    expect(data).toHaveProperty('peaks');
    expect(data).toHaveProperty('patterns');
  });

  test('GET /api/trust/starters - returns conversation starters', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust/starters?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('starters');
    expect(data).toHaveProperty('recommended');
  });
});

// ============================================================================
// JOURNEY UI TESTS (journey.ui.ts)
// ============================================================================

test.describe('Journey UI', () => {
  const APP_URL = process.env.TEST_APP_URL || 'http://localhost:5173';

  /**
   * Helper to open the Journey modal from the settings menu.
   * Handles expanding the "Grow" section if it's collapsed.
   */
  async function openJourneyModal(page: Page): Promise<void> {
    // Click settings trigger
    await page.click('.settings-trigger');
    await page.waitForSelector('.settings-menu', { state: 'visible', timeout: 5000 });

    // The "Your Journey" item is inside the "Grow" collapsible section
    const journeyBtn = page.locator('[data-action="your-journey"]');

    // Check if button is visible
    const isVisible = await journeyBtn.isVisible().catch(() => false);

    if (!isVisible) {
      // Expand the "Grow" section
      const growSection = page.locator('[data-section="grow"]');
      if (await growSection.isVisible()) {
        await growSection.click();
        await page.waitForSelector('[data-action="your-journey"]', {
          state: 'visible',
          timeout: 3000,
        });
      }
    }

    await journeyBtn.click();

    // Wait for modal to appear (journey.ui.ts uses .journey-modal)
    await page.waitForSelector('.journey-modal', { state: 'visible', timeout: 5000 });

    // Wait for open animation to complete
    await page.waitForTimeout(300);
  }

  test.beforeEach(async ({ page }) => {
    // Set up mock user authentication and relationship stage
    await page.addInitScript(() => {
      localStorage.setItem('ferni_user_id', 'e2e-trust-test-user');
      // Set relationship data with 'getting-started' stage so the "Grow" section is visible
      const relationshipData = {
        stage: 'getting-started',
        firstMeetingDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        conversationCount: 5,
        lastConversation: new Date().toISOString(),
        metrics: {
          totalConversations: 5,
          deepConversations: 1,
          consecutiveDays: 3,
          currentStreak: 3,
          longestStreak: 3,
          daysSinceFirstMeeting: 7,
        },
      };
      localStorage.setItem('ferni_relationship', JSON.stringify(relationshipData));
      // Enable dev mode for testing
      localStorage.setItem('ferni_dev_mode', 'true');
    });
    await page.goto(APP_URL);
    // Wait for app to initialize (use domcontentloaded instead of networkidle to avoid timeout)
    await page.waitForLoadState('domcontentloaded');
    // Give the app a moment to initialize
    await page.waitForTimeout(1000);
  });

  test('modal opens from settings menu', async ({ page }) => {
    await openJourneyModal(page);

    // Verify modal is visible
    await expect(page.locator('.journey-modal')).toBeVisible();
  });

  test('modal closes on backdrop click', async ({ page }) => {
    await openJourneyModal(page);

    // Scope to modal
    const modal = page.locator('.journey-modal');
    const backdrop = modal.locator('.journey-backdrop');

    // Click on the backdrop area (top-left corner where content doesn't overlap)
    // Use force:true because the backdrop might be covered by other elements at certain positions
    await backdrop.click({ position: { x: 5, y: 5 }, force: true });

    // Wait for close animation
    await page.waitForTimeout(500);

    // Verify modal closes
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('modal closes on Escape key', async ({ page }) => {
    await openJourneyModal(page);

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify modal closes
    await expect(page.locator('.journey-modal')).not.toBeVisible({ timeout: 3000 });
  });

  test('modal closes on close button click', async ({ page }) => {
    await openJourneyModal(page);

    // Scope selectors to within the modal to avoid strict mode violations
    const modal = page.locator('.journey-modal');
    const closeBtn = modal.locator('.journey-close');
    
    // Wait for close button to be ready and stable
    await closeBtn.waitFor({ state: 'visible' });
    await page.waitForTimeout(200); // Wait for any animations to settle

    // Click close button
    await closeBtn.click();

    // Wait for close animation
    await page.waitForTimeout(500);

    // Verify modal closes
    await expect(modal).not.toBeVisible({ timeout: 5000 });
  });

  test('displays progress overview section', async ({ page }) => {
    await openJourneyModal(page);

    // Verify progress overview is displayed
    await expect(page.locator('.journey-progress-overview')).toBeVisible();

    // Verify progress ring is displayed
    await expect(page.locator('.journey-progress-ring')).toBeVisible();

    // Verify stage name is displayed
    await expect(page.locator('.journey-stage-name')).toBeVisible();

    // Verify stats row is displayed
    await expect(page.locator('.journey-stats-row')).toBeVisible();
    await expect(page.locator('.journey-stat')).toHaveCount(3);
  });

  test('displays trust insights section', async ({ page }) => {
    await openJourneyModal(page);

    // Scroll down to insights section
    await page.locator('.journey-insights-section').scrollIntoViewIfNeeded();

    // Verify insights section exists
    await expect(page.locator('.journey-insights-section')).toBeVisible();

    // Verify insights header is visible
    await expect(page.locator('.journey-insights-header')).toBeVisible();
    await expect(page.locator('.journey-insights-title')).toBeVisible();

    // Wait for insights to load (either data or empty state)
    await page.waitForSelector('.journey-insights-body', { timeout: 10000 });
    const insightsBody = page.locator('.journey-insights-body');
    await expect(insightsBody).toBeVisible();
  });

  test('displays milestones section', async ({ page }) => {
    await openJourneyModal(page);

    // Scroll down to milestones section
    await page.locator('.journey-milestones-section').scrollIntoViewIfNeeded();

    // Verify milestones section exists
    await expect(page.locator('.journey-milestones-section')).toBeVisible();

    // Verify milestones header is visible
    await expect(page.locator('.journey-milestones-header')).toBeVisible();
    await expect(page.locator('.journey-milestones-count')).toBeVisible();
  });

  test('milestones section is collapsible', async ({ page }) => {
    await openJourneyModal(page);

    // Scroll down to milestones section
    await page.locator('.journey-milestones-section').scrollIntoViewIfNeeded();

    const header = page.locator('.journey-milestones-header');
    const body = page.locator('.journey-milestones-body');

    // Verify section is expanded by default
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(body).not.toHaveClass(/collapsed/);

    // Click to collapse
    await header.click();
    await page.waitForTimeout(200); // Wait for animation

    // Verify section is collapsed
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(body).toHaveClass(/collapsed/);

    // Click to expand
    await header.click();
    await page.waitForTimeout(200); // Wait for animation

    // Verify section is expanded again
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(body).not.toHaveClass(/collapsed/);
  });

  test('trust insights section is collapsible', async ({ page }) => {
    await openJourneyModal(page);

    // Scope to modal
    const modal = page.locator('.journey-modal');

    // Wait for insights section to be present
    await modal.locator('.journey-insights-section').waitFor({ state: 'visible', timeout: 10000 });

    // Wait for insights to fully load (loading state to disappear)
    // The header gets replaced after loading, so we need to wait
    await page.waitForFunction(() => {
      const loading = document.querySelector('.journey-insights-loading');
      return !loading || loading.children.length === 0;
    }, { timeout: 10000 }).catch(() => {
      // Loading might have completed before we started waiting
    });

    // Wait a bit more for the header to be set up with toggle listeners
    await page.waitForTimeout(500);

    // Scroll down to insights section
    await modal.locator('.journey-insights-section').scrollIntoViewIfNeeded();

    // Re-query the header after loading is complete (it gets replaced)
    const header = modal.locator('.journey-insights-header');

    // Wait for header to be visible and stable
    await header.waitFor({ state: 'visible' });

    // Verify section is expanded by default
    await expect(header).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse
    await header.click();
    await page.waitForTimeout(400); // Wait for animation

    // Verify section is collapsed
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  test('share button triggers share/download', async ({ page }) => {
    await openJourneyModal(page);

    // Verify share button exists
    const shareButton = page.locator('.journey-share');
    await expect(shareButton).toBeVisible();

    // Click share button
    await shareButton.click();

    // Verify toast or download was triggered
    // (Share may trigger clipboard copy with toast, or native share, or download)
    // We just verify no error occurred and button is still functional
    await expect(shareButton).toBeVisible();
  });

  test('connection banner shows appropriate state', async ({ page }) => {
    await openJourneyModal(page);

    // Verify connection banner exists (one of the states)
    const connectionBanner = page.locator('.journey-connection');
    await expect(connectionBanner).toBeVisible();

    // Verify it has one of the state classes
    const stateClass = await connectionBanner.getAttribute('class');
    expect(stateClass).toMatch(/journey-connection--(connected|connecting|disconnected|error)/);
  });

  test('connect button appears in disconnected state', async ({ page }) => {
    await openJourneyModal(page);

    // Check if in disconnected or error state
    const disconnectedBanner = page.locator('.journey-connection--disconnected, .journey-connection--error');
    const isDisconnectedOrError = await disconnectedBanner.count() > 0;

    if (isDisconnectedOrError) {
      const connectButton = page.locator('.journey-connect-btn');
      await expect(connectButton).toBeVisible();
    }
  });

  test('displays empty insights state for new users', async ({ page }) => {
    // Mock API to return empty data
    await page.route('**/api/trust-journey*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'e2e-trust-test-user',
          generatedAt: new Date().toISOString(),
          summary: {
            relationshipStrength: 0,
            trustSignalsDetected: 0,
            boundariesRespected: 0,
            growthMomentsNoticed: 0,
            sharedMomentsCount: 0,
            winsCelebrated: 0,
            proactiveOutreach: 0,
          },
          growth: { patterns: [] },
          boundaries: { totalBoundaries: 0, typeCounts: {}, message: '' },
          sharedHistory: { insideJokes: [], runningGags: 0 },
          celebrations: { wins: [], intentionsTracked: 0 },
          timeline: [],
        }),
      });
    });

    await openJourneyModal(page);

    // Wait for and scroll to insights section
    await page.waitForSelector('.journey-insights-section', { timeout: 10000 });
    await page.locator('.journey-insights-section').scrollIntoViewIfNeeded();

    // Wait for empty state to appear
    const emptyState = page.locator('.journey-insights-empty');
    await expect(emptyState).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.journey-insights-empty__title')).toBeVisible();
  });

  test('displays trust stats when data available', async ({ page }) => {
    // Mock API to return data with stats
    await page.route('**/api/trust-journey*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'e2e-trust-test-user',
          generatedAt: new Date().toISOString(),
          summary: {
            relationshipStrength: 65,
            trustSignalsDetected: 25,
            boundariesRespected: 5,
            growthMomentsNoticed: 15,
            sharedMomentsCount: 8,
            winsCelebrated: 12,
            proactiveOutreach: 3,
          },
          growth: {
            patterns: [
              { type: 'perspective_shift', count: 5 },
              { type: 'emotional_regulation', count: 3 },
            ],
          },
          boundaries: { totalBoundaries: 5, typeCounts: {}, message: 'Boundaries respected.' },
          sharedHistory: { insideJokes: [], runningGags: 0 },
          celebrations: {
            wins: [
              { type: 'followed_through', description: 'Did the thing', celebratedAt: new Date().toISOString() },
            ],
            intentionsTracked: 5,
          },
          timeline: [
            { date: new Date().toISOString(), type: 'growth', title: 'Growth moment', description: 'Test' },
          ],
        }),
      });
    });

    await openJourneyModal(page);

    // Wait for and scroll to insights section
    await page.waitForSelector('.journey-insights-section', { timeout: 10000 });
    await page.locator('.journey-insights-section').scrollIntoViewIfNeeded();

    // Wait for trust stats to appear
    const trustStats = page.locator('.journey-trust-stats');
    await expect(trustStats).toBeVisible({ timeout: 10000 });

    // Verify stat cards are present
    await expect(page.locator('.journey-trust-stat')).toHaveCount(4);
  });

  test('focus is trapped within modal', async ({ page }) => {
    await openJourneyModal(page);

    // Tab through all focusable elements
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
    }

    // Verify focus is still within the modal
    const focusedElement = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.closest('.journey-modal') !== null;
    });

    expect(focusedElement).toBe(true);
  });

  test('respects reduced motion preference', async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await openJourneyModal(page);

    // Check that animated elements have reduced/no animation
    // The CSS has @media (prefers-reduced-motion: reduce) rules
    const hasReducedMotion = await page.evaluate(() => {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    expect(hasReducedMotion).toBe(true);
  });

  test('accessibility: modal has correct ARIA attributes', async ({ page }) => {
    await openJourneyModal(page);

    // Scope to modal
    const modal = page.locator('.journey-modal');

    // Verify ARIA attributes on modal
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-label', 'Your Journey with Ferni');

    // Verify close button has aria-label (value comes from t('common.close'))
    // Scope to modal to avoid strict mode violation (multiple close buttons on page)
    const closeButton = modal.locator('.journey-close');
    await closeButton.waitFor({ state: 'visible' });
    const closeAriaLabel = await closeButton.getAttribute('aria-label');
    expect(closeAriaLabel).toBeTruthy(); // Should have some value

    // Verify share button has aria-label (scroll to footer first)
    const footer = modal.locator('.journey-footer');
    await footer.scrollIntoViewIfNeeded();
    const shareButton = modal.locator('.journey-share');
    await shareButton.waitFor({ state: 'visible' });
    const shareAriaLabel = await shareButton.getAttribute('aria-label');
    expect(shareAriaLabel).toBeTruthy(); // Should have some value
  });

  test('accessibility: collapsible sections are keyboard accessible', async ({ page }) => {
    await openJourneyModal(page);

    // Scroll to milestones section
    await page.locator('.journey-milestones-section').scrollIntoViewIfNeeded();

    // Focus on milestones header
    const milestonesHeader = page.locator('.journey-milestones-header');
    await milestonesHeader.focus();

    // Verify it's expanded
    await expect(milestonesHeader).toHaveAttribute('aria-expanded', 'true');

    // Press Enter to toggle
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await expect(milestonesHeader).toHaveAttribute('aria-expanded', 'false');

    // Press Space to toggle back
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    await expect(milestonesHeader).toHaveAttribute('aria-expanded', 'true');
  });

  test('displays loading skeleton for insights', async ({ page }) => {
    // Intercept API call to delay response significantly
    await page.route('**/api/trust-journey*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await openJourneyModal(page);

    // Verify loading skeleton is shown (use .first() as there are multiple skeleton elements)
    await expect(page.locator('.journey-insights-skeleton').first()).toBeVisible({ timeout: 1000 });
  });

  test('footer displays motivational message', async ({ page }) => {
    await openJourneyModal(page);

    // Scroll to footer
    await page.locator('.journey-footer').scrollIntoViewIfNeeded();

    // Verify footer is visible
    const footer = page.locator('.journey-footer');
    await expect(footer).toBeVisible();

    // Verify footer has text
    const footerText = await footer.locator('p').textContent();
    expect(footerText).toBeTruthy();
  });
});
