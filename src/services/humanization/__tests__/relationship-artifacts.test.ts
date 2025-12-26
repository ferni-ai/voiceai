/**
 * Relationship Artifacts Service Tests
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

vi.mock('../humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    breakthrough: vi.fn().mockResolvedValue(undefined),
    runningJoke: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  analyzeTurnForArtifacts,
  getBestCallback,
  getVocabularyToMirror,
  getOrCreateArtifacts,
  recordBreakthrough,
  recordInsideReference,
  updateVocabulary,
  markCallbackUsed,
  markVocabularyMirrored,
  markUserUsedReferenceBack,
  incrementTurns,
  getArtifactsSummary,
  clearSessionArtifacts,
  type RelationshipArtifacts,
  type TurnAnalysisContext,
} from '../relationship-artifacts.js';

describe('RelationshipArtifacts', () => {
  const userId = 'test-user-123';
  const personaId = 'ferni';

  const createContext = (overrides: Partial<TurnAnalysisContext> = {}): TurnAnalysisContext => ({
    userMessage: "That's interesting",
    ferniResponse: "I'm glad you think so",
    turn: 5,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionArtifacts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSessionArtifacts();
  });

  describe('getOrCreateArtifacts', () => {
    it('should create new artifacts for new user-persona pair', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);

      expect(artifacts.userId).toBe(userId);
      expect(artifacts.personaId).toBe(personaId);
      expect(artifacts.breakthroughs).toEqual([]);
      expect(artifacts.insideReferences).toEqual([]);
      expect(artifacts.userVocabulary).toEqual([]);
    });

    it('should return existing artifacts on second call', () => {
      const artifacts1 = getOrCreateArtifacts(userId, personaId);
      artifacts1.totalTurns = 10;

      const artifacts2 = getOrCreateArtifacts(userId, personaId);

      expect(artifacts2.totalTurns).toBe(10);
    });

    it('should create separate artifacts for different personas', () => {
      const ferniArtifacts = getOrCreateArtifacts(userId, 'ferni');
      const mayaArtifacts = getOrCreateArtifacts(userId, 'maya');

      expect(ferniArtifacts).not.toBe(mayaArtifacts);
    });
  });

  describe('analyzeTurnForArtifacts', () => {
    it('should detect breakthrough patterns', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "Oh my god, I never thought of it that way!",
          topic: 'relationships',
        }),
        artifacts
      );

      expect(result.newBreakthrough).toBeDefined();
      expect(result.newBreakthrough?.topic).toBe('relationships');
    });

    it('should detect "that makes sense now" as breakthrough', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "That makes sense now, I finally get it",
        }),
        artifacts
      );

      expect(result.newBreakthrough).toBeDefined();
    });

    it('should detect "I just realized" as breakthrough', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "Wait, I just realized something important",
        }),
        artifacts
      );

      expect(result.newBreakthrough).toBeDefined();
    });

    it('should detect breakthrough from high emotional relief', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "This is such a relief",
          emotionalIntensity: 0.8,
          emotion: 'relief',
        }),
        artifacts
      );

      expect(result.newBreakthrough).toBeDefined();
    });

    it('should extract Ferni share from response', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "I never thought of it that way!",
          ferniResponse: "I remember struggling with the same thing. It took me years to figure out.",
        }),
        artifacts
      );

      expect(result.newBreakthrough?.whatFerniShared).toBeDefined();
    });

    it('should detect inside reference candidates', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "Let's call this the Tuesday Rule",
        }),
        artifacts
      );

      expect(result.newReference).toBeDefined();
      expect(result.newReference?.type).toBe('shorthand');
    });

    it('should extract vocabulary from emotional statements', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "I feel overwhelmed and anxious",
        }),
        artifacts
      );

      expect(result.vocabularyUpdates.length).toBeGreaterThan(0);
    });

    it('should track response length for rhythm', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      artifacts.totalTurns = 5;
      artifacts.communicationRhythm.avgResponseLength = 20;

      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "This is a longer message with many words that should affect the average",
        }),
        artifacts
      );

      expect(result.rhythmUpdates.avgResponseLength).toBeDefined();
    });

    it('should track greeting on first turn', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "Hey there, how are you?",
          turn: 1,
        }),
        artifacts
      );

      expect(result.rhythmUpdates.typicalGreeting).toBe('hey');
    });

    it('should track depth triggers from high emotional topics', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      const result = analyzeTurnForArtifacts(
        createContext({
          userMessage: "This is really hard for me",
          emotionalIntensity: 0.7,
          topic: 'family',
        }),
        artifacts
      );

      expect(result.rhythmUpdates.depthTriggers).toContain('family');
    });
  });

  describe('recordBreakthrough', () => {
    it('should record a breakthrough with generated ID', () => {
      const bt = recordBreakthrough(userId, personaId, {
        turn: 10,
        timestamp: Date.now(),
        whatHappened: "Realized pattern",
        userReaction: 'aha',
        topic: 'growth',
        callbackPhrase: "Remember when you realized...",
        timesReferenced: 0,
      });

      expect(bt.id).toBeDefined();
      expect(bt.id).toContain('bt_');
    });

    it('should add breakthrough to artifacts', () => {
      recordBreakthrough(userId, personaId, {
        turn: 10,
        timestamp: Date.now(),
        whatHappened: "Insight",
        userReaction: 'emotional',
        topic: 'relationships',
        callbackPhrase: "Remember...",
        timesReferenced: 0,
      });

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.breakthroughs.length).toBe(1);
    });

    it('should cap breakthroughs at 50', () => {
      for (let i = 0; i < 55; i++) {
        recordBreakthrough(userId, personaId, {
          turn: i,
          timestamp: Date.now(),
          whatHappened: `Insight ${i}`,
          userReaction: 'quiet',
          topic: 'test',
          callbackPhrase: "Remember...",
          timesReferenced: 0,
        });
      }

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.breakthroughs.length).toBeLessThanOrEqual(50);
    });
  });

  describe('recordInsideReference', () => {
    it('should record an inside reference', () => {
      const ref = recordInsideReference(userId, personaId, {
        origin: "Turn 5: the thing",
        phrase: "the thing",
        fullContext: "You know, the thing we talked about",
        turnCreated: 5,
        timestamp: Date.now(),
        type: 'shorthand',
        timesUsed: 1,
        userUsedItBack: false,
      });

      expect(ref.id).toBeDefined();
      expect(ref.id).toContain('ref_');
    });

    it('should cap references at 30', () => {
      for (let i = 0; i < 35; i++) {
        recordInsideReference(userId, personaId, {
          origin: `Turn ${i}`,
          phrase: `phrase-${i}`,
          fullContext: "Context",
          turnCreated: i,
          timestamp: Date.now(),
          type: 'joke',
          timesUsed: 1,
          userUsedItBack: false,
        });
      }

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.insideReferences.length).toBeLessThanOrEqual(30);
    });
  });

  describe('updateVocabulary', () => {
    it('should add new vocabulary word', () => {
      updateVocabulary(userId, personaId, 'overwhelmed', 'emotional', 'feeling context');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const vocab = artifacts.userVocabulary.find(v => v.word === 'overwhelmed');

      expect(vocab).toBeDefined();
      expect(vocab?.category).toBe('emotional');
    });

    it('should increment frequency on repeat', () => {
      updateVocabulary(userId, personaId, 'basically', 'filler');
      updateVocabulary(userId, personaId, 'basically', 'filler');
      updateVocabulary(userId, personaId, 'basically', 'filler');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const vocab = artifacts.userVocabulary.find(v => v.word === 'basically');

      expect(vocab?.frequency).toBe(3);
    });

    it('should track context', () => {
      updateVocabulary(userId, personaId, 'synergy', 'technical', 'work discussion');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const vocab = artifacts.userVocabulary.find(v => v.word === 'synergy');

      expect(vocab?.contexts).toContain('work discussion');
    });

    it('should cap vocabulary at 100 words', () => {
      for (let i = 0; i < 110; i++) {
        updateVocabulary(userId, personaId, `word${i}`, 'unique');
      }

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.userVocabulary.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getBestCallback', () => {
    it('should return null when no artifacts exist', () => {
      const artifacts = getOrCreateArtifacts('new-user', personaId);
      const callback = getBestCallback(artifacts, { turn: 10 });

      expect(callback).toBeNull();
    });

    it('should return breakthrough callback when available', () => {
      recordBreakthrough(userId, personaId, {
        turn: 5,
        timestamp: Date.now(),
        whatHappened: "Big realization",
        userReaction: 'emotional',
        topic: 'family',
        callbackPhrase: "Remember when you realized about family...",
        timesReferenced: 0,
      });

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const callback = getBestCallback(artifacts, { turn: 30, topic: 'family' });

      if (callback) {
        expect(callback.type).toBe('breakthrough');
        expect(callback.content).toContain('family');
      }
    });

    it('should skip recently referenced callbacks', () => {
      const bt = recordBreakthrough(userId, personaId, {
        turn: 5,
        timestamp: Date.now(),
        whatHappened: "Insight",
        userReaction: 'aha',
        topic: 'work',
        callbackPhrase: "Remember work insight...",
        timesReferenced: 0,
      });

      // Mark as just referenced
      markCallbackUsed(userId, personaId, 'breakthrough', bt.id, 10);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const callback = getBestCallback(artifacts, { turn: 12 }); // Only 2 turns later

      // Should skip because referenced too recently
      expect(callback).toBeNull();
    });

    it('should boost topic-matching callbacks', () => {
      recordBreakthrough(userId, personaId, {
        turn: 5,
        timestamp: Date.now(),
        whatHappened: "Work insight",
        userReaction: 'aha',
        topic: 'work',
        callbackPhrase: "Remember work...",
        timesReferenced: 0,
      });

      recordBreakthrough(userId, personaId, {
        turn: 6,
        timestamp: Date.now(),
        whatHappened: "Family insight",
        userReaction: 'aha',
        topic: 'family',
        callbackPhrase: "Remember family...",
        timesReferenced: 0,
      });

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const callback = getBestCallback(artifacts, { turn: 30, topic: 'work' });

      if (callback) {
        expect(callback.content).toContain('work');
      }
    });
  });

  describe('getVocabularyToMirror', () => {
    it('should return unmirrored words', () => {
      updateVocabulary(userId, personaId, 'recalibrate', 'unique');
      updateVocabulary(userId, personaId, 'synergy', 'technical');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const toMirror = getVocabularyToMirror(artifacts, 2);

      expect(toMirror.length).toBeLessThanOrEqual(2);
      expect(toMirror.some(w => ['recalibrate', 'synergy'].includes(w))).toBe(true);
    });

    it('should prioritize emotional vocabulary', () => {
      updateVocabulary(userId, personaId, 'basically', 'filler');
      updateVocabulary(userId, personaId, 'overwhelmed', 'emotional');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const toMirror = getVocabularyToMirror(artifacts, 1);

      expect(toMirror[0]).toBe('overwhelmed');
    });

    it('should exclude already mirrored words', () => {
      updateVocabulary(userId, personaId, 'vibe', 'unique');
      markVocabularyMirrored(userId, personaId, 'vibe');

      updateVocabulary(userId, personaId, 'energy', 'emotional');

      const artifacts = getOrCreateArtifacts(userId, personaId);
      const toMirror = getVocabularyToMirror(artifacts, 2);

      expect(toMirror).not.toContain('vibe');
    });
  });

  describe('markCallbackUsed', () => {
    it('should increment breakthrough reference count', () => {
      const bt = recordBreakthrough(userId, personaId, {
        turn: 5,
        timestamp: Date.now(),
        whatHappened: "Insight",
        userReaction: 'aha',
        topic: 'growth',
        callbackPhrase: "Remember...",
        timesReferenced: 0,
      });

      markCallbackUsed(userId, personaId, 'breakthrough', bt.id, 20);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.breakthroughs[0].timesReferenced).toBe(1);
      expect(artifacts.breakthroughs[0].lastReferenced).toBe(20);
    });

    it('should increment reference use count', () => {
      const ref = recordInsideReference(userId, personaId, {
        origin: "Origin",
        phrase: "the thing",
        fullContext: "Full context",
        turnCreated: 5,
        timestamp: Date.now(),
        type: 'shorthand',
        timesUsed: 1,
        userUsedItBack: false,
      });

      markCallbackUsed(userId, personaId, 'reference', ref.id, 10);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.insideReferences[0].timesUsed).toBe(2);
    });
  });

  describe('markUserUsedReferenceBack', () => {
    it('should mark reference as confirmed', () => {
      const ref = recordInsideReference(userId, personaId, {
        origin: "Origin",
        phrase: "our thing",
        fullContext: "Context",
        turnCreated: 5,
        timestamp: Date.now(),
        type: 'shorthand',
        timesUsed: 1,
        userUsedItBack: false,
      });

      markUserUsedReferenceBack(userId, personaId, ref.id);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.insideReferences[0].userUsedItBack).toBe(true);
    });
  });

  describe('incrementTurns', () => {
    it('should increment turn count', () => {
      incrementTurns(userId, personaId);
      incrementTurns(userId, personaId);
      incrementTurns(userId, personaId);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.totalTurns).toBe(3);
    });

    it('should update last interaction', () => {
      const before = Date.now();
      incrementTurns(userId, personaId);

      const artifacts = getOrCreateArtifacts(userId, personaId);
      expect(artifacts.lastInteraction).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getArtifactsSummary', () => {
    it('should return accurate summary', () => {
      recordBreakthrough(userId, personaId, {
        turn: 5,
        timestamp: Date.now(),
        whatHappened: "Insight",
        userReaction: 'aha',
        topic: 'work',
        callbackPhrase: "Remember...",
        timesReferenced: 0,
      });

      recordInsideReference(userId, personaId, {
        origin: "Turn 10",
        phrase: "the thing",
        fullContext: "Context",
        turnCreated: 10,
        timestamp: Date.now(),
        type: 'joke',
        timesUsed: 3,
        userUsedItBack: true,
      });

      updateVocabulary(userId, personaId, 'synergy', 'technical');

      const summary = getArtifactsSummary(userId, personaId);

      expect(summary.hasBreakthroughs).toBe(true);
      expect(summary.breakthroughCount).toBe(1);
      expect(summary.hasInsideReferences).toBe(true);
      expect(summary.referenceCount).toBe(1);
      expect(summary.topVocabulary).toContain('synergy');
    });

    it('should describe communication style', () => {
      const artifacts = getOrCreateArtifacts(userId, personaId);
      artifacts.communicationRhythm.avgResponseLength = 60;
      artifacts.communicationRhythm.opensUpWhen = 'late_night';

      const summary = getArtifactsSummary(userId, personaId);

      expect(summary.communicationStyle).toContain('verbose');
      expect(summary.communicationStyle).toContain('opens up late');
    });
  });
});
