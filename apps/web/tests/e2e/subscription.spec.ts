/**
 * E2E Tests for Subscription Flow
 *
 * Tests the subscription experience:
 * - Free tier limitations
 * - Upgrade prompts
 * - Subscription modal
 * - Tier changes
 *
 * Subscription status comes from /subscription/status on the UI server; it is
 * mocked per test with page.route (see fixtures.ts for the shared mocks).
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

/** Persona members only: the roster also holds a "More" (marketplace) button. */
const MEMBER = '.team-member[data-persona-id]';
const CORE_TEAM = ['maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'];

type Tier = 'free' | 'friend' | 'partner';

/**
 * Seed a returning user: the subscription badge (the entry point to the
 * upgrade modal) stays hidden during the very first conversation.
 */
async function seedReturningUser(
  page: Page,
  options: { tier: Tier; unlocked: string[]; roster: string[] }
): Promise<void> {
  await page.addInitScript(({ tier, unlocked, roster }) => {
    localStorage.setItem('ferni:conversation_count', '3');
    localStorage.setItem('ferni:onboarding:complete', 'true');
    localStorage.setItem(
      'ferni_team_unlock_state',
      JSON.stringify({ unlockedMembers: unlocked, tier, almostThereShown: [], timestamp: Date.now() })
    );
    localStorage.setItem(
      'ferni_roster_prefs',
      JSON.stringify({ addedMembers: roster, showAllMembers: false, isFirstVisit: false, lastUpdated: Date.now() })
    );
  }, options);

  await page.route('**/subscription/status**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tier: options.tier,
        status: 'active',
        usage: { conversationsRemaining: null, canStartConversation: true },
      }),
    })
  );
}

/** Load the app and wait until it has asked the (mocked) backend for the subscription status. */
async function gotoApp(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === '/subscription/status', { timeout: 20000 }),
    page.goto('/'),
  ]);
}

async function openUpgradeModal(page: Page): Promise<void> {
  const badge = page.locator('.subscription-badge');
  await expect(badge).toBeVisible({ timeout: 10000 });
  await badge.click();
  await expect(page.locator('.subscription-modal--visible')).toBeVisible();
}

test.describe('Subscription Flow', () => {
  test.describe('Free Tier Experience', () => {
    test('should invite free users to support without a usage limit', async ({ page }) => {
      await seedReturningUser(page, { tier: 'free', unlocked: [], roster: [] });
      await gotoApp(page);

      // Founders Fund: Ferni is free forever, so there is no "N conversations left"
      const badge = page.locator('.subscription-badge');
      await expect(badge).toBeVisible({ timeout: 10000 });
      await expect(badge).toHaveText(/Community/);
      await expect(page.locator('[data-testid="conversation-limit"]')).toHaveCount(0);
    });

    test('should show locked team members', async ({ page }) => {
      await seedReturningUser(page, { tier: 'free', unlocked: [], roster: ['maya-santos'] });
      await gotoApp(page);

      const maya = page.locator(`${MEMBER}[data-persona-id="maya-santos"]`);
      await expect(maya).toHaveClass(/team-member--locked/, { timeout: 10000 });
      await expect(maya).toHaveAttribute('data-locked', 'true');
      // Ferni (coordinator) is never locked
      await expect(page.locator(`${MEMBER}.team-member--coach`)).not.toHaveClass(/team-member--locked/);
    });
  });

  test.describe('Upgrade Modal', () => {
    test.beforeEach(async ({ page }) => {
      await seedReturningUser(page, { tier: 'free', unlocked: [], roster: [] });
      await gotoApp(page);
    });

    test('should open subscription modal from the badge', async ({ page }) => {
      await openUpgradeModal(page);
      await expect(page.locator('.subscription-modal--visible [role="radiogroup"]')).toBeVisible();
    });

    test('should display tier options', async ({ page }) => {
      await openUpgradeModal(page);

      // At least free + one paid tier
      const tierCards = page.locator('.subscription-modal--visible .tier-card');
      expect(await tierCards.count()).toBeGreaterThanOrEqual(2);
    });

    test('should show correct pricing', async ({ page }) => {
      await openUpgradeModal(page);

      const prices = page.locator('.subscription-modal--visible .tier-price');
      expect(await prices.count()).toBeGreaterThan(0);
      await expect(prices.last()).toHaveText(/[$€£]/);
    });

    test('should close modal with escape key', async ({ page }) => {
      await openUpgradeModal(page);

      await page.keyboard.press('Escape');
      await expect(page.locator('.subscription-modal--visible')).toHaveCount(0);
    });

    test('should close modal with close button', async ({ page }) => {
      await openUpgradeModal(page);

      await page.locator('.subscription-modal--visible .subscription-close').click();
      await expect(page.locator('.subscription-modal--visible')).toHaveCount(0);
    });
  });

  test.describe('Tier Benefits', () => {
    test('should unlock team members on upgrade', async ({ page }) => {
      await seedReturningUser(page, { tier: 'friend', unlocked: CORE_TEAM, roster: CORE_TEAM });
      // Use the built-in persona list so every core team member can render
      await page.route('**/api/agents', (route) => route.fulfill({ status: 500, body: '' }));
      await gotoApp(page);

      const members = page.locator(MEMBER);
      await expect(members).toHaveCount(CORE_TEAM.length + 1, { timeout: 10000 });
      await expect(page.locator(`${MEMBER}.team-member--locked`)).toHaveCount(0);
    });

    test('should show subscription badge', async ({ page }) => {
      await seedReturningUser(page, { tier: 'partner', unlocked: CORE_TEAM, roster: [] });
      await gotoApp(page);

      const badge = page.locator('.subscription-badge');
      await expect(badge).toHaveClass(/subscription-badge--premium/, { timeout: 10000 });
      await expect(badge).toHaveText(/Patron/);
    });
  });

  test.describe('Manage Subscription', () => {
    test('should show manage subscription option for subscribers', async ({ page }) => {
      await seedReturningUser(page, { tier: 'friend', unlocked: CORE_TEAM, roster: [] });
      await gotoApp(page);

      await page.getByRole('button', { name: 'Open settings' }).click();
      // "Account & Billing" opens the manage-subscription modal
      await expect(page.locator('[data-action="billing"]').first()).toBeVisible();
    });
  });
});

test.describe('Dev Mode Subscription Testing', () => {
  test('should enable dev mode with URL parameter', async ({ page }) => {
    await page.goto('/?dev');

    await expect(page.getByRole('button', { name: 'Open dev panel' })).toBeVisible({ timeout: 10000 });
  });

  test('should unlock all with dev shortcut', async ({ page }) => {
    await seedReturningUser(page, { tier: 'free', unlocked: [], roster: ['maya-santos'] });
    await page.goto('/?dev');

    const maya = page.locator(`${MEMBER}[data-persona-id="maya-santos"]`);
    await expect(maya).toHaveClass(/team-member--locked/, { timeout: 10000 });

    // Cmd/Ctrl+Shift+U unlocks every team member
    await page.keyboard.press('Control+Shift+U');
    await expect(maya).not.toHaveClass(/team-member--locked/);
  });

  test('should toggle dev panel with shortcut', async ({ page }) => {
    await page.goto('/?dev');
    await page.waitForLoadState('load');

    await expect(page.getByRole('button', { name: 'Open dev panel' })).toBeVisible({ timeout: 10000 });

    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('.dev-panel--visible')).toBeVisible();

    await page.keyboard.press('Control+Shift+D');
    await expect(page.locator('.dev-panel--visible')).toHaveCount(0);
  });
});
