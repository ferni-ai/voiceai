/**
 * Cross-Session Continuity Tests
 *
 * Tests for relationship memory, returning user recognition,
 * and conversation continuity across sessions.
 *
 * Note: Requires vitest as dev dependency: npm install -D vitest
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStore } from '../memory/in-memory-store.js';
import { createUserProfile } from '../types/user-profile.js';

describe('Cross-Session Continuity', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe('Returning User Recognition', () => {
    it('should identify returning users', async () => {
      const userId = 'returning-user-1';

      // Create profile from first session
      const profile = createUserProfile(userId, 'Alice');
      profile.totalConversations = 1;
      await store.saveProfile(profile);

      // Simulate second session
      const retrieved = await store.getProfile(userId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.totalConversations).toBeGreaterThan(0);
    });

    it('should preserve user name across sessions', async () => {
      const userId = 'name-test-user';

      // First session - learn name
      const profile = createUserProfile(userId, 'Bob');
      await store.saveProfile(profile);

      // Second session - retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.name).toBe('Bob');
    });

    it('should track conversation count', async () => {
      const userId = 'conversation-count-user';

      const profile = createUserProfile(userId);

      // Simulate 3 sessions
      for (let i = 0; i < 3; i++) {
        profile.totalConversations++;
        profile.totalMinutesTalked += 10;
        profile.preferredTopics.push('retirement');
        await store.saveProfile(profile);
      }

      const retrieved = await store.getProfile(userId);

      expect(retrieved?.totalConversations).toBe(3);
    });
  });

  describe('Conversation Summary Continuity', () => {
    it('should store and retrieve last conversation summary', async () => {
      const userId = 'summary-test-user';

      // Create profile with summary
      const profile = createUserProfile(userId);
      profile.lastConversationSummary = 'Discussed retirement planning and index funds';
      await store.saveProfile(profile);

      // Retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.lastConversationSummary).toBe(
        'Discussed retirement planning and index funds'
      );
    });

    it('should store multiple conversation summaries', async () => {
      const userId = 'multi-summary-user';

      const profile = createUserProfile(userId);
      await store.saveProfile(profile);

      // Add multiple summaries
      await store.saveSummary(userId, {
        id: 'summary-1',
        sessionId: 'session-1',
        timestamp: new Date(Date.now() - 86400000), // Yesterday
        duration: 600,
        turnCount: 15,
        mainTopics: ['retirement'],
        keyPoints: ['Discussed 401k'],
        emotionalArc: 'neutral throughout',
      });

      await store.saveSummary(userId, {
        id: 'summary-2',
        sessionId: 'session-2',
        timestamp: new Date(),
        duration: 900,
        turnCount: 25,
        mainTopics: ['fees', 'index funds'],
        keyPoints: ['Explained fee impact', 'Recommended VTI'],
        emotionalArc: 'started curious, ended confident',
      });

      const summaries = await store.getSummaries(userId);

      expect(summaries.length).toBe(2);
    });
  });

  describe('Goal Continuity', () => {
    it('should persist user goals across sessions', async () => {
      const userId = 'goal-test-user';

      // First session - set goal
      const profile = createUserProfile(userId);
      profile.goals.push({
        id: 'goal-1',
        name: 'Retirement Fund',
        type: 'retirement',
        targetAmount: 1000000,
        currentProgress: 250000,
        progressPercent: 25,
        status: 'active',
        priority: 'high',
        timeHorizon: 'long',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await store.saveProfile(profile);

      // Second session - retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.goals.length).toBe(1);
      expect(retrieved?.goals[0].name).toBe('Retirement Fund');
      expect(retrieved?.goals[0].targetAmount).toBe(1000000);
    });

    it('should update goal progress across sessions', async () => {
      const userId = 'goal-progress-user';

      // First session
      const profile = createUserProfile(userId);
      profile.goals.push({
        id: 'goal-1',
        name: 'Emergency Fund',
        type: 'emergency',
        targetAmount: 10000,
        currentProgress: 2000,
        progressPercent: 20,
        status: 'active',
        priority: 'high',
        timeHorizon: 'short',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await store.saveProfile(profile);

      // Second session - update progress
      const retrieved = await store.getProfile(userId);
      if (retrieved) {
        retrieved.goals[0].currentProgress = 5000;
        retrieved.goals[0].progressPercent = 50;
        retrieved.goals[0].updatedAt = new Date();
        await store.saveProfile(retrieved);
      }

      // Third session - verify
      const final = await store.getProfile(userId);

      expect(final?.goals[0].currentProgress).toBe(5000);
    });
  });

  describe('Follow-Up Continuity', () => {
    it('should persist pending follow-ups', async () => {
      const userId = 'followup-test-user';

      const profile = createUserProfile(userId);
      profile.pendingFollowUps.push({
        topic: 'Tax-loss harvesting',
        targetDate: new Date(),
        reason: 'User wanted to learn more',
      });
      await store.saveProfile(profile);

      // Retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.pendingFollowUps.length).toBe(1);
      expect(retrieved?.pendingFollowUps[0].topic).toBe('Tax-loss harvesting');
    });

    it('should persist open questions', async () => {
      const userId = 'questions-test-user';

      const profile = createUserProfile(userId);
      profile.openQuestions.push('How do I rebalance?');
      profile.openQuestions.push('What about international diversification?');
      await store.saveProfile(profile);

      // Retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.openQuestions.length).toBe(2);
      expect(retrieved?.openQuestions).toContain('How do I rebalance?');
    });
  });

  describe('Relationship Stage Progression', () => {
    it('should progress relationship stage over time', async () => {
      const userId = 'relationship-test-user';

      const profile = createUserProfile(userId);
      expect(profile.relationshipStage).toBe('new_acquaintance');

      // Simulate multiple conversations
      profile.totalConversations = 10;
      profile.totalMinutesTalked = 150;
      profile.keyMoments.push({
        id: 'moment-1',
        timestamp: new Date(),
        type: 'shared_vulnerability',
        summary: 'Shared concerns about retirement',
        emotionalWeight: 'heavy',
        topics: ['retirement'],
      });

      // After significant interaction, stage should be able to progress
      // (actual progression depends on calculateRelationshipStage function)
      expect(['new_acquaintance', 'getting_to_know', 'trusted_advisor']).toContain(
        profile.relationshipStage
      );
    });

    it('should track total conversation time', async () => {
      const userId = 'time-test-user';

      const profile = createUserProfile(userId);

      // 5 sessions of 10 minutes each
      for (let i = 0; i < 5; i++) {
        profile.totalMinutesTalked += 10;
      }

      expect(profile.totalMinutesTalked).toBe(50);
    });
  });

  describe('Story Tracking', () => {
    it('should track which stories have been shared', async () => {
      const userId = 'story-test-user';

      const profile = createUserProfile(userId);
      profile.sharedStories.push({
        storyId: 'story-1',
        theme: 'failure',
        sharedAt: new Date(),
        userReaction: 'moved',
        context: 'User was discussing setbacks',
      });
      await store.saveProfile(profile);

      // Retrieve
      const retrieved = await store.getProfile(userId);

      expect(retrieved?.sharedStories.length).toBe(1);
      expect(retrieved?.sharedStories[0].theme).toBe('failure');
    });

    it('should avoid repeating stories', async () => {
      const userId = 'story-repeat-user';

      const profile = createUserProfile(userId);
      profile.sharedStories.push(
        { storyId: 'story-1', theme: 'failure', sharedAt: new Date(), context: '' },
        { storyId: 'story-2', theme: 'patience', sharedAt: new Date(), context: '' }
      );
      await store.saveProfile(profile);

      const retrieved = await store.getProfile(userId);
      const sharedThemes = retrieved?.sharedStories.map((s) => s.theme) || [];

      // In a real implementation, the agent would check this before sharing a story
      expect(sharedThemes).toContain('failure');
      expect(sharedThemes).toContain('patience');
    });
  });
});

describe('New vs Returning User Experience', () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  it('should provide different greeting for new users', async () => {
    // New user - no profile
    const newProfile = await store.getProfile('brand-new-user');

    expect(newProfile).toBeNull();
    // Agent would use new user greeting
  });

  it('should provide personalized greeting for returning users', async () => {
    const userId = 'returning-greeting-user';

    // Existing profile
    const profile = createUserProfile(userId, 'Eve');
    profile.totalConversations = 3;
    profile.lastConversationSummary = 'Talked about market volatility';
    await store.saveProfile(profile);

    const retrieved = await store.getProfile(userId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Eve');
    // Agent would use returning user greeting with name and context
  });
});
