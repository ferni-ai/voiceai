/**
 * Story Arc Tracking Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStoryArcTracker,
  clearUserData,
  type IStoryArcTracker,
} from '../index.js';

describe('StoryArcTracker', () => {
  let tracker: IStoryArcTracker;
  const userId = 'test-user-123';

  beforeEach(async () => {
    tracker = createStoryArcTracker();
    await clearUserData(userId);
  });

  // ============================================================================
  // ARC MANAGEMENT
  // ============================================================================

  describe('createArc()', () => {
    it('creates a new arc', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Job search journey',
        type: 'challenge',
        status: 'active',
        characters: ['hiring manager', 'recruiter'],
        emotionalTone: 'anxious but hopeful',
      });

      expect(arc.id).toBeDefined();
      expect(arc.title).toBe('Job search journey');
      expect(arc.events).toEqual([]);
      expect(arc.cliffhangers).toEqual([]);
    });
  });

  describe('getActiveArcs()', () => {
    it('returns only active arcs', async () => {
      await tracker.createArc(userId, {
        title: 'Active arc',
        type: 'growth',
        status: 'active',
        characters: [],
        emotionalTone: 'positive',
      });

      await tracker.createArc(userId, {
        title: 'Paused arc',
        type: 'relationship',
        status: 'paused',
        characters: [],
        emotionalTone: 'neutral',
      });

      const activeArcs = await tracker.getActiveArcs(userId);
      expect(activeArcs.length).toBe(1);
      expect(activeArcs[0].title).toBe('Active arc');
    });
  });

  describe('getArc()', () => {
    it('returns specific arc', async () => {
      const created = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'project',
        status: 'active',
        characters: [],
        emotionalTone: 'excited',
      });

      const retrieved = await tracker.getArc(userId, created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Test arc');
    });

    it('returns null for unknown arc', async () => {
      const arc = await tracker.getArc(userId, 'unknown-id');
      expect(arc).toBeNull();
    });
  });

  // ============================================================================
  // EVENT TRACKING
  // ============================================================================

  describe('addEvent()', () => {
    it('adds event to arc', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'growth',
        status: 'active',
        characters: [],
        emotionalTone: 'hopeful',
      });

      await tracker.addEvent(userId, arc.id, {
        sessionId: 'session-1',
        description: 'Started new habit',
        emotion: 'determined',
        significance: 0.7,
      });

      const updated = await tracker.getArc(userId, arc.id);
      expect(updated?.events.length).toBe(1);
      expect(updated?.events[0].description).toBe('Started new habit');
    });
  });

  // ============================================================================
  // CLIFFHANGERS
  // ============================================================================

  describe('cliffhangers', () => {
    it('adds cliffhanger to arc', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'decision',
        status: 'active',
        characters: [],
        emotionalTone: 'uncertain',
      });

      const cliffhanger = await tracker.addCliffhanger(userId, arc.id, {
        situation: 'Waiting to hear back from the interview',
        priority: 'high',
      });

      expect(cliffhanger.id).toBeDefined();
      expect(cliffhanger.resolved).toBe(false);
    });

    it('resolves cliffhanger', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'challenge',
        status: 'active',
        characters: [],
        emotionalTone: 'tense',
      });

      const cliffhanger = await tracker.addCliffhanger(userId, arc.id, {
        situation: 'Test situation',
        priority: 'medium',
      });

      await tracker.resolveCliffhanger(userId, arc.id, cliffhanger.id);

      const unresolved = await tracker.getUnresolvedCliffhangers(userId);
      expect(unresolved.find((u) => u.cliffhanger.id === cliffhanger.id)).toBeUndefined();
    });

    it('gets unresolved cliffhangers sorted by priority', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'challenge',
        status: 'active',
        characters: [],
        emotionalTone: 'stressed',
      });

      await tracker.addCliffhanger(userId, arc.id, {
        situation: 'Low priority thing',
        priority: 'low',
      });

      await tracker.addCliffhanger(userId, arc.id, {
        situation: 'High priority thing',
        priority: 'high',
      });

      await tracker.addCliffhanger(userId, arc.id, {
        situation: 'Medium priority thing',
        priority: 'medium',
      });

      const unresolved = await tracker.getUnresolvedCliffhangers(userId);
      expect(unresolved[0].cliffhanger.priority).toBe('high');
      expect(unresolved[1].cliffhanger.priority).toBe('medium');
      expect(unresolved[2].cliffhanger.priority).toBe('low');
    });
  });

  // ============================================================================
  // ARC RESOLUTION
  // ============================================================================

  describe('resolveArc()', () => {
    it('resolves arc with description', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'challenge',
        status: 'active',
        characters: [],
        emotionalTone: 'determined',
      });

      await tracker.resolveArc(userId, arc.id, 'Successfully completed the challenge!');

      const resolved = await tracker.getArc(userId, arc.id);
      expect(resolved?.status).toBe('resolved');
      expect(resolved?.resolution).toBe('Successfully completed the challenge!');
    });
  });

  // ============================================================================
  // CONTINUITY PROMPTS
  // ============================================================================

  describe('getContinuityPrompts()', () => {
    it('returns empty for new user', async () => {
      const prompts = await tracker.getContinuityPrompts(userId);
      expect(prompts).toEqual([]);
    });

    it('generates follow-up prompts for cliffhangers', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Job search',
        type: 'challenge',
        status: 'active',
        characters: [],
        emotionalTone: 'hopeful',
      });

      await tracker.addCliffhanger(userId, arc.id, {
        situation: 'interview results',
        priority: 'high',
      });

      const prompts = await tracker.getContinuityPrompts(userId);
      expect(prompts.length).toBeGreaterThan(0);
      expect(prompts[0].prompt).toContain('interview results');
    });
  });

  // ============================================================================
  // CONTEXT INJECTION
  // ============================================================================

  describe('buildContextInjection()', () => {
    it('returns empty for new user', async () => {
      const context = await tracker.buildContextInjection(userId);
      expect(context).toBe('');
    });

    it('includes active arcs', async () => {
      await tracker.createArc(userId, {
        title: 'Career transition',
        type: 'growth',
        status: 'active',
        characters: ['mentor', 'boss'],
        emotionalTone: 'excited',
      });

      const context = await tracker.buildContextInjection(userId);
      expect(context).toContain('Career transition');
      expect(context).toContain('mentor');
    });

    it('includes unresolved cliffhangers', async () => {
      const arc = await tracker.createArc(userId, {
        title: 'Test arc',
        type: 'challenge',
        status: 'active',
        characters: [],
        emotionalTone: 'anxious',
      });

      await tracker.addCliffhanger(userId, arc.id, {
        situation: 'waiting for results',
        priority: 'high',
      });

      const context = await tracker.buildContextInjection(userId);
      expect(context).toContain('waiting for results');
    });
  });

  // ============================================================================
  // RESET
  // ============================================================================

  describe('reset()', () => {
    it('resets without error', () => {
      expect(() => tracker.reset()).not.toThrow();
    });
  });
});
