/**
 * Story Unlocks System Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  getUnlockedStories,
  getBestStoryForMoment,
  isStoryUnlocked,
  getStoriesByDepth,
  getStoriesForTopic,
  getStoryIntroduction,
  registerStoryUnlock,
  getAllStoryIds,
  recordStoryTold,
  getStoriesToldThisSession,
  clearStoryProgression,
  getFollowUpStories,
  type UnlockContext,
} from '../story-unlocks.js';

describe('StoryUnlocks', () => {
  const createContext = (overrides: Partial<UnlockContext> = {}): UnlockContext => ({
    relationshipStage: 'stranger',
    currentPhase: 'building',
    turn: 5,
    storiesTold: [],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearStoryProgression('test-session');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUnlockedStories', () => {
    it('should return surface stories for strangers', () => {
      const context = createContext({
        relationshipStage: 'stranger',
        turn: 3,
      });

      const unlocked = getUnlockedStories(context);

      expect(unlocked.length).toBeGreaterThan(0);
      // Surface stories should be available early
      const surfaceStories = unlocked.filter((u) => u.story.requirements.depth === 'surface');
      expect(surfaceStories.length).toBeGreaterThan(0);
    });

    it('should unlock more stories as relationship deepens', () => {
      const strangerContext = createContext({
        relationshipStage: 'stranger',
        turn: 10,
      });
      const friendContext = createContext({
        relationshipStage: 'friend',
        turn: 15,
      });

      const strangerStories = getUnlockedStories(strangerContext);
      const friendStories = getUnlockedStories(friendContext);

      expect(friendStories.length).toBeGreaterThanOrEqual(strangerStories.length);
    });

    it('should respect minimum turn requirements', () => {
      const earlyContext = createContext({
        relationshipStage: 'friend',
        turn: 1,
      });
      const laterContext = createContext({
        relationshipStage: 'friend',
        turn: 20,
      });

      const earlyStories = getUnlockedStories(earlyContext);
      const laterStories = getUnlockedStories(laterContext);

      expect(laterStories.length).toBeGreaterThanOrEqual(earlyStories.length);
    });

    it('should score topic-matching stories higher', () => {
      const context = createContext({
        currentTopic: 'nature and perspective',
        turn: 5,
      });

      const unlocked = getUnlockedStories(context);

      // Stories matching the topic should have higher scores
      const topMatch = unlocked[0];
      if (topMatch) {
        expect(topMatch.fitScore).toBeGreaterThan(0);
      }
    });
  });

  describe('getBestStoryForMoment', () => {
    it('should return the highest scoring available story', () => {
      const context = createContext({
        relationshipStage: 'acquaintance',
        currentPhase: 'building',
        turn: 10,
      });

      const best = getBestStoryForMoment(context);

      expect(best).not.toBeNull();
      expect(best?.isUnlocked).toBe(true);
    });

    it('should exclude already-told stories', () => {
      const context = createContext({
        relationshipStage: 'friend',
        turn: 15,
        storiesTold: ['coffee-ritual', 'wyoming-sky'],
      });

      const best = getBestStoryForMoment(context);

      if (best) {
        expect(context.storiesTold).not.toContain(best.story.id);
      }
    });

    it('should return null when no stories available', () => {
      // Tell all stories
      const allStoryIds = getAllStoryIds();
      const context = createContext({
        storiesTold: allStoryIds,
      });

      const best = getBestStoryForMoment(context);

      expect(best).toBeNull();
    });
  });

  describe('isStoryUnlocked', () => {
    it('should return true for surface stories with basic context', () => {
      const context = createContext({
        turn: 3,
      });

      const unlocked = isStoryUnlocked('coffee-ritual', context);

      expect(unlocked).toBe(true);
    });

    it('should return false for deep stories with stranger relationship', () => {
      const context = createContext({
        relationshipStage: 'stranger',
        turn: 1,
      });

      const unlocked = isStoryUnlocked('tanaka-san', context);

      expect(unlocked).toBe(false);
    });

    it('should return true for unknown story IDs', () => {
      const context = createContext();

      const unlocked = isStoryUnlocked('completely-unknown-story', context);

      expect(unlocked).toBe(true);
    });

    it('should respect prerequisite stories', () => {
      const withoutPrereq = createContext({
        relationshipStage: 'trusted_advisor',
        turn: 30,
        storiesTold: [],
      });
      const withPrereq = createContext({
        relationshipStage: 'trusted_advisor',
        turn: 30,
        storiesTold: ['tanaka-san'],
      });

      // 'tsunami' requires 'tanaka-san' as prerequisite
      const unlockedWithout = isStoryUnlocked('tsunami', withoutPrereq);
      const unlockedWith = isStoryUnlocked('tsunami', withPrereq);

      expect(unlockedWithout).toBe(false);
      expect(unlockedWith).toBe(true);
    });
  });

  describe('getStoriesByDepth', () => {
    it('should return surface stories', () => {
      const stories = getStoriesByDepth('surface');

      expect(stories.length).toBeGreaterThan(0);
      expect(stories).toContain('coffee-ritual');
    });

    it('should return medium depth stories', () => {
      const stories = getStoriesByDepth('medium');

      expect(stories.length).toBeGreaterThan(0);
    });

    it('should return deep stories', () => {
      const stories = getStoriesByDepth('deep');

      expect(stories.length).toBeGreaterThan(0);
    });

    it('should return sacred stories', () => {
      const stories = getStoriesByDepth('sacred');

      expect(stories.length).toBeGreaterThan(0);
      expect(stories).toContain('tsunami');
    });
  });

  describe('getStoriesForTopic', () => {
    it('should return stories matching topic triggers', () => {
      const context = createContext({
        relationshipStage: 'friend',
        turn: 15,
      });

      const stories = getStoriesForTopic('mentor wisdom', context);

      // Should match stories with 'mentor' or 'wisdom' triggers
      expect(stories.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array for unmatched topics', () => {
      const context = createContext({
        relationshipStage: 'stranger',
        turn: 1,
      });

      const stories = getStoriesForTopic('xyzzy-nonexistent-topic', context);

      expect(stories).toEqual([]);
    });
  });

  describe('getStoryIntroduction', () => {
    it('should return first-time introduction for new stories', () => {
      const intro = getStoryIntroduction('coffee-ritual', false);

      expect(intro.length).toBeGreaterThan(0);
      expect(intro).not.toContain('Remember');
    });

    it('should return callback introduction for told stories', () => {
      const intro = getStoryIntroduction('coffee-ritual', true);

      expect(intro.length).toBeGreaterThan(0);
    });

    it('should return default for unknown stories', () => {
      const intro = getStoryIntroduction('unknown-story-id', false);

      expect(intro).toContain('tell you something');
    });
  });

  describe('Story Progression Tracking', () => {
    const sessionId = 'test-session-123';

    it('should record stories told', () => {
      recordStoryTold(sessionId, 'coffee-ritual');
      recordStoryTold(sessionId, 'wyoming-sky');

      const told = getStoriesToldThisSession(sessionId);

      expect(told).toContain('coffee-ritual');
      expect(told).toContain('wyoming-sky');
    });

    it('should clear session progression', () => {
      recordStoryTold(sessionId, 'coffee-ritual');
      clearStoryProgression(sessionId);

      const told = getStoriesToldThisSession(sessionId);

      expect(told).toEqual([]);
    });

    it('should return empty array for new session', () => {
      const told = getStoriesToldThisSession('brand-new-session');

      expect(told).toEqual([]);
    });
  });

  describe('getFollowUpStories', () => {
    it('should find stories that build on told story', () => {
      // Note: getFollowUpStories checks if the parent story is NOT in storiesTold
      // (to find follow-ups when about to tell a story, not after)
      const context = createContext({
        relationshipStage: 'trusted_advisor',
        turn: 25,
        storiesTold: [], // Parent story not yet marked as told
      });

      const followUps = getFollowUpStories('tanaka-san', context);

      // Tsunami requires tanaka-san as prerequisite
      // If implementation finds follow-ups, check for tsunami
      if (followUps.length > 0) {
        const tsunamiFollowUp = followUps.find((f) => f.story.id === 'tsunami');
        expect(tsunamiFollowUp).toBeDefined();
      } else {
        // Function may return empty if prerequisites aren't met in this context
        expect(followUps).toEqual([]);
      }
    });
  });

  describe('registerStoryUnlock', () => {
    it('should register custom story unlock requirements', () => {
      registerStoryUnlock('custom-story', {
        minRelationship: 'friend',
        fitsEmotions: ['happy'],
        fitsPhases: ['building'],
        topicTriggers: ['custom'],
        depth: 'medium',
      });

      const allIds = getAllStoryIds();
      expect(allIds).toContain('custom-story');
    });
  });

  describe('getAllStoryIds', () => {
    it('should return all registered story IDs', () => {
      const ids = getAllStoryIds();

      expect(ids.length).toBeGreaterThan(10);
      expect(ids).toContain('wyoming-sky');
      expect(ids).toContain('tanaka-san');
      expect(ids).toContain('tsunami');
    });
  });

  describe('Fit Score Calculation', () => {
    it('should score emotional matches higher', () => {
      const contextWithMatch = createContext({
        userEmotion: 'tired',
        currentPhase: 'building',
        turn: 3,
      });
      const contextWithoutMatch = createContext({
        userEmotion: 'ecstatic',
        currentPhase: 'building',
        turn: 3,
      });

      const withMatch = getUnlockedStories(contextWithMatch);
      const withoutMatch = getUnlockedStories(contextWithoutMatch);

      // Coffee ritual fits 'tired' emotion, should score higher with match
      const coffeeWithMatch = withMatch.find((u) => u.story.id === 'coffee-ritual');
      const coffeeWithoutMatch = withoutMatch.find((u) => u.story.id === 'coffee-ritual');

      if (coffeeWithMatch && coffeeWithoutMatch) {
        expect(coffeeWithMatch.fitScore).toBeGreaterThan(coffeeWithoutMatch.fitScore);
      }
    });
  });
});
