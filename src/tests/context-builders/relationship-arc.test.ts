/**
 * Relationship Arc System Tests
 *
 * Comprehensive tests for the complete relationship development system
 * from stranger to trusted confidant.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextBuilderInput } from '../../intelligence/context-builders/index.js';

// Mock Firestore
vi.mock('../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
}));

// Mock logger properly
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

// ============================================================================
// TYPES MODULE
// ============================================================================

describe('relationship-arc/types', () => {
  it('should create default arc data with correct structure', async () => {
    const { createDefaultRelationshipArcData } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    const arcData = createDefaultRelationshipArcData('user123');

    expect(arcData.userId).toBe('user123');
    expect(arcData.currentStage).toBe('stranger');
    expect(arcData.totalSessions).toBe(0);
    expect(arcData.firstMeeting).toBeNull();
    expect(arcData.keyMoments).toEqual([]);
    expect(arcData.sharedVocabulary).toEqual([]);
    expect(arcData.stageTransitions).toEqual([]);
  });

  it('should determine stage correctly based on sessions', async () => {
    const { determineStage } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    expect(determineStage(0)).toBe('stranger');
    expect(determineStage(1)).toBe('stranger');
    expect(determineStage(2)).toBe('acquaintance');
    expect(determineStage(5)).toBe('acquaintance');
    expect(determineStage(6)).toBe('friend');
    expect(determineStage(10)).toBe('friend');
    expect(determineStage(15)).toBe('trusted_advisor');
    expect(determineStage(20)).toBe('trusted_advisor');
  });
});

// ============================================================================
// STRANGER STAGE BUILDER (first-meeting-magic)
// ============================================================================

describe('relationship-arc/first-meeting-magic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockInput = (overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput =>
    ({
      userText: 'Hello, this is my first time here',
      analysis: {
        emotion: { primary: 'neutral', intensity: 0.5 },
        intent: { primary: 'greeting', confidence: 0.8 },
        topics: { detected: [], primary: null },
        state: { phase: 'opening' },
      },
      services: {
        sessionId: 'test-session',
        userId: 'test-user',
        sessionStartTime: Date.now(),
        userProfile: null,
        persona: {
          id: 'ferni',
          name: 'Ferni',
        },
      },
      userData: {
        turnCount: 0,
        isReturningUser: false,
      },
      userProfile: null,
      persona: {
        id: 'ferni',
        name: 'Ferni',
        systemPrompt: '',
        voiceId: '',
      } as any,
      ...overrides,
    }) as ContextBuilderInput;

  describe('energy detection', () => {
    it('should detect rushed energy from text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy("I have a quick question, don't have much time")).toBe('rushed');
      expect(detectUserEnergy('just need a quick answer')).toBe('rushed');
      expect(detectUserEnergy('gotta run but wanted to ask')).toBe('rushed');
    });

    it('should detect anxious energy from text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy("I don't know if this is okay")).toBe('anxious');
      expect(detectUserEnergy("Sorry, I'm not sure if I should ask")).toBe('anxious');
      expect(detectUserEnergy('um, I guess, maybe I could try')).toBe('anxious');
    });

    it('should detect excited energy from text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy('This is amazing! I finally found you!')).toBe('excited');
      expect(detectUserEnergy("I can't wait to get started!")).toBe('excited');
      expect(detectUserEnergy('This is great, so awesome!')).toBe('excited');
    });

    it('should detect low energy from text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy("I'm so tired and exhausted")).toBe('low');
      expect(detectUserEnergy('Had a rough day, feeling drained')).toBe('low');
      expect(detectUserEnergy("I've been struggling lately")).toBe('low');
    });

    it('should detect guarded energy from text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy("I'm just trying to see if this works")).toBe('guarded');
      expect(detectUserEnergy("I'll see, not sure if this is for me")).toBe('guarded');
      expect(detectUserEnergy('whatever, just wanted to check it out')).toBe('guarded');
    });

    it('should detect energy from voice signals', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy('hello', { primary: 'anxious', intensity: 0.8 })).toBe('anxious');
      expect(detectUserEnergy('hello', { primary: 'excited', intensity: 0.9 })).toBe('excited');
      expect(detectUserEnergy('hello', { primary: 'sad', intensity: 0.7 })).toBe('low');
      expect(detectUserEnergy('hello', { primary: 'neutral', intensity: 0.2 })).toBe('guarded');
    });

    it('should detect energy from speech rate', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy('hello', undefined, 200)).toBe('rushed'); // > 180 WPM
      expect(detectUserEnergy('hello', undefined, 80)).toBe('low'); // < 100 WPM
      expect(detectUserEnergy('hello', undefined, 150)).toBe('neutral'); // normal range
    });

    it('should default to neutral for ambiguous text', async () => {
      const { detectUserEnergy } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      expect(detectUserEnergy('Hello there')).toBe('neutral');
      expect(detectUserEnergy('Hi, how are you?')).toBe('neutral');
    });
  });

  describe('stage detection', () => {
    it('should identify first meeting for turn 0 non-returning user', async () => {
      const { checkIsFirstMeeting } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      const input = createMockInput({
        userData: { turnCount: 0, isReturningUser: false },
      });

      expect(checkIsFirstMeeting(input)).toBe(true);
    });

    it('should NOT identify first meeting for returning user', async () => {
      const { checkIsFirstMeeting } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      const input = createMockInput({
        userData: { turnCount: 0, isReturningUser: true },
      });

      expect(checkIsFirstMeeting(input)).toBe(false);
    });

    it('should NOT identify first meeting for later turns', async () => {
      const { checkIsFirstMeeting } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      const input = createMockInput({
        userData: { turnCount: 5, isReturningUser: false },
      });

      expect(checkIsFirstMeeting(input)).toBe(false);
    });
  });

  describe('builder', () => {
    it('should generate injections for first turn of first meeting', async () => {
      const { firstMeetingMagicBuilder } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      const input = createMockInput({
        userText: "Hi, I'm nervous to try this",
        userData: { turnCount: 0, isReturningUser: false },
        userProfile: null, // New user
      });

      const injections = await firstMeetingMagicBuilder.build(input);

      expect(injections.length).toBeGreaterThan(0);
    });

    it('should return empty for returning users', async () => {
      const { firstMeetingMagicBuilder } =
        await import('../../intelligence/context-builders/relationship/arc/first-meeting-magic.js');

      const input = createMockInput({
        userData: { turnCount: 0, isReturningUser: true },
        userProfile: { totalConversations: 5 } as any,
      });

      const injections = await firstMeetingMagicBuilder.build(input);

      expect(injections).toEqual([]);
    });
  });
});

// ============================================================================
// STAGE PROGRESSION
// ============================================================================

describe('relationship-arc stage progression', () => {
  it('should correctly determine stage from session count', async () => {
    const { determineStage } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    // Stranger (default)
    expect(determineStage(0)).toBe('stranger');
    expect(determineStage(1)).toBe('stranger');

    // Acquaintance (2+ sessions)
    expect(determineStage(2)).toBe('acquaintance');
    expect(determineStage(5)).toBe('acquaintance');

    // Friend (6+ sessions)
    expect(determineStage(6)).toBe('friend');
    expect(determineStage(14)).toBe('friend');

    // Trusted advisor (15+ sessions)
    expect(determineStage(15)).toBe('trusted_advisor');
    expect(determineStage(100)).toBe('trusted_advisor');
  });

  it('should respect trust score requirements for higher stages', async () => {
    const { determineStage } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    // The actual implementation requires trust >= minTrustRequired
    // trusted_advisor requires 0.7, friend requires 0.4

    // 15 sessions but insufficient trust (< 0.7) - doesn't reach trusted_advisor
    // Check what it actually becomes - might be friend if trust >= 0.4
    expect(determineStage(15, 0.3)).toBe('acquaintance'); // < 0.4 = acquaintance

    // 15 sessions with high trust - trusted_advisor
    expect(determineStage(15, 0.8)).toBe('trusted_advisor');

    // 6 sessions but low trust (< 0.4) - stays at acquaintance
    expect(determineStage(6, 0.2)).toBe('acquaintance');

    // 6 sessions with adequate trust (>= 0.4) - friend
    expect(determineStage(6, 0.5)).toBe('friend');

    // No trust score provided - defaults to passing trust check
    expect(determineStage(15)).toBe('trusted_advisor');
  });
});

// ============================================================================
// STORAGE OPERATIONS (with mocked Firestore)
// ============================================================================

describe('relationship-arc/storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should return null when Firestore unavailable', async () => {
    const { loadRelationshipArcData } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');

    // When Firestore is unavailable, returns null (callers should create default)
    const arcData = await loadRelationshipArcData('test-user');

    expect(arcData).toBeNull();
  });

  it('should check if first words callback is available', async () => {
    const { canMakeFirstWordsCallback } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');

    const { createDefaultRelationshipArcData } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    // No first meeting data
    const noFirstMeetingArc = createDefaultRelationshipArcData('user1');
    expect(canMakeFirstWordsCallback(noFirstMeetingArc)).toBe(false);

    // Has first meeting but not enough sessions
    const earlyArc = {
      ...createDefaultRelationshipArcData('user2'),
      totalSessions: 1,
      firstMeeting: {
        firstWords: 'Hello!',
        detectedEnergy: 'neutral' as const,
        timestamp: Date.now(),
        observations: [],
        firstWordsCallbackMade: false,
      },
    };
    expect(canMakeFirstWordsCallback(earlyArc)).toBe(false);

    // Ready for callback (3+ sessions)
    const readyArc = {
      ...createDefaultRelationshipArcData('user3'),
      totalSessions: 3,
      firstMeeting: {
        firstWords: 'Hello!',
        detectedEnergy: 'neutral' as const,
        timestamp: Date.now(),
        observations: [],
        firstWordsCallbackMade: false,
      },
    };
    expect(canMakeFirstWordsCallback(readyArc)).toBe(true);

    // Already made callback
    const usedArc = {
      ...createDefaultRelationshipArcData('user4'),
      totalSessions: 5,
      firstMeeting: {
        firstWords: 'Hello!',
        detectedEnergy: 'neutral' as const,
        timestamp: Date.now(),
        observations: [],
        firstWordsCallbackMade: true,
      },
    };
    expect(canMakeFirstWordsCallback(usedArc)).toBe(false);
  });

  it('should get unreferenced moments', async () => {
    const { getUnreferencedMoments } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');

    const { createDefaultRelationshipArcData, generateMomentId } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    const arcData = {
      ...createDefaultRelationshipArcData('user1'),
      keyMoments: [
        {
          id: generateMomentId(),
          type: 'breakthrough' as const,
          summary: 'test1',
          timestamp: Date.now(),
          sessionId: 's1',
          personaId: 'ferni',
          referencedCount: 0,
        },
        {
          id: generateMomentId(),
          type: 'vulnerability' as const,
          summary: 'test2',
          timestamp: Date.now(),
          sessionId: 's2',
          personaId: 'ferni',
          referencedCount: 2, // Referenced
        },
        {
          id: generateMomentId(),
          type: 'breakthrough' as const,
          summary: 'test3',
          timestamp: Date.now(),
          sessionId: 's3',
          personaId: 'ferni',
          referencedCount: 0,
        },
      ],
    };

    const unreferenced = getUnreferencedMoments(arcData);
    expect(unreferenced).toHaveLength(2);
    expect(unreferenced.every((m) => m.referencedCount === 0)).toBe(true);

    // Filter by type
    const breakthroughs = getUnreferencedMoments(arcData, 'breakthrough');
    expect(breakthroughs).toHaveLength(2);
    expect(breakthroughs.every((m) => m.type === 'breakthrough')).toBe(true);
  });

  it('should get moments by type', async () => {
    const { getMomentsByType } =
      await import('../../intelligence/context-builders/relationship/arc/storage.js');

    const { createDefaultRelationshipArcData, generateMomentId } =
      await import('../../intelligence/context-builders/relationship/arc/types.js');

    const arcData = {
      ...createDefaultRelationshipArcData('user1'),
      keyMoments: [
        {
          id: generateMomentId(),
          type: 'breakthrough' as const,
          summary: 'test1',
          timestamp: Date.now(),
          sessionId: 's1',
          personaId: 'ferni',
          referencedCount: 0,
        },
        {
          id: generateMomentId(),
          type: 'vulnerability' as const,
          summary: 'test2',
          timestamp: Date.now(),
          sessionId: 's2',
          personaId: 'ferni',
          referencedCount: 0,
        },
        {
          id: generateMomentId(),
          type: 'breakthrough' as const,
          summary: 'test3',
          timestamp: Date.now(),
          sessionId: 's3',
          personaId: 'ferni',
          referencedCount: 0,
        },
      ],
    };

    const breakthroughs = getMomentsByType(arcData, 'breakthrough');
    expect(breakthroughs).toHaveLength(2);

    const vulnerabilities = getMomentsByType(arcData, 'vulnerability');
    expect(vulnerabilities).toHaveLength(1);
  });
});

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

describe('relationship-arc/index convenience functions', () => {
  it('should export all necessary functions', async () => {
    const index = await import('../../intelligence/context-builders/relationship/arc/index.js');

    // Types and constants
    expect(typeof index.STAGE_CONFIGS).toBe('object');
    expect(typeof index.createDefaultRelationshipArcData).toBe('function');
    expect(typeof index.determineStage).toBe('function');

    // Storage functions
    expect(typeof index.loadRelationshipArcData).toBe('function');
    expect(typeof index.saveRelationshipArcData).toBe('function');
    expect(typeof index.recordFirstMeeting).toBe('function');
    expect(typeof index.recordKeyMoment).toBe('function');
    expect(typeof index.canMakeFirstWordsCallback).toBe('function');
    expect(typeof index.getUnreferencedMoments).toBe('function');

    // Builders
    expect(typeof index.firstMeetingMagicBuilder).toBe('object');
    expect(typeof index.acquaintanceDeepeningBuilder).toBe('object');
    expect(typeof index.friendshipFloweringBuilder).toBe('object');
    expect(typeof index.trustedAdvisorBuilder).toBe('object');

    // Convenience functions
    expect(typeof index.getRelationshipStage).toBe('function');
    expect(typeof index.recordSessionEnd).toBe('function');
    expect(typeof index.hasEstablishedRelationship).toBe('function');
    expect(typeof index.isFriendOrHigher).toBe('function');
  });

  it('should return stranger stage for new user', async () => {
    const { getRelationshipStage } =
      await import('../../intelligence/context-builders/relationship/arc/index.js');

    const stage = await getRelationshipStage('new-user-test');
    expect(stage).toBe('stranger');
  });

  it('should correctly check hasEstablishedRelationship', async () => {
    const { hasEstablishedRelationship } =
      await import('../../intelligence/context-builders/relationship/arc/index.js');

    // New user should not have established relationship
    const hasRelationship = await hasEstablishedRelationship('new-user-test');
    expect(hasRelationship).toBe(false);
  });
});
