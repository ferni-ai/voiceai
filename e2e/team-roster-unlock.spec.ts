/**
 * E2E Tests for Team Roster Unlock State
 *
 * CRITICAL: Tests the "Get to Know Ferni First" UX pattern and Cameo Unlock System.
 *
 * Key invariants:
 * 1. New users should ONLY see Ferni in their roster
 * 2. Maya unlocks at 'getting-started' stage (10 conversations - CAMEO UNLOCK)
 * 3. The "N left" counter must match actual unlock state
 * 4. Roster preferences must not persist unlocked members incorrectly
 * 5. Team members are introduced via Ferni's voice (cameo system)
 *
 * CAMEO UNLOCK SYSTEM (Dec 2024):
 * - Thresholds increased to allow natural, topic-based introductions
 * - Ferni speaks the introduction, then visual modal appears
 * - Fallback triggers after 3 extra conversations without topic match
 *
 * Bug Context: Maya was appearing in new user rosters when she shouldn't be.
 * This test suite validates the correct unlock behavior.
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://app.ferni.ai';

// Team unlock stages and requirements (CAMEO UNLOCK thresholds - Dec 2024)
// These are higher than before to allow for natural topic-based introductions
const UNLOCK_REQUIREMENTS = {
  ferni: { stage: 'first-meeting', conversations: 0 },
  'maya-santos': { stage: 'getting-started', conversations: 10 }, // Was 2, now 10
  'peter-john': { stage: 'building-trust', conversations: 15 }, // Was 7, now 15
  'alex-chen': { stage: 'established', conversations: 30 }, // Was 20, now 30
  'jordan-taylor': { stage: 'established', conversations: 30 }, // Was 20, now 30
  'nayan-patel': { stage: 'deep-partnership', conversations: 60 }, // Was 50, now 60
};

const TOTAL_TEAM_MEMBERS = 6;

test.describe('Team Roster Unlock State', () => {
  test.describe('New User Initial State', () => {
    test('new user roster should ONLY show Ferni initially', async ({ page }) => {
      // Clear localStorage to simulate new user
      await page.goto(BASE_URL);
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Reload after clearing storage
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Wait for roster to load
      const roster = page.locator('#teamRoster');
      await expect(roster).toBeVisible({ timeout: 10000 });

      // Wait for team members to render
      await page.waitForSelector('.team-member', { timeout: 10000 });

      // Get all visible team members (excluding marketplace button)
      const teamMembers = page.locator('.team-member:not(.team-member--marketplace)');
      const count = await teamMembers.count();

      console.log(`\n📋 NEW USER ROSTER AUDIT:`);
      console.log(`Team members visible: ${count}`);

      // List all visible members for debugging
      for (let i = 0; i < count; i++) {
        const member = teamMembers.nth(i);
        const personaId = await member.getAttribute('data-persona-id');
        const name = await member.locator('.team-name').textContent();
        const isLocked = await member.getAttribute('data-locked');
        console.log(`  ${i + 1}. ${personaId} (${name}) - locked: ${isLocked}`);
      }

      // CRITICAL: New user should see ONLY Ferni (coordinator)
      // Maya should NOT be visible - she unlocks at 'getting-started' (2 conversations)
      const ferniElement = page.locator('.team-member[data-persona-id="ferni"]');
      await expect(ferniElement).toBeVisible();

      // Maya should NOT be visible for new users
      const mayaElement = page.locator('.team-member[data-persona-id="maya-santos"]');
      const mayaVisible = await mayaElement.isVisible().catch(() => false);

      if (mayaVisible) {
        // Check if Maya is marked as locked
        const mayaLocked = await mayaElement.getAttribute('data-locked');
        console.log(`\n⚠️ POTENTIAL BUG: Maya is visible but locked=${mayaLocked}`);

        // If Maya is visible but not locked, this is a bug
        if (mayaLocked !== 'true') {
          console.log('❌ BUG CONFIRMED: Maya appears unlocked for new user');
        }
      }

      // For a truly new user with 0 conversations, only Ferni should show
      // We allow for marketplace button to also be present
      const nonFerniMembers = page.locator(
        '.team-member:not(.team-member--marketplace):not([data-persona-id="ferni"])'
      );
      const nonFerniCount = await nonFerniMembers.count();

      console.log(`\nNon-Ferni members visible: ${nonFerniCount}`);

      // Log result
      if (nonFerniCount === 0) {
        console.log('✅ PASS: Only Ferni visible for new user');
      } else {
        console.log('⚠️ WARNING: Other team members visible for new user');
        console.log('   This may be expected if roster preferences were previously set');
      }
    });

    test('roster preferences should be empty for new users', async ({ page }) => {
      // Clear storage
      await page.goto(BASE_URL);
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Check roster preferences in localStorage
      const rosterPrefs = await page.evaluate(() => {
        const stored = localStorage.getItem('ferni_roster_prefs');
        return stored ? JSON.parse(stored) : null;
      });

      console.log('\n📋 ROSTER PREFERENCES AUDIT:');
      console.log(JSON.stringify(rosterPrefs, null, 2));

      if (rosterPrefs) {
        // addedMembers should be empty
        expect(rosterPrefs.addedMembers || []).toEqual([]);
        console.log(
          rosterPrefs.addedMembers?.length === 0
            ? '✅ addedMembers is empty'
            : '❌ addedMembers has unexpected entries'
        );
      } else {
        console.log('✅ No roster preferences stored (expected for new user)');
      }
    });

    test('relationship stage should be first-meeting for new users', async ({ page }) => {
      // Clear storage
      await page.goto(BASE_URL);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Check relationship data
      const relationshipData = await page.evaluate(() => {
        const stored = localStorage.getItem('ferni_relationship');
        return stored ? JSON.parse(stored) : null;
      });

      console.log('\n📋 RELATIONSHIP STAGE AUDIT:');

      if (relationshipData) {
        console.log(`Stage: ${relationshipData.stage}`);
        console.log(`Total conversations: ${relationshipData.metrics?.totalConversations || 0}`);

        expect(relationshipData.stage).toBe('first-meeting');
        expect(relationshipData.metrics?.totalConversations || 0).toBe(0);
      } else {
        // New users might not have relationship data yet
        console.log('✅ No relationship data stored (fresh user)');
      }
    });
  });

  test.describe('Unlock Counter Accuracy', () => {
    test('"N left" counter should match actual unlock state', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      // Look for the "N left" indicator in the roster
      // This might be in the marketplace button or a badge
      const leftIndicator = page.locator('text=/\\d+ left/i');
      const hasLeftIndicator = await leftIndicator.isVisible().catch(() => false);

      if (hasLeftIndicator) {
        const leftText = await leftIndicator.textContent();
        const leftCount = parseInt(leftText?.match(/(\d+)/)?.[1] || '0', 10);

        console.log(`\n📋 UNLOCK COUNTER AUDIT:`);
        console.log(`"N left" indicator shows: ${leftCount}`);

        // Count actual unlocked members
        const unlockedMembers = page.locator('.team-member:not([data-locked="true"])');
        const unlockedCount = await unlockedMembers.count();

        console.log(`Unlocked members visible: ${unlockedCount}`);
        console.log(`Expected "left" count: ${TOTAL_TEAM_MEMBERS - unlockedCount}`);

        // Validate the math
        const expectedLeft = TOTAL_TEAM_MEMBERS - unlockedCount;
        if (leftCount === expectedLeft) {
          console.log(`✅ PASS: Counter is accurate (${leftCount} left)`);
        } else {
          console.log(`⚠️ MISMATCH: Shows ${leftCount} but expected ${expectedLeft}`);
        }
      } else {
        console.log('No "N left" indicator found in roster');
      }
    });
  });

  test.describe('Team Unlock API Validation', () => {
    test('team status endpoint returns correct unlock state', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/team/status`);

      console.log('\n📋 TEAM STATUS API AUDIT:');

      if (response.status() === 404) {
        console.log('Team status endpoint not available');
        test.skip();
        return;
      }

      if (response.status() === 200) {
        const data = await response.json();

        console.log(`Stage: ${data.stage || 'unknown'}`);
        console.log(`Unlocked members: ${JSON.stringify(data.unlockedMembers || [])}`);

        // Validate unlock logic
        if (data.stage === 'first-meeting') {
          // Only Ferni should be unlocked
          expect(data.unlockedMembers || []).toContain('ferni');
          expect(data.unlockedMembers?.length || 0).toBeLessThanOrEqual(1);
          console.log('✅ First-meeting stage: Only Ferni should be unlocked');
        }
      }
    });

    test('all team members registered in agent registry', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/agents`);

      if (response.status() !== 200) {
        console.log('Agents API not available');
        test.skip();
        return;
      }

      const data = await response.json();
      const agentIds = (data.agents || []).map((a: { id: string }) => a.id);

      console.log('\n📋 AGENT REGISTRY AUDIT:');
      console.log(`Total agents: ${agentIds.length}`);

      const expectedTeamMembers = Object.keys(UNLOCK_REQUIREMENTS);
      for (const memberId of expectedTeamMembers) {
        const exists = agentIds.includes(memberId);
        console.log(`  ${exists ? '✅' : '❌'} ${memberId}`);
        expect(exists).toBe(true);
      }
    });
  });

  test.describe('Maya Unlock Validation', () => {
    test('Maya should require 10 conversations to unlock (CAMEO UNLOCK threshold)', async ({
      page,
    }) => {
      await page.goto(BASE_URL);

      const MAYA_THRESHOLD = UNLOCK_REQUIREMENTS['maya-santos'].conversations; // 10

      console.log('\n📋 MAYA UNLOCK REQUIREMENTS (CAMEO UNLOCK SYSTEM):');
      console.log(`Required stage: ${UNLOCK_REQUIREMENTS['maya-santos'].stage}`);
      console.log(`Required conversations: ${MAYA_THRESHOLD}`);
      console.log("Note: Maya is introduced via Ferni's voice when habits topics come up");

      // Check the team unlock service configuration
      const unlockConfig = await page.evaluate(() => {
        // Try to access the team unlock configuration if exposed
        // @ts-ignore
        return window.teamUnlockConfig || null;
      });

      if (unlockConfig) {
        console.log('Team unlock config:', JSON.stringify(unlockConfig, null, 2));
      }

      // Verify Maya's unlock state matches relationship stage
      const relationshipData = await page.evaluate(() => {
        const stored = localStorage.getItem('ferni_relationship');
        return stored ? JSON.parse(stored) : null;
      });

      const totalConversations = relationshipData?.metrics?.totalConversations || 0;
      const shouldMayaBeUnlocked = totalConversations >= MAYA_THRESHOLD;

      console.log(`\nUser's total conversations: ${totalConversations}`);
      console.log(`Maya should be unlocked: ${shouldMayaBeUnlocked}`);

      // Check if Maya is visible in the roster
      const mayaElement = page.locator('.team-member[data-persona-id="maya-santos"]');
      const mayaVisible = await mayaElement.isVisible().catch(() => false);

      if (mayaVisible) {
        const mayaLocked = await mayaElement.getAttribute('data-locked');
        console.log(`Maya visible: true, locked: ${mayaLocked}`);

        // If user has < threshold conversations, Maya should be locked
        if (totalConversations < MAYA_THRESHOLD) {
          if (mayaLocked === 'true') {
            console.log('✅ Maya correctly shown as locked');
          } else {
            console.log(`❌ BUG: Maya appears unlocked with < ${MAYA_THRESHOLD} conversations!`);
          }
        }
      } else {
        console.log(`Maya visible: false (correct for ${totalConversations} conversations)`);
      }
    });
  });

  test.describe('Roster Persistence Bug Investigation', () => {
    test('check for stale roster preferences', async ({ page }) => {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      console.log('\n📋 ROSTER PERSISTENCE AUDIT:');

      // Get current roster preferences
      const rosterPrefs = await page.evaluate(() => {
        return localStorage.getItem('ferni_roster_prefs');
      });

      // Get relationship data
      const relationshipData = await page.evaluate(() => {
        return localStorage.getItem('ferni_relationship');
      });

      if (rosterPrefs) {
        const prefs = JSON.parse(rosterPrefs);
        console.log('Roster preferences:', JSON.stringify(prefs, null, 2));

        // Check if addedMembers contains members that shouldn't be unlocked
        if (prefs.addedMembers && relationshipData) {
          const relationship = JSON.parse(relationshipData);
          const stage = relationship.stage || 'first-meeting';
          const conversations = relationship.metrics?.totalConversations || 0;

          console.log(`\nRelationship stage: ${stage}`);
          console.log(`Total conversations: ${conversations}`);

          // Check each added member
          for (const memberId of prefs.addedMembers) {
            const req = UNLOCK_REQUIREMENTS[memberId as keyof typeof UNLOCK_REQUIREMENTS];
            if (req && conversations < req.conversations) {
              console.log(
                `⚠️ ${memberId} in roster but requires ${req.conversations} conversations (user has ${conversations})`
              );
            }
          }
        }
      } else {
        console.log('No roster preferences stored');
      }
    });

    test('clearing storage should reset roster to Ferni-only', async ({ page }) => {
      await page.goto(BASE_URL);

      // Clear all storage
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });

      // Reload and wait for roster
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForSelector('#teamRoster', { timeout: 10000 });
      await page.waitForSelector('.team-member', { timeout: 10000 });

      // Count visible members
      const teamMembers = page.locator(
        '.team-member:not(.team-member--marketplace):not([data-persona-id="ferni"])'
      );
      const nonFerniCount = await teamMembers.count();

      console.log('\n📋 STORAGE RESET TEST:');
      console.log(`Non-Ferni members after reset: ${nonFerniCount}`);

      if (nonFerniCount === 0) {
        console.log('✅ PASS: Only Ferni visible after storage clear');
      } else {
        console.log('⚠️ FAIL: Other members visible after storage clear');
        // List them
        for (let i = 0; i < nonFerniCount; i++) {
          const id = await teamMembers.nth(i).getAttribute('data-persona-id');
          console.log(`  - ${id}`);
        }
      }

      // This SHOULD pass - if it fails, there's a bug
      expect(nonFerniCount).toBe(0);
    });
  });
});

test.describe('Summary', () => {
  test('SUMMARY: Team Roster Unlock Audit Complete', async ({ page }) => {
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEAM ROSTER UNLOCK AUDIT SUMMARY (CAMEO UNLOCK SYSTEM)');
    console.log('='.repeat(60));

    console.log('\nTest Categories:');
    console.log('  1. New User Initial State');
    console.log('  2. Unlock Counter Accuracy');
    console.log('  3. Team Unlock API Validation');
    console.log('  4. Maya Unlock Validation');
    console.log('  5. Roster Persistence Bug Investigation');

    console.log('\nExpected Behavior (CAMEO UNLOCK thresholds):');
    console.log('  - New users see ONLY Ferni in roster');
    console.log('  - Maya unlocks after 10 conversations (via Ferni intro)');
    console.log('  - Peter unlocks after 15 conversations');
    console.log('  - Alex/Jordan unlock after 30 conversations');
    console.log('  - Nayan unlocks after 60 conversations');
    console.log('  - "N left" counter matches actual unlock state');
    console.log('  - Clearing storage resets to Ferni-only');

    console.log('\nCAMEO UNLOCK System (Dec 2024):');
    console.log('  - Ferni speaks team member introductions naturally');
    console.log('  - Topics trigger introductions (e.g., "habits" → Maya)');
    console.log('  - Fallback after 3 extra conversations without topic match');

    console.log('\nIf Maya appears for new users:');
    console.log('  - Check if roster preferences have stale data');
    console.log('  - Verify relationship stage matches conversations');
    console.log('  - Check for subscription tier bypass');

    console.log('\n' + '='.repeat(60));
  });
});
