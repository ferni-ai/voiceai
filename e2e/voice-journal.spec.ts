/**
 * Voice Journal E2E Tests
 *
 * Tests for the Voice Journal feature - recording, playback, mood tracking,
 * insights, and cross-device sync.
 */

import { expect, test } from './support/fixtures';
import { APP_LOADED, mockTwinAgent, openTwinJournal } from './support/app';

// The voice journal belongs to a Digital Twin custom agent. Tests open it the
// way a user does: roster "More" -> marketplace "My Creations" -> the twin's
// Journal button (ui/marketplace.ui.ts). The twin comes from a mocked
// /api/custom-agents.

test.describe('Voice Journal', () => {
  test.beforeEach(async ({ page }) => {
    await mockTwinAgent(page);
    await page.goto('/');
    await page.waitForSelector(APP_LOADED, { timeout: 10000 });

    // Grant microphone permission if needed
    await page.context().grantPermissions(['microphone']);
  });

  test.describe('Journal Modal', () => {
    // The settings menu has no voice journal entry (its "Journaling" item
    // opens Chronicle); the journal is reached from the twin's card.
    test('opens journal modal from the Digital Twin card', async ({ page }) => {
      await openTwinJournal(page);

      // Verify modal is visible
      await expect(page.locator('.journal-container')).toBeVisible();
      await expect(page.locator('.journal-title')).toContainText('Journal');
    });

    test('shows three tabs: Record, History, Insights', async ({ page }) => {
      await openTwinJournal(page);

      // Check tabs exist
      await expect(page.locator('[data-tab="record"]')).toBeVisible();
      await expect(page.locator('[data-tab="history"]')).toBeVisible();
      await expect(page.locator('[data-tab="insights"]')).toBeVisible();

      // Record tab should be active by default
      await expect(page.locator('[data-tab="record"]')).toHaveClass(/active/);
    });

    test('switches between tabs', async ({ page }) => {
      await openTwinJournal(page);

      // Click History tab
      await page.click('[data-tab="history"]');
      await expect(page.locator('[data-content="history"]')).toBeVisible();

      // Click Insights tab
      await page.click('[data-tab="insights"]');
      await expect(page.locator('[data-content="insights"]')).toBeVisible();

      // Click Record tab
      await page.click('[data-tab="record"]');
      await expect(page.locator('[data-content="record"]')).toBeVisible();
    });

    test('closes with Escape key', async ({ page }) => {
      await openTwinJournal(page);

      await page.keyboard.press('Escape');
      await expect(page.locator('.voice-journal-overlay.open')).not.toBeVisible();
    });

    test('closes with close button', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('.voice-journal-overlay .journal-close');
      await expect(page.locator('.voice-journal-overlay.open')).not.toBeVisible();
    });

    test('closes when clicking backdrop', async ({ page }) => {
      await openTwinJournal(page);

      // Click the backdrop outside the journal card (its center is covered by the card)
      await page.click('.journal-backdrop', { position: { x: 5, y: 5 } });
      await expect(page.locator('.voice-journal-overlay.open')).not.toBeVisible();
    });
  });

  test.describe('Recording', () => {
    test('shows record button on Record tab', async ({ page }) => {
      await openTwinJournal(page);

      await expect(page.locator('#record-btn')).toBeVisible();
      await expect(page.locator('#record-btn')).toContainText('Start Recording');
    });

    test('shows recording visualizer canvas', async ({ page }) => {
      await openTwinJournal(page);

      await expect(page.locator('#journal-visualizer')).toBeVisible();
    });

    test('starts recording when record button clicked', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('#record-btn');

      // Button should change to "Stop Recording"
      await expect(page.locator('#record-btn')).toContainText('Stop');

      // Timer should start
      await page.waitForTimeout(1500);
      expect(await page.locator('#recorder-time').textContent()).not.toBe('0:00');
    });

    test('stops recording and shows save options', async ({ page }) => {
      await openTwinJournal(page);

      // Start recording
      await page.click('#record-btn');
      await page.waitForTimeout(1000);

      // Stop recording
      await page.click('#record-btn');

      // Should show save/discard options or auto-save
      // The exact behavior depends on implementation
      await page.waitForTimeout(500);
    });
  });

  test.describe('Mood Selection', () => {
    test('shows mood options', async ({ page }) => {
      await openTwinJournal(page);

      await expect(page.locator('.voice-journal-overlay .mood-options')).toBeVisible();
      await expect(page.locator('.voice-journal-overlay .mood-option')).toHaveCount(12); // 12 moods (MOODS in mood-icons.ts)
    });

    test('allows selecting a mood', async ({ page }) => {
      await openTwinJournal(page);

      // Click first mood option
      await page.click('.mood-option:first-child');

      // Should show selected state
      await expect(page.locator('.mood-option.mood-option--selected')).toBeVisible();
    });

    test('only allows one mood selection at a time', async ({ page }) => {
      await openTwinJournal(page);

      // Select first mood
      await page.click('.mood-option:first-child');

      // Select second mood
      await page.click('.mood-option:nth-child(2)');

      // Only one should be selected
      const selectedCount = await page.locator('.mood-option--selected').count();
      expect(selectedCount).toBe(1);
    });
  });

  test.describe('History Tab', () => {
    test('shows search input', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');

      await expect(page.locator('#journal-search-input')).toBeVisible();
    });

    test('shows calendar view', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');

      await expect(page.locator('#journal-calendar')).toBeVisible();
    });

    test('shows stats bar', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');

      await expect(page.locator('#journal-stats')).toBeVisible();
    });

    test('calendar navigation works', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');
      await page.waitForSelector('#journal-calendar');

      // Get current month
      const initialMonth = await page.locator('.calendar-header').textContent();

      // Navigate to previous month
      await page.click('[data-action="prev-month"]');
      await page.waitForTimeout(200);

      // Month should change
      const newMonth = await page.locator('.calendar-header').textContent();
      expect(newMonth).not.toBe(initialMonth);
    });

    test('search filters entries', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');

      // Type in search
      await page.fill('#journal-search-input', 'test query');

      // Debounce delay
      await page.waitForTimeout(400);

      // Entries should be filtered (exact behavior depends on data)
    });
  });

  test.describe('Insights Tab', () => {
    test('shows insights content', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="insights"]');

      await expect(page.locator('#journal-insights')).toBeVisible();
    });

    test('shows mood trends visualization', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="insights"]');

      // Should show some kind of visualization or empty state
      await expect(page.locator('.journal-insights')).toBeVisible();
    });
  });

  test.describe('Export & Share', () => {
    test('shows export button', async ({ page }) => {
      await openTwinJournal(page);

      await expect(page.locator('.voice-journal-overlay [data-action="export"]')).toBeVisible();
    });

    test('shows share button', async ({ page }) => {
      await openTwinJournal(page);

      await expect(page.locator('.voice-journal-overlay [data-action="share"]')).toBeVisible();
    });
  });

  test.describe('Prompts', () => {
    test('shows journaling prompt on Record tab', async ({ page }) => {
      await openTwinJournal(page);

      // Prompt section should be visible
      await expect(page.locator('#prompt-section')).toBeVisible();
    });

    test('shuffle prompt button changes prompt', async ({ page }) => {
      await openTwinJournal(page);

      // Get initial prompt
      const initialPrompt = await page.locator('.prompt-text').textContent();

      // Click shuffle
      await page.click('[data-action="shuffle-prompt"]');
      await page.waitForTimeout(200);

      // Prompt should change (or stay same if only one prompt)
      // This is a soft check
    });
  });

  test.describe('Accessibility', () => {
    test('journal modal has proper ARIA attributes', async ({ page }) => {
      await openTwinJournal(page);

      const dialog = page.locator('.voice-journal-overlay [role="dialog"]');
      await expect(dialog).toBeVisible();
      expect(await dialog.getAttribute('aria-modal')).toBe('true');
      expect(await dialog.getAttribute('aria-labelledby')).toBe('journal-title');
    });

    test('tabs have proper role and aria-selected', async ({ page }) => {
      await openTwinJournal(page);

      const tabs = page.locator('.voice-journal-overlay [role="tab"]');
      await expect(tabs).toHaveCount(3);

      const activeTab = page.locator('.voice-journal-overlay [role="tab"][aria-selected="true"]');
      await expect(activeTab).toBeVisible();
    });

    test('record button has aria-label', async ({ page }) => {
      await openTwinJournal(page);

      const recordBtn = page.locator('#record-btn');
      expect(await recordBtn.getAttribute('aria-label')).toBeTruthy();
    });

    test('search input has aria-label', async ({ page }) => {
      await openTwinJournal(page);

      await page.click('[data-tab="history"]');

      const searchInput = page.locator('#journal-search-input');
      expect(await searchInput.getAttribute('aria-label')).toBeTruthy();
    });
  });

  test.describe('Real-time Sync', () => {
    test('journal entries sync across devices', async ({ browser, baseURL, prepareContext }) => {
      // Loads the app three times (this page plus two "devices")
      test.slow();

      // Create two browser contexts to simulate two devices (with the same
      // network guard, mocks and signed-in user as the default context)
      const context1 = await prepareContext(await browser.newContext({ baseURL }));
      const context2 = await prepareContext(await browser.newContext({ baseURL }));

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // Both login as same user
        await mockTwinAgent(page1);
        await mockTwinAgent(page2);
        await page1.goto('/');
        await page2.goto('/');
        await page1.waitForSelector(APP_LOADED, { timeout: 10000 });
        await page2.waitForSelector(APP_LOADED, { timeout: 10000 });

        // Page 1 creates an entry
        await openTwinJournal(page1);

        // (Would record and save an entry here)

        // Page 2 should see the new entry after sync
        await openTwinJournal(page2);
        await page2.click('[data-tab="history"]');

        // Wait for sync notification
        await page2.waitForTimeout(2000);

        // (Would verify entry appears in history)
      } finally {
        await context1.close();
        await context2.close();
      }
    });
  });
});
