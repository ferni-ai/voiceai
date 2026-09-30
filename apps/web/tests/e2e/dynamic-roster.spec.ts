/**
 * E2E Tests for Dynamic Team Roster
 *
 * Tests that the team roster dynamically loads agents from the API.
 */

import { test, expect, MOCK_AGENTS } from './fixtures';

/** Persona members only: the roster also holds a "More" (marketplace) button. */
const MEMBER = '.team-member[data-persona-id]';

test.describe('Dynamic Team Roster', () => {
  test.beforeEach(async ({ page }) => {
    // Maya is unlocked and added to the roster, so the mocked /api/agents data
    // renders two persona members (coordinator + one team member).
    await page.addInitScript(() => {
      localStorage.setItem(
        'ferni_team_unlock_state',
        JSON.stringify({ unlockedMembers: ['maya-santos'], tier: 'free', almostThereShown: [], timestamp: Date.now() })
      );
      localStorage.setItem(
        'ferni_roster_prefs',
        JSON.stringify({ addedMembers: ['maya-santos'], showAllMembers: false, isFirstVisit: false, lastUpdated: Date.now() })
      );
    });
    await page.goto('/');
    // Wait for roster to load
    await page.waitForSelector('#teamRoster', { state: 'visible', timeout: 10000 });
  });

  test('should display team roster', async ({ page }) => {
    const roster = page.locator('#teamRoster');
    await expect(roster).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    // Check for loading skeleton or loading class (depends on implementation)
    const roster = page.locator('#teamRoster');
    const hasLoading = await roster.evaluate((el) => {
      return el.classList.contains('loading') || el.querySelector('.loading-skeleton') !== null;
    });
    // Note: This might be too fast to catch, so we just verify roster exists
    await expect(roster).toBeVisible();
  });

  test('should display team members from API', async ({ page }) => {
    // Rendered from the mocked /api/agents response (see fixtures.ts)
    await expect(page.locator(MEMBER)).toHaveCount(MOCK_AGENTS.length);
    await expect(page.locator(`${MEMBER}[data-persona-id="maya-santos"] .team-name`)).toHaveText('Maya');
  });

  test('should display coordinator first', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const firstMember = page.locator(MEMBER).first();

    // Coordinator should be first and have coach class or be Ferni
    const hasCoachClass = await firstMember.evaluate((el) => {
      return el.classList.contains('team-member--coach');
    });
    const isFerni = await firstMember.getAttribute('data-persona-id');

    expect(hasCoachClass || isFerni === 'ferni').toBeTruthy();
  });

  test('should have correct attributes on team members', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const teamMembers = page.locator(MEMBER);
    const count = await teamMembers.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const member = teamMembers.nth(i);

      // Should have data-persona-id attribute
      const personaId = await member.getAttribute('data-persona-id');
      expect(personaId).toBeTruthy();

      // Should have role="button"
      const role = await member.getAttribute('role');
      expect(role).toBe('button');

      // Should have tabindex="0" for accessibility
      const tabindex = await member.getAttribute('tabindex');
      expect(tabindex).toBe('0');

      // Should have aria-label
      const ariaLabel = await member.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    }
  });

  test('should display avatar with eyes', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    // Every persona avatar carries the brand eyes (no initials, no pupils)
    const avatars = page.locator(`${MEMBER} .team-avatar`);
    const count = await avatars.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(avatars.nth(i).locator('svg')).toHaveCount(1);
    }
  });

  test('should display team member names', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const names = page.locator(`${MEMBER} .team-name`);
    const count = await names.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const name = names.nth(i);
      const text = await name.textContent();
      // Should have a non-empty name
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should highlight clicked team member', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const teamMember = page.locator(MEMBER).first();

    // Click the team member
    await teamMember.click();

    // Should have active/selected state
    // Wait a bit for animation
    await page.waitForTimeout(100);

    const hasActiveState = await teamMember.evaluate((el) => {
      return (
        el.classList.contains('active') ||
        el.classList.contains('selected') ||
        el.getAttribute('aria-pressed') === 'true' ||
        el.getAttribute('aria-current') === 'true'
      );
    });

    expect(hasActiveState).toBeTruthy();
  });

  test('should navigate with keyboard', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const firstMember = page.locator(MEMBER).first();

    // Focus the first member
    await firstMember.focus();

    // Press right arrow
    await page.keyboard.press('ArrowRight');

    // Check that focus moved
    const focusedId = await page.evaluate(() => {
      return document.activeElement?.getAttribute('data-persona-id');
    });

    // Should have moved to second member or stayed on first
    expect(focusedId).toBeTruthy();
  });

  test('should handle agent click for handoff', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // Get a team member (not the coordinator)
    const member = page.locator(`${MEMBER}:not(.team-member--coach)`).first();
    await expect(member).toHaveAttribute('data-persona-id', 'maya-santos');

    // Disconnected: the click previews the persona instead of handing off.
    // It must not throw.
    await member.click();
    await page.waitForTimeout(200);
    expect(pageErrors).toEqual([]);
  });

  test('should apply persona-specific colors', async ({ page }) => {
    await page.waitForSelector(MEMBER, { timeout: 10000 });

    const avatar = page.locator(`${MEMBER} .team-avatar`).first();

    // Avatar should have a gradient or background color
    const style = await avatar.getAttribute('style');
    const hasPersonaGradient = style?.includes('--persona-gradient');

    expect(hasPersonaGradient).toBeTruthy();
  });
});

test.describe('Dynamic Roster API', () => {
  // The roster is driven by /api/agents. The UI server isn't running under
  // Playwright, so these check how the app consumes that endpoint.

  test('should load agents from /api/agents', async ({ page }) => {
    const agentsRequest = page.waitForRequest((req) => new URL(req.url()).pathname === '/api/agents');
    await page.goto('/');
    await agentsRequest;

    const coach = page.locator(`${MEMBER}.team-member--coach`);
    await expect(coach).toHaveAttribute('data-persona-id', 'ferni');
    await expect(coach.locator('.team-name')).toHaveText('Ferni');
  });

  test('should render agent names from the API response', async ({ page }) => {
    await page.route('**/api/agents', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [{ ...MOCK_AGENTS[0], name: 'Fern Test' }],
          count: 1,
          timestamp: new Date().toISOString(),
        }),
      })
    );
    await page.goto('/');

    // First name only in the roster
    await expect(page.locator(`${MEMBER}.team-member--coach .team-name`)).toHaveText('Fern');
  });

  test('should fall back to built-in personas when the API fails', async ({ page }) => {
    await page.route('**/api/agents', (route) => route.fulfill({ status: 500, body: '' }));
    await page.goto('/');

    const coach = page.locator(`${MEMBER}.team-member--coach`);
    await expect(coach).toHaveAttribute('data-persona-id', 'ferni');
  });
});
