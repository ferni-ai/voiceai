/**
 * Relational Memory Tests
 *
 * @module @ferni/services/superhuman/relational-memory/__tests__/engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRelationalMemory, clearUserData, type IRelationalMemory } from '../index.js';

describe('RelationalMemory', () => {
  let relMem: IRelationalMemory;
  const userId = 'test-user-123';

  beforeEach(async () => {
    relMem = createRelationalMemory();
    await clearUserData(userId);
  });

  // ============================================================================
  // INSIDE JOKES TESTS
  // ============================================================================

  describe('jokes', () => {
    it('adds a joke', async () => {
      const joke = await relMem.addJoke(userId, {
        content: "That's what she said",
        originContext: 'Testing jokes',
        triggerKeywords: ['office', 'michael'],
      });

      expect(joke.id).toBeDefined();
      expect(joke.content).toBe("That's what she said");
      expect(joke.timesReferenced).toBe(0);
    });

    it('retrieves jokes', async () => {
      await relMem.addJoke(userId, {
        content: 'Joke 1',
        originContext: 'Test',
        triggerKeywords: ['test'],
      });
      await relMem.addJoke(userId, {
        content: 'Joke 2',
        originContext: 'Test',
        triggerKeywords: ['test'],
      });

      const jokes = await relMem.getJokes(userId);
      expect(jokes.length).toBe(2);
    });

    it('finds relevant joke by keywords', async () => {
      await relMem.addJoke(userId, {
        content: 'AI humor joke',
        originContext: 'Test',
        triggerKeywords: ['ai', 'robot', 'funny'],
      });

      const found = await relMem.findRelevantJoke(userId, ['ai', 'intelligent']);
      expect(found).not.toBeNull();
      expect(found?.content).toBe('AI humor joke');
    });

    it('returns null when no matching joke', async () => {
      await relMem.addJoke(userId, {
        content: 'Test joke',
        originContext: 'Test',
        triggerKeywords: ['specific', 'keywords'],
      });

      const found = await relMem.findRelevantJoke(userId, ['completely', 'different']);
      expect(found).toBeNull();
    });

    it('records joke use', async () => {
      const joke = await relMem.addJoke(userId, {
        content: 'Test',
        originContext: 'Test',
        triggerKeywords: ['test'],
      });

      await relMem.recordJokeUse(userId, joke.id, true);
      await relMem.recordJokeUse(userId, joke.id, true);

      const jokes = await relMem.getJokes(userId);
      const updated = jokes.find((j) => j.id === joke.id);

      expect(updated?.timesReferenced).toBe(2);
      expect(updated?.reactions.length).toBe(2);
    });
  });

  // ============================================================================
  // RITUALS TESTS
  // ============================================================================

  describe('rituals', () => {
    it('adds a ritual', async () => {
      const ritual = await relMem.addRitual(userId, {
        name: 'Morning greeting',
        description: 'Say good morning',
        type: 'greeting',
        timing: 'session-start',
        phrases: ['Good morning!', 'Hey there!'],
        userPreference: 0.8,
      });

      expect(ritual.id).toBeDefined();
      expect(ritual.name).toBe('Morning greeting');
      expect(ritual.timesPerformed).toBe(0);
    });

    it('retrieves rituals', async () => {
      await relMem.addRitual(userId, {
        name: 'Ritual 1',
        description: 'Test',
        type: 'custom',
        timing: 'any',
        phrases: [],
        userPreference: 0.5,
      });

      const rituals = await relMem.getRituals(userId);
      expect(rituals.length).toBe(1);
    });

    it('gets rituals by timing', async () => {
      await relMem.addRitual(userId, {
        name: 'Start ritual',
        description: 'Test',
        type: 'greeting',
        timing: 'session-start',
        phrases: [],
        userPreference: 0.8,
      });
      await relMem.addRitual(userId, {
        name: 'End ritual',
        description: 'Test',
        type: 'closing',
        timing: 'session-end',
        phrases: [],
        userPreference: 0.8,
      });

      const startRituals = await relMem.getRitualsForTiming(userId, 'session-start');
      expect(startRituals.length).toBe(1);
      expect(startRituals[0].name).toBe('Start ritual');
    });

    it('records ritual use', async () => {
      const ritual = await relMem.addRitual(userId, {
        name: 'Test',
        description: 'Test',
        type: 'custom',
        timing: 'any',
        phrases: [],
        userPreference: 0.5,
      });

      await relMem.recordRitualUse(userId, ritual.id);
      await relMem.recordRitualUse(userId, ritual.id);

      const rituals = await relMem.getRituals(userId);
      const updated = rituals.find((r) => r.id === ritual.id);

      expect(updated?.timesPerformed).toBe(2);
    });
  });

  // ============================================================================
  // PREFERENCES TESTS
  // ============================================================================

  describe('preferences', () => {
    it('updates preference', async () => {
      await relMem.updatePreference(userId, {
        category: 'tone',
        value: 'warm and friendly',
        confidence: 0.8,
        sampleSize: 10,
        updatedAt: new Date(),
      });

      const preferences = await relMem.getPreferences(userId);
      expect(preferences.length).toBe(1);
      expect(preferences[0].value).toBe('warm and friendly');
    });

    it('updates existing preference', async () => {
      await relMem.updatePreference(userId, {
        category: 'tone',
        value: 'formal',
        confidence: 0.6,
        sampleSize: 5,
        updatedAt: new Date(),
      });

      await relMem.updatePreference(userId, {
        category: 'tone',
        value: 'casual',
        confidence: 0.9,
        sampleSize: 15,
        updatedAt: new Date(),
      });

      const preferences = await relMem.getPreferences(userId);
      expect(preferences.length).toBe(1);
      expect(preferences[0].value).toBe('casual');
      expect(preferences[0].confidence).toBe(0.9);
    });

    it('gets preference by category', async () => {
      await relMem.updatePreference(userId, {
        category: 'humor',
        value: 'loves puns',
        confidence: 0.7,
        sampleSize: 8,
        updatedAt: new Date(),
      });

      const pref = await relMem.getPreferenceByCategory(userId, 'humor');
      expect(pref).not.toBeNull();
      expect(pref?.value).toBe('loves puns');
    });

    it('returns null for non-existent category', async () => {
      const pref = await relMem.getPreferenceByCategory(userId, 'formality');
      expect(pref).toBeNull();
    });
  });

  // ============================================================================
  // MILESTONES TESTS
  // ============================================================================

  describe('milestones', () => {
    it('adds milestone', async () => {
      const milestone = await relMem.addMilestone(userId, {
        type: 'first-vulnerability',
        description: 'Shared about anxiety',
        occurredAt: new Date(),
        sessionId: 'session-1',
        impactScore: 0.9,
      });

      expect(milestone.id).toBeDefined();
      expect(milestone.type).toBe('first-vulnerability');
    });

    it('retrieves milestones', async () => {
      await relMem.addMilestone(userId, {
        type: 'deep-share',
        description: 'Test',
        occurredAt: new Date(),
        sessionId: 'session-1',
        impactScore: 0.7,
      });

      const milestones = await relMem.getMilestones(userId);
      expect(milestones.length).toBe(1);
    });

    it('gets recent milestones', async () => {
      // Old milestone
      await relMem.addMilestone(userId, {
        type: 'deep-share',
        description: 'Old milestone',
        occurredAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        sessionId: 'session-1',
        impactScore: 0.7,
      });

      // Recent milestone
      await relMem.addMilestone(userId, {
        type: 'asked-for-help',
        description: 'Recent milestone',
        occurredAt: new Date(),
        sessionId: 'session-2',
        impactScore: 0.8,
      });

      const recent = await relMem.getRecentMilestones(userId, 30);
      expect(recent.length).toBe(1);
      expect(recent[0].description).toBe('Recent milestone');
    });

    it('updates trust level on milestone', async () => {
      const memoryBefore = await relMem.getRelationalMemory(userId);
      const trustBefore = memoryBefore?.stats.trustLevel || 0.3;

      await relMem.addMilestone(userId, {
        type: 'first-vulnerability',
        description: 'Test',
        occurredAt: new Date(),
        sessionId: 'session-1',
        impactScore: 0.9,
      });

      const memoryAfter = await relMem.getRelationalMemory(userId);
      expect(memoryAfter?.stats.trustLevel).toBeGreaterThan(trustBefore);
    });
  });

  // ============================================================================
  // AGGREGATE TESTS
  // ============================================================================

  describe('aggregate', () => {
    it('returns null for new user', async () => {
      const memory = await relMem.getRelationalMemory('non-existent');
      expect(memory).toBeNull();
    });

    it('returns memory after adding items', async () => {
      await relMem.addJoke(userId, {
        content: 'Test',
        originContext: 'Test',
        triggerKeywords: ['test'],
      });

      const memory = await relMem.getRelationalMemory(userId);
      expect(memory).not.toBeNull();
      expect(memory?.userId).toBe(userId);
    });
  });

  // ============================================================================
  // CONTEXT BUILDING TESTS
  // ============================================================================

  describe('buildContextForLLM()', () => {
    it('builds context with jokes', async () => {
      const joke = await relMem.addJoke(userId, {
        content: 'AI humor joke',
        originContext: 'Test',
        triggerKeywords: ['ai', 'funny'],
      });

      // Record positive reaction so it appears in context
      await relMem.recordJokeUse(userId, joke.id, true);

      const context = await relMem.buildContextForLLM(userId);
      expect(context).toContain('[RELATIONAL MEMORY]');
      expect(context).toContain('AI humor joke');
    });

    it('builds context with preferences', async () => {
      await relMem.updatePreference(userId, {
        category: 'tone',
        value: 'warm',
        confidence: 0.9,
        sampleSize: 20,
        updatedAt: new Date(),
      });

      const context = await relMem.buildContextForLLM(userId);
      expect(context).toContain('tone');
      expect(context).toContain('warm');
    });

    it('includes trust level', async () => {
      await relMem.addMilestone(userId, {
        type: 'first-vulnerability',
        description: 'Test',
        occurredAt: new Date(),
        sessionId: 'session-1',
        impactScore: 0.9,
      });

      const context = await relMem.buildContextForLLM(userId);
      expect(context).toContain('Trust level');
    });

    it('returns empty for new user', async () => {
      const context = await relMem.buildContextForLLM('non-existent');
      expect(context).toBe('');
    });
  });

  // ============================================================================
  // CLEANUP TESTS
  // ============================================================================

  describe('cleanup()', () => {
    it('runs without error', () => {
      expect(() => relMem.cleanup()).not.toThrow();
    });
  });
});
