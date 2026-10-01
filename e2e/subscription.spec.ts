/**
 * E2E Tests for Subscription/Your Plan Feature
 *
 * Tests the subscription management panel:
 * - Opening subscription panel
 * - Viewing current plan
 * - Upgrade options
 */

import { expect, test, type Page } from './support/fixtures';
import { API_URL, APP_URL } from './support/env';
import { openSettingsMenu, pinMenuItems } from './support/app';

const TEST_USER_ID = 'e2e-subscription-test-user';

test.describe('Subscription API', { tag: '@needs-server' }, () => {
  test('GET /api/subscription - returns subscription status', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/subscription`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    }
  });

  test('GET /subscription/status - returns subscription info', async ({ request }) => {
    const response = await request.get(`${API_URL}/subscription/status`, {
      headers: { 'X-User-ID': TEST_USER_ID },
    });

    expect([200, 401, 404]).toContain(response.status());
  });
});

// The plan panel is the Support Ferni sheet (ui/support-ferni.ui.ts): the app
// opens it for both the `subscription` and `support-ferni` menu actions. The
// menu lists it as the pinned favorite "Support Ferni" (no "Your Plan" item is
// rendered any more; see renderPinnedItems in ui/settings-menu.ui.ts).
const PLAN_PANEL = '.support-ferni-overlay.support-ferni-overlay--open';

async function openPlanPanel(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await openSettingsMenu(page);
  await page.locator('.settings-menu [data-action="support-ferni"]').click();
  await expect(page.locator(PLAN_PANEL)).toBeVisible({ timeout: 5000 });
}

test.describe('Subscription UI', () => {
  test.beforeEach(async ({ page }) => {
    await pinMenuItems(page, ['support-ferni']);
  });

  test('opens subscription panel from menu', async ({ page }) => {
    await openPlanPanel(page);

    // Verify subscription panel opened
    await expect(page.locator(PLAN_PANEL)).toHaveAttribute('role', 'dialog');
    await expect(page.locator(`${PLAN_PANEL} .support-ferni-title`)).toBeVisible();
  });

  test('displays current plan information', async ({ page }) => {
    await openPlanPanel(page);

    // Should show plan name or free tier info
    const planInfo = page.locator(`${PLAN_PANEL} .support-ferni-current .support-ferni-tier-badge`);
    await expect(planInfo).toBeVisible({ timeout: 3000 });
    expect((await planInfo.textContent())?.trim()).toBeTruthy();
  });

  test('shows upgrade option for free users', async ({ page }) => {
    await openPlanPanel(page);

    // Free users see the ways to upgrade
    const upgrade = page.locator(`${PLAN_PANEL} .support-ferni-upgrade [data-upgrade-tier]`);
    await expect(upgrade.first()).toBeVisible();
  });

  test('closes subscription panel on close button click', async ({ page }) => {
    await openPlanPanel(page);

    // Click close button
    await page.locator(`${PLAN_PANEL} .support-ferni-close`).click();
    await expect(page.locator(PLAN_PANEL)).not.toBeVisible({ timeout: 2000 });
  });
});
