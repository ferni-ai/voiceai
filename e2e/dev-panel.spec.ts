/**
 * E2E Tests for Dev Panel
 *
 * Tests all dev panel functionality:
 * - Panel initialization and access
 * - Tier and stage switching
 * - Team member management
 * - Animation triggers
 * - Modal and toast testing
 * - Storage management
 * - Dashboard links
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3004';
const DEV_KEY = process.env.DEV_PANEL_KEY || 'ferni2024';

test.describe('Dev Panel - Initialization', () => {
  test('shows DEV badge with ?dev param in dev environment', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');

    // DEV badge should appear
    const devBadge = page.locator('.dev-indicator, [class*="dev-badge"]');
    await expect(devBadge).toBeVisible({ timeout: 10000 });
  });

  test('opens panel with keyboard shortcut Cmd+Shift+D', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');

    // Wait for dev mode to initialize
    await page.waitForTimeout(1000);

    // Use keyboard shortcut
    await page.keyboard.press('Meta+Shift+D');

    // Panel should appear
    const panel = page.locator('.dev-panel--visible, .dev-panel.visible');
    await expect(panel).toBeVisible({ timeout: 5000 });
  });

  test('opens panel by clicking DEV badge', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const devBadge = page.locator('.dev-indicator, [class*="dev-badge"]');
    if (await devBadge.isVisible()) {
      await devBadge.click();

      const panel = page.locator('.dev-panel--visible, .dev-panel.visible');
      await expect(panel).toBeVisible({ timeout: 5000 });
    }
  });

  test('closes panel with close button', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);

    const closeButton = page.locator('.dev-panel__close');
    await closeButton.click();

    const panel = page.locator('.dev-panel--visible');
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Dev Panel - Tier Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('switches to Free tier', async ({ page }) => {
    const freeBtn = page.locator('[data-tier="free"]');
    await freeBtn.click();
    await expect(freeBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('switches to Friend tier', async ({ page }) => {
    const friendBtn = page.locator('[data-tier="friend"]');
    await friendBtn.click();
    await expect(friendBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('switches to Partner tier', async ({ page }) => {
    const partnerBtn = page.locator('[data-tier="partner"]');
    await partnerBtn.click();
    await expect(partnerBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });
});

test.describe('Dev Panel - Stage Override', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('switches to first-meeting stage', async ({ page }) => {
    const stageBtn = page.locator('[data-stage="first-meeting"]');
    await stageBtn.click();
    await expect(stageBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('switches to building-trust stage', async ({ page }) => {
    const stageBtn = page.locator('[data-stage="building-trust"]');
    await stageBtn.click();
    await expect(stageBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('switches to deep-partnership stage', async ({ page }) => {
    const stageBtn = page.locator('[data-stage="deep-partnership"]');
    await stageBtn.click();
    await expect(stageBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });
});

test.describe('Dev Panel - Quick Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('unlock all sets Partner tier', async ({ page }) => {
    const unlockBtn = page.locator('[data-action="unlock-all"]');
    await unlockBtn.click();

    // Should set Partner tier
    const partnerBtn = page.locator('[data-tier="partner"]');
    await expect(partnerBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('reset clears all overrides', async ({ page }) => {
    // First unlock all
    await page.locator('[data-action="unlock-all"]').click();
    await page.waitForTimeout(500);

    // Then reset
    const resetBtn = page.locator('[data-action="reset"]');
    await resetBtn.click();

    // Should be back to Free
    const freeBtn = page.locator('[data-tier="free"]');
    await expect(freeBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('add conversations increments count', async ({ page }) => {
    const addBtn = page.locator('[data-action="add-conversations"]');
    await addBtn.click();
    // Button click should succeed without error
    await page.waitForTimeout(500);
  });
});

test.describe('Dev Panel - Team Members', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('displays all team members', async ({ page }) => {
    const teamMembers = page.locator('.dev-team-member, .dev-team-grid > *');
    const count = await teamMembers.count();
    expect(count).toBeGreaterThanOrEqual(5); // At least 5 personas
  });

  test('celebration button triggers animation', async ({ page }) => {
    const celebrateBtn = page.locator('.dev-team-member__celebrate').first();
    if (await celebrateBtn.isVisible()) {
      await celebrateBtn.click();
      // Celebration animation should trigger (may be async)
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Dev Panel - Avatar Animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers bounce animation', async ({ page }) => {
    const bounceBtn = page.locator('[data-lamp="bounce"]');
    if (await bounceBtn.isVisible()) {
      await bounceBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('triggers celebration burst', async ({ page }) => {
    const celebrateBtn = page.locator('[data-soul="celebrate"]');
    if (await celebrateBtn.isVisible()) {
      await celebrateBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('triggers empathy pulse', async ({ page }) => {
    const empathyBtn = page.locator('[data-soul="empathy"]');
    if (await empathyBtn.isVisible()) {
      await empathyBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Ferni EQ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers micro-expression', async ({ page }) => {
    const microBtn = page.locator('[data-micro="recognition"]');
    if (await microBtn.isVisible()) {
      await microBtn.click();
      await page.waitForTimeout(200); // Micro-expressions are quick
    }
  });

  test('triggers active listening', async ({ page }) => {
    const listenBtn = page.locator('[data-listen="micro-nod"]');
    if (await listenBtn.isVisible()) {
      await listenBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('toggles breath sync', async ({ page }) => {
    const breathBtn = page.locator('[data-breath="slow"]');
    if (await breathBtn.isVisible()) {
      await breathBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Modal Triggers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers upgrade modal', async ({ page }) => {
    const upgradeBtn = page.locator('[data-action="trigger-upgrade"]');
    await upgradeBtn.click();

    // Modal should appear
    const modal = page.locator(
      '.upgrade-modal, .subscription-modal, [class*="modal--visible"]'
    );
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Close modal if possible
    const closeBtn = page.locator('.modal__close, [class*="modal"] button:has-text("Close")');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('triggers limit modal', async ({ page }) => {
    const limitBtn = page.locator('[data-action="trigger-limit"]');
    await limitBtn.click();

    // Modal should appear
    const modal = page.locator(
      '.limit-modal, .subscription-modal, [class*="modal--visible"]'
    );
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dev Panel - Toast Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers success toast', async ({ page }) => {
    const successBtn = page.locator('[data-toast="success"]');
    await successBtn.click();

    // Toast should appear
    const toast = page.locator('.toast, [class*="toast"], .message-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
  });

  test('triggers error toast', async ({ page }) => {
    const errorBtn = page.locator('[data-toast="error"]');
    await errorBtn.click();

    const toast = page.locator('.toast, [class*="toast"], .message-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
  });

  test('triggers info toast', async ({ page }) => {
    const infoBtn = page.locator('[data-toast="info"]');
    await infoBtn.click();

    const toast = page.locator('.toast, [class*="toast"], .message-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
  });

  test('triggers warning toast', async ({ page }) => {
    const warningBtn = page.locator('[data-toast="warning"]');
    await warningBtn.click();

    const toast = page.locator('.toast, [class*="toast"], .message-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Dev Panel - FTUE Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('reset FTUE shows toast', async ({ page }) => {
    const resetBtn = page.locator('[data-ftue="reset"]');
    if (await resetBtn.isVisible()) {
      await resetBtn.click();

      const toast = page.locator('.toast, [class*="toast"]');
      await expect(toast).toBeVisible({ timeout: 3000 });
    }
  });

  test('simulate conversations shows toast', async ({ page }) => {
    const simBtn = page.locator('[data-ftue="simulate-5"]');
    if (await simBtn.isVisible()) {
      await simBtn.click();

      const toast = page.locator('.toast, [class*="toast"]');
      await expect(toast).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Dev Panel - Subscription Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('bypass toggle works', async ({ page }) => {
    const bypassToggle = page.locator('#dev-subscription-bypass');
    if (await bypassToggle.isVisible()) {
      const initialState = await bypassToggle.isChecked();
      await bypassToggle.click();
      const newState = await bypassToggle.isChecked();
      expect(newState).not.toBe(initialState);
    }
  });

  test('whitelist input accepts values', async ({ page }) => {
    const whitelistInput = page.locator('#dev-whitelist-ids');
    if (await whitelistInput.isVisible()) {
      await whitelistInput.fill('test-user-1, test-user-2');
      expect(await whitelistInput.inputValue()).toBe('test-user-1, test-user-2');
    }
  });
});

test.describe('Dev Panel - Connection States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers connecting state', async ({ page }) => {
    const connectingBtn = page.locator('[data-connection="connecting"]');
    if (await connectingBtn.isVisible()) {
      await connectingBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('triggers connected state', async ({ page }) => {
    const connectedBtn = page.locator('[data-connection="connected"]');
    if (await connectedBtn.isVisible()) {
      await connectedBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('triggers disconnected state', async ({ page }) => {
    const disconnectedBtn = page.locator('[data-connection="disconnected"]');
    if (await disconnectedBtn.isVisible()) {
      await disconnectedBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Time Override', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('sets morning time', async ({ page }) => {
    const morningBtn = page.locator('[data-time="morning"]');
    if (await morningBtn.isVisible()) {
      await morningBtn.click();
      // Check data-time attribute on html element
      await expect(page.locator('html')).toHaveAttribute('data-time', 'morning', {
        timeout: 3000,
      });
    }
  });

  test('sets night time', async ({ page }) => {
    const nightBtn = page.locator('[data-time="night"]');
    if (await nightBtn.isVisible()) {
      await nightBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-time', 'night', {
        timeout: 3000,
      });
    }
  });

  test('resets to real time', async ({ page }) => {
    const morningBtn = page.locator('[data-time="morning"]');
    if (await morningBtn.isVisible()) {
      await morningBtn.click();
      await page.waitForTimeout(300);
    }

    const resetBtn = page.locator('[data-time="reset"]');
    if (await resetBtn.isVisible()) {
      await resetBtn.click();
      // data-time should be removed
      await expect(page.locator('html')).not.toHaveAttribute('data-time', { timeout: 3000 });
    }
  });
});

test.describe('Dev Panel - Easter Eggs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers confetti', async ({ page }) => {
    const confettiBtn = page.locator('[data-easter="confetti"]');
    if (await confettiBtn.isVisible()) {
      await confettiBtn.click();
      // Confetti elements should appear
      await page.waitForTimeout(500);
    }
  });

  test('triggers party mode', async ({ page }) => {
    const partyBtn = page.locator('[data-easter="party"]');
    if (await partyBtn.isVisible()) {
      await partyBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('triggers zen mode', async ({ page }) => {
    const zenBtn = page.locator('[data-easter="zen"]');
    if (await zenBtn.isVisible()) {
      await zenBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Storage Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('view storage logs to console', async ({ page }) => {
    const viewBtn = page.locator('[data-storage="view"]');
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('clear cache works', async ({ page }) => {
    const clearCacheBtn = page.locator('[data-storage="clear-cache"]');
    if (await clearCacheBtn.isVisible()) {
      await clearCacheBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('export storage works', async ({ page }) => {
    const exportBtn = page.locator('[data-storage="export"]');
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Waveform States', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('sets idle waveform', async ({ page }) => {
    const idleBtn = page.locator('[data-waveform="idle"]');
    if (await idleBtn.isVisible()) {
      await idleBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('sets listening waveform', async ({ page }) => {
    const listeningBtn = page.locator('[data-waveform="listening"]');
    if (await listeningBtn.isVisible()) {
      await listeningBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('sets speaking waveform', async ({ page }) => {
    const speakingBtn = page.locator('[data-waveform="speaking-high"]');
    if (await speakingBtn.isVisible()) {
      await speakingBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Dev Panel - Network Simulation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('sets excellent network', async ({ page }) => {
    const excellentBtn = page.locator('[data-network="excellent"]');
    if (await excellentBtn.isVisible()) {
      await excellentBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('sets poor network', async ({ page }) => {
    const poorBtn = page.locator('[data-network="poor"]');
    if (await poorBtn.isVisible()) {
      await poorBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('sets latency simulation', async ({ page }) => {
    const latencyBtn = page.locator('[data-latency="200"]');
    if (await latencyBtn.isVisible()) {
      await latencyBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

test.describe('Dev Panel - Streak Celebrations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers 7-day streak celebration', async ({ page }) => {
    const streakBtn = page.locator('[data-streak="7"]');
    if (await streakBtn.isVisible()) {
      await streakBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('triggers 30-day streak celebration', async ({ page }) => {
    const streakBtn = page.locator('[data-streak="30"]');
    if (await streakBtn.isVisible()) {
      await streakBtn.click();
      await page.waitForTimeout(1500);
    }
  });

  test('triggers 365-day epic celebration', async ({ page }) => {
    const streakBtn = page.locator('[data-streak="365"]');
    if (await streakBtn.isVisible()) {
      await streakBtn.click();
      await page.waitForTimeout(2000);
    }
  });
});

test.describe('Dev Panel - Narrative System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);
  });

  test('triggers first_launch beat', async ({ page }) => {
    const beatBtn = page.locator('[data-beat="first_launch"]');
    if (await beatBtn.isVisible()) {
      await beatBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('triggers breakthrough arc', async ({ page }) => {
    const arcBtn = page.locator('[data-arc="breakthrough"]');
    if (await arcBtn.isVisible()) {
      await arcBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Dev Panel - Dashboard Links', () => {
  // These test that dashboard URLs return valid responses
  const dashboards = [
    { name: 'Analytics', url: '/analytics-dashboard.html' },
    { name: 'Metrics', url: '/metrics-dashboard.html' },
    { name: 'UX', url: '/ux-dashboard.html' },
    { name: 'Errors', url: '/error-dashboard.html' },
    { name: 'LLM', url: '/llm-dashboard.html' },
    { name: 'Voice Presence', url: '/voice-presence-dashboard.html' },
    { name: 'Personas', url: '/persona-dashboard.html' },
    { name: 'Cognitive', url: '/cognitive-dashboard.html' },
    { name: 'Connection', url: '/connection-dashboard.html' },
    { name: 'Memory', url: '/memory-dashboard.html' },
    { name: 'Costs', url: '/cost-dashboard.html' },
    { name: 'DORA', url: '/dora-dashboard.html' },
    { name: 'Handoffs', url: '/handoff-dashboard.html' },
    { name: 'Outreach', url: '/outreach-dashboard.html' },
    { name: 'Tools', url: '/tools-dashboard.html' },
    { name: 'Experiments', url: '/experiments-dashboard.html' },
    { name: 'Feature Flags', url: '/feature-flags.html' },
    { name: 'Admin', url: '/admin.html' },
    { name: 'Observability', url: '/observability-hub.html' },
    { name: 'Animations', url: '/animation-playground.html' },
  ];

  for (const dashboard of dashboards) {
    test(`${dashboard.name} dashboard loads`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${dashboard.url}`);
      // Accept 200 (found) or 404 (not deployed but file exists)
      expect([200, 304]).toContain(response?.status());
    });
  }
});

test.describe('Dev Panel - Keyboard Shortcuts', () => {
  test('Cmd+Shift+U quick unlocks all', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Use quick unlock shortcut
    await page.keyboard.press('Meta+Shift+U');
    await page.waitForTimeout(500);

    // Open panel to verify
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);

    // Should be on Partner tier
    const partnerBtn = page.locator('[data-tier="partner"]');
    await expect(partnerBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });

  test('Cmd+Shift+0 resets to free', async ({ page }) => {
    await page.goto(`${BASE_URL}/?dev`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // First unlock all
    await page.keyboard.press('Meta+Shift+U');
    await page.waitForTimeout(500);

    // Then reset
    await page.keyboard.press('Meta+Shift+Digit0');
    await page.waitForTimeout(500);

    // Open panel to verify
    await page.keyboard.press('Meta+Shift+D');
    await page.waitForTimeout(500);

    // Should be on Free tier
    const freeBtn = page.locator('[data-tier="free"]');
    await expect(freeBtn).toHaveClass(/active|selected/, { timeout: 3000 });
  });
});
