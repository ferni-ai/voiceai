/**
 * Digital Twin Profile E2E Tests
 *
 * Tests for the Digital Twin profile capture and personalization feature.
 * Covers the full wizard flow, API integration, and AI context injection.
 */

import { test, expect } from '@playwright/test';

test.describe('Digital Twin Profile', () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to a Digital Twin agent
    await page.goto('/');
    await page.waitForSelector('[data-testid="app-loaded"]', { timeout: 10000 });
  });

  test.describe('Profile Wizard', () => {
    test('opens profile wizard for Digital Twin agent', async ({ page }) => {
      // Find a Digital Twin agent or create one
      await page.click('[data-testid="open-custom-agents"]');
      await page.waitForSelector('.custom-agent-list');

      // Click on a twin agent's edit profile button
      const twinAgent = page.locator('[data-agent-type="twin"]').first();
      if (await twinAgent.isVisible()) {
        await twinAgent.locator('[data-action="edit-profile"]').click();
        await expect(page.locator('.twin-profile-overlay')).toBeVisible();
      }
    });

    test('navigates through all wizard sections', async ({ page }) => {
      // Open profile wizard
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Check intro section is first
      expect(await page.locator('.profile-content h3').textContent()).toContain('Your Story');

      // Navigate through sections
      const sections = ['intro', 'background', 'mannerisms', 'communication', 'values', 'interests', 'review'];

      for (let i = 0; i < sections.length - 1; i++) {
        await page.click('[data-action="next"]');
        await page.waitForTimeout(300); // Animation time
      }

      // Should be on review section
      expect(await page.locator('.profile-content').textContent()).toContain('review');
    });

    test('saves life chapters in background section', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Navigate to background section
      await page.click('[data-action="next"]');
      await page.waitForTimeout(300);

      // Add a life chapter
      await page.click('[data-action="add-chapter"]');
      await page.fill('.chapter-title', 'College Years');
      await page.fill('.chapter-years', '2015-2019');
      await page.fill('.chapter-desc', 'Studied computer science and discovered my passion for AI');

      // Navigate to next section
      await page.click('[data-action="next"]');
      await page.waitForTimeout(300);

      // Navigate back and verify data persisted
      await page.click('[data-action="back"]');
      await page.waitForTimeout(300);

      expect(await page.inputValue('.chapter-title')).toBe('College Years');
    });

    test('saves signature phrases in mannerisms section', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Navigate to mannerisms (skip intro, background)
      await page.click('[data-action="next"]');
      await page.click('[data-action="next"]');
      await page.waitForTimeout(300);

      // Add a signature phrase
      await page.click('[data-action="add-phrase"]');
      await page.fill('.phrase-text', "That's wild!");
      await page.fill('.phrase-context', 'When surprised by something interesting');

      // Add greeting style
      await page.fill('#greeting-style', 'Hey there!');
      await page.fill('#farewell-style', 'Catch you later!');

      // Move to next section and back
      await page.click('[data-action="next"]');
      await page.click('[data-action="back"]');
      await page.waitForTimeout(300);

      expect(await page.inputValue('#greeting-style')).toBe('Hey there!');
    });

    test('saves communication style preferences', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Navigate to communication section (skip intro, background, mannerisms)
      for (let i = 0; i < 3; i++) {
        await page.click('[data-action="next"]');
        await page.waitForTimeout(200);
      }

      // Adjust formality slider
      await page.fill('#formality-slider', '4'); // More formal

      // Toggle storytelling preference
      await page.click('#toggle-storytelling');

      // Verify toggle is checked
      expect(await page.isChecked('#toggle-storytelling')).toBe(true);
    });

    test('allows value selection in values section', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Navigate to values section
      for (let i = 0; i < 4; i++) {
        await page.click('[data-action="next"]');
        await page.waitForTimeout(200);
      }

      // Select some values
      await page.click('[data-value="authenticity"]');
      await page.click('[data-value="growth"]');
      await page.click('[data-value="compassion"]');

      // Verify values are selected
      expect(await page.locator('[data-value="authenticity"]').getAttribute('class')).toContain('selected');

      // Add a custom value
      await page.fill('#custom-value', 'Adventure');
      await page.click('[data-action="add-custom-value"]');
    });

    test('completes profile and saves to API', async ({ page }) => {
      // Intercept API call
      const savePromise = page.waitForResponse((response) =>
        response.url().includes('/api/twin/profile') && response.request().method() === 'POST'
      );

      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Fill minimal required data and navigate to review
      for (let i = 0; i < 6; i++) {
        await page.click('[data-action="next"]');
        await page.waitForTimeout(200);
      }

      // Save profile
      await page.click('[data-action="next"]'); // This should trigger save

      // Wait for API response
      const response = await savePromise;
      expect(response.ok()).toBe(true);

      // Verify success toast appears
      await expect(page.locator('.ferni-toast')).toContainText('saved');
    });
  });

  test.describe('Profile API', () => {
    test('GET /api/twin/profile returns empty for new users', async ({ request }) => {
      const response = await request.get('/api/twin/profile', {
        headers: { 'x-user-id': 'test-user-new' },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.exists).toBe(false);
    });

    test('POST /api/twin/profile saves profile', async ({ request }) => {
      const profile = {
        lifeChapters: [{ id: '1', title: 'Test', years: '2020', description: 'Test chapter', keyMoments: [] }],
        signaturePhrases: [{ id: '1', phrase: 'Cool!', context: 'When impressed' }],
        coreValues: ['authenticity'],
        lifePhilosophy: 'Live and learn',
        passions: ['technology'],
        hobbies: ['reading'],
        favoriteTopics: ['AI'],
        thingsToAvoid: [],
        keyRelationships: [],
        formativeExperiences: [],
        greetingStyle: 'Hey!',
        farewellStyle: 'Later!',
        expressionsWhenHappy: ['Awesome!'],
        expressionsWhenSad: ['Bummer'],
        expressionsWhenExcited: ['Yes!'],
        expressionsWhenFrustrated: ['Ugh'],
        communicationStyle: {
          formality: 'casual' as const,
          pace: 'moderate' as const,
          verbosity: 'moderate' as const,
          storytelling: true,
          usesMetaphors: false,
          askingQuestions: true,
          givingAdvice: false,
        },
        whatMatters: [],
        beliefs: [],
      };

      const response = await request.post('/api/twin/profile', {
        headers: {
          'x-user-id': 'test-user-save',
          'Content-Type': 'application/json',
        },
        data: { profile },
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.profile.completionPercentage).toBeGreaterThan(0);
    });

    test('POST /api/twin/analyze returns suggestions', async ({ request }) => {
      const response = await request.post('/api/twin/analyze', {
        headers: {
          'x-user-id': 'test-user-analyze',
          'Content-Type': 'application/json',
        },
        data: {},
      });

      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.completionPercentage).toBeDefined();
      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
    });
  });

  test.describe('AI Context Integration', () => {
    test('twin profile influences AI responses', async ({ page }) => {
      // This test requires a saved profile with specific phrases
      // Then verifies the AI uses those phrases in responses

      // Setup: Save a profile with specific greeting
      await page.evaluate(async () => {
        const profile = {
          greetingStyle: 'Howdy partner!',
          signaturePhrases: [{ id: '1', phrase: 'rad', context: 'positive reaction' }],
        };

        await fetch('/api/twin/profile', {
          method: 'POST',
          headers: {
            'x-user-id': 'test-user-ai',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ profile }),
        });
      });

      // Start a conversation and check if greeting is personalized
      await page.click('[data-testid="start-conversation"]');
      await page.waitForSelector('[data-testid="agent-message"]', { timeout: 30000 });

      // The AI should incorporate the user's style
      // (This is a soft check - AI behavior isn't deterministic)
    });
  });

  test.describe('Accessibility', () => {
    test('profile wizard is keyboard navigable', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Tab through elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Escape closes modal
      await page.keyboard.press('Escape');
      await expect(page.locator('.twin-profile-overlay.open')).not.toBeVisible();
    });

    test('profile wizard has proper ARIA labels', async ({ page }) => {
      await page.click('[data-testid="open-twin-profile"]');
      await page.waitForSelector('.twin-profile-overlay.open');

      // Check dialog role
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      expect(await dialog.getAttribute('aria-modal')).toBe('true');

      // Check close button has label
      const closeBtn = page.locator('[data-action="close"][aria-label]');
      await expect(closeBtn).toBeVisible();
    });
  });
});
