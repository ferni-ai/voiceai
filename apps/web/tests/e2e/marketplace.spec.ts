/**
 * E2E Tests for Marketplace
 *
 * Tests the agent marketplace functionality:
 * - Browse agents
 * - Search and filter
 * - Install/uninstall agents
 * - Permission consent
 *
 * In development the registry is served from public/voiceai-agents/.
 */

import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const CORE_TEAM = ['maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor', 'nayan-patel'];

async function seedTeam(page: Page, tier: 'free' | 'friend'): Promise<void> {
  await page.addInitScript(
    ({ tier, unlocked }) => {
      localStorage.setItem('ferni_subscription_tier', tier);
      localStorage.setItem(
        'ferni_team_unlock_state',
        JSON.stringify({ unlockedMembers: unlocked, tier, almostThereShown: [], timestamp: Date.now() })
      );
    },
    { tier, unlocked: tier === 'free' ? [] : CORE_TEAM }
  );
}

async function openMarketplace(page: Page): Promise<void> {
  // The app registers its window event listeners once initialization finishes;
  // the rendered roster is a reliable signal for that.
  await page.locator('#teamRoster .team-member[data-persona-id]').first().waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('ferni:open-marketplace'));
  });
  await expect(page.locator('.marketplace-modal.open')).toBeVisible();
}

/** Install the first available agent through the consent dialog; returns its id. */
async function installFirstAgent(page: Page): Promise<string> {
  const card = page.locator('.marketplace-grid .marketplace-agent[data-agent-id]').first();
  const agentId = (await card.getAttribute('data-agent-id')) ?? '';
  expect(agentId).not.toBe('');
  await card.locator('.agent-action.install').click();
  await page.locator('.permission-consent-modal.visible [data-action="confirm"]').click();

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('voiceai-marketplace-installed') ?? ''))
    .toContain(agentId);
  return agentId;
}

test.describe('Agent Marketplace', () => {
  test.describe('Access Control', () => {
    test('should hide marketplace for locked team', async ({ page }) => {
      await seedTeam(page, 'free');
      await page.goto('/');
      await openMarketplace(page);

      // Locked: a "meet your team first" message and preview cards only
      await expect(page.locator('.marketplace-locked-section')).toBeVisible();
      await expect(page.locator('.marketplace-agent--locked').first()).toBeVisible();
      await expect(page.locator('.marketplace-agent .agent-action.install')).toHaveCount(0);
    });

    test('should keep the lock overlay inside each preview card', async ({ page }) => {
      await seedTeam(page, 'free');
      await page.goto('/');
      await openMarketplace(page);

      const card = page.locator('.marketplace-agent--locked').first();
      const cardBox = await card.boundingBox();
      const overlayBox = await card.locator('.agent-locked-overlay').boundingBox();
      expect(cardBox).not.toBeNull();
      expect(overlayBox).not.toBeNull();
      expect(overlayBox!.height).toBeLessThanOrEqual(cardBox!.height + 1);
      expect(overlayBox!.width).toBeLessThanOrEqual(cardBox!.width + 1);
    });

    test('should show marketplace for unlocked team', async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
      await openMarketplace(page);

      await expect(page.locator('.marketplace-locked-section')).toHaveCount(0);
      await expect(page.locator('.marketplace-agent:not(.marketplace-agent--locked)').first()).toBeVisible();
    });
  });

  test.describe('Browse Agents', () => {
    test.beforeEach(async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
    });

    test('should open marketplace modal', async ({ page }) => {
      await openMarketplace(page);
      await expect(page.locator('#marketplace-title')).toBeVisible();
    });

    test('should open marketplace from the roster', async ({ page }) => {
      await page.locator('#marketplaceBtn').click();
      await expect(page.locator('.marketplace-modal.open')).toBeVisible();
    });

    test('should display agent cards', async ({ page }) => {
      await openMarketplace(page);

      const agentCards = page.locator('.marketplace-grid .marketplace-agent[data-agent-id]');
      await expect(agentCards.first()).toBeVisible();
      expect(await agentCards.count()).toBeGreaterThan(1);
    });

    test('should show agent details', async ({ page }) => {
      await openMarketplace(page);

      await page.locator('.marketplace-grid .marketplace-agent[data-agent-id]').first().click();
      await expect(page.locator('.marketplace-detail')).toBeVisible();
    });
  });

  test.describe('Search and Filter', () => {
    test.beforeEach(async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
      await openMarketplace(page);
    });

    test('should filter agents by search', async ({ page }) => {
      const cards = page.locator('.marketplace-grid .marketplace-agent[data-agent-id]');
      await expect(cards.first()).toBeVisible();
      const before = await cards.count();

      await page.locator('.marketplace-search-input').fill('grief');
      await expect.poll(() => cards.count()).toBeLessThan(before);
      await expect(cards.first()).toContainText(/grief/i);
    });

    test('should filter by category', async ({ page }) => {
      const cards = page.locator('.marketplace-grid .marketplace-agent[data-agent-id]');
      await expect(cards.first()).toBeVisible();

      await page.locator('.marketplace-category-select').selectOption('health');
      await expect(cards.first().locator('.agent-category')).toHaveText(/health/i);
      const categories = await cards.locator('.agent-category').allTextContents();
      expect(categories.length).toBeGreaterThan(0);
      for (const category of categories) {
        expect(category.toLowerCase()).toContain('health');
      }
    });
  });

  test.describe('Install/Uninstall', () => {
    test.beforeEach(async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
      await openMarketplace(page);
    });

    test('should show install button for available agents', async ({ page }) => {
      const install = page.locator('.marketplace-grid .agent-action.install').first();
      await expect(install).toBeVisible();
      // A real label, never a raw i18n key
      await expect(install).not.toHaveText(/marketplace\./);
    });

    test('should show permission consent before install', async ({ page }) => {
      await page.locator('.marketplace-grid .agent-action.install').first().click();

      const consent = page.locator('.permission-consent-modal.visible');
      await expect(consent).toBeVisible();
      await expect(consent.locator('#consent-title')).toHaveText(/^Add .+\?$/);
    });

    test('should install agent after consent', async ({ page }) => {
      const agentId = await installFirstAgent(page);

      // Installed agents leave Discover and join "Your Team"
      await expect(page.locator(`.marketplace-grid .marketplace-agent[data-agent-id="${agentId}"]`)).toHaveCount(0);
      await page.locator('.marketplace-tab[data-tab="installed"]').click();
      await expect(page.locator(`[data-agent-id="${agentId}"]`).first()).toBeVisible();
    });

    test('should uninstall agent', async ({ page }) => {
      const agentId = await installFirstAgent(page);

      await page.locator('.marketplace-tab[data-tab="installed"]').click();
      const uninstall = page.locator(`.agent-action.uninstall[data-agent-id="${agentId}"]`);
      await expect(uninstall).toBeVisible();
      await expect(uninstall).not.toHaveText(/marketplace\./);
      await uninstall.click();

      await expect
        .poll(() => page.evaluate(() => localStorage.getItem('voiceai-marketplace-installed') ?? ''))
        .not.toContain(agentId!);
    });
  });

  test.describe('Tabs', () => {
    test('should switch between browse and installed tabs', async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
      await openMarketplace(page);

      const installedTab = page.locator('.marketplace-tab[data-tab="installed"]');
      await installedTab.click();
      await expect(installedTab).toHaveClass(/active/);
      await expect(page.locator('.marketplace-tab[data-tab="browse"]')).not.toHaveClass(/active/);
    });

    test('should render the creations tab without raw i18n keys', async ({ page }) => {
      await seedTeam(page, 'friend');
      await page.goto('/');
      await openMarketplace(page);

      await page.locator('.marketplace-tab[data-tab="creations"]').click();
      await expect(page.locator('.marketplace-content')).not.toContainText('marketplace.');
    });
  });
});

test.describe('Marketplace API', () => {
  test('should fetch registry', async ({ page }) => {
    // In development, this uses local files
    const response = await page.request.get('/voiceai-agents/registry.json');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.version).toBeDefined();
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBeGreaterThan(0);
  });
});
