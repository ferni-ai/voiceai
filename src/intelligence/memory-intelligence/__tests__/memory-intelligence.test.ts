/**
 * Memory Intelligence Tests
 *
 * Comprehensive tests for the Memory Intelligence system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Types
import type {
  TurnContext,
  UserState,
  EmotionalState,
  TimingRuleContext,
  UserMemoryProfile,
  PhrasingStyle,
  PersonaId,
} from '../types.js';

// Timing
import { evaluateTimingRules, BLOCKING_RULES, TRIGGERING_RULES } from '../timing/timing-rules.js';
import { ReceptivityScorer, resetReceptivityScorer } from '../timing/receptivity-scorer.js';

// Phrasing
import { findMatchingTemplates, getTemplatesForStyle, getTemplatesForPersona } from '../phrasing/templates.js';
import { getPersonaVoice, getBestStyleForPersona, PERSONA_VOICES } from '../phrasing/persona-voice.js';
import { PhrasingGenerator, resetPhrasingGenerator } from '../phrasing/phrasing-generator.js';

// Learning
import { ResponseTracker, resetResponseTracker } from '../learning/response-tracker.js';
import { ProfileBuilder, resetProfileBuilder } from '../learning/profile-builder.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockTimingContext(overrides: Partial<TimingRuleContext> = {}): TimingRuleContext {
  return {
    turnCount: 5,
    crisisDetected: false,
    turnsSinceLastMemory: 5,
    emotionalIntensity: 0.5,
    emotionalValence: 0,
    isVulnerable: false,
    userEnergy: 0.6,
    cognitiveLoad: 0.4,
    timeOfDay: 'afternoon',
    isRushed: false,
    topicRelevance: 0.6,
    emotionalSimilarity: 0.5,
    hasOutstandingCommitment: false,
    daysSinceCommitment: undefined,
    personMentioned: false,
    hasPersonHistory: false,
    trustLevel: 'established',
    hasDeflectedTopic: false,
    topicSensitivity: 0.3,
    ...overrides,
  };
}

function createMockUserState(overrides: Partial<UserState> = {}): UserState {
  return {
    energy: 0.6,
    cognitiveLoad: 0.4,
    timeOfDay: 'afternoon',
    dayOfWeek: 3,
    isRushed: false,
    mood: 'neutral',
    ...overrides,
  };
}

function createMockEmotionalState(overrides: Partial<EmotionalState> = {}): EmotionalState {
  return {
    primary: 'neutral',
    intensity: 0.5,
    valence: 0,
    isVulnerable: false,
    trajectory: 'stable',
    ...overrides,
  };
}

function createMockUserProfile(overrides: Partial<UserMemoryProfile> = {}): UserMemoryProfile {
  return {
    userId: 'test-user',
    lastUpdated: new Date(),
    receptivityPatterns: {
      byTimeOfDay: new Map([[14, 0.7]]),
      byConversationDepth: new Map([['middle', 0.6]]),
      byEmotionalState: new Map([['positive', 0.8]]),
    },
    responsePatterns: {
      topicsWelcomed: ['career', 'goals'],
      topicsDeflected: ['politics'],
      preferredPhrasingStyle: 'warm_recall',
      averageEngagement: 0.6,
    },
    sensitiveTopics: new Set(['health']),
    idealRecallFrequency: 2,
    trustLevel: 'established',
    totalMemoriesSurfaced: 15,
    engagementRate: 0.65,
    ...overrides,
  };
}

// ============================================================================
// TIMING RULES TESTS
// ============================================================================

describe('Timing Rules', () => {
  describe('BLOCKING_RULES', () => {
    it('should have crisis_active rule', () => {
      const rule = BLOCKING_RULES.find((r) => r.name === 'crisis_active');
      expect(rule).toBeDefined();
      expect(rule?.type).toBe('blocking');
    });

    it('should block on crisis', () => {
      const ctx = createMockTimingContext({ crisisDetected: true });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('crisis_active');
    });

    it('should block on high emotional intensity', () => {
      const ctx = createMockTimingContext({ emotionalIntensity: 0.9 });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('emotional_intensity_high');
    });

    it('should block on low user energy', () => {
      const ctx = createMockTimingContext({ userEnergy: 0.2 });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('user_energy_low');
    });

    it('should block on recent surfacing', () => {
      const ctx = createMockTimingContext({ turnsSinceLastMemory: 1 });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('recently_surfaced');
    });

    it('should block on shallow conversation', () => {
      const ctx = createMockTimingContext({ turnCount: 2 });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('conversation_shallow');
    });

    it('should block when user deflected topic before', () => {
      const ctx = createMockTimingContext({ hasDeflectedTopic: true });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('user_deflected_before');
    });
  });

  describe('TRIGGERING_RULES', () => {
    it('should trigger on strong topic connection', () => {
      const ctx = createMockTimingContext({ topicRelevance: 0.85 });
      const result = evaluateTimingRules(ctx);

      expect(result.triggeringRulesFired.some((r) => r.name === 'topic_connection')).toBe(true);
    });

    it('should trigger on person with history', () => {
      const ctx = createMockTimingContext({ personMentioned: true, hasPersonHistory: true });
      const result = evaluateTimingRules(ctx);

      expect(result.triggeringRulesFired.some((r) => r.name === 'person_with_history')).toBe(true);
    });

    it('should trigger on commitment followup after 3+ days', () => {
      const ctx = createMockTimingContext({
        hasOutstandingCommitment: true,
        daysSinceCommitment: 5,
      });
      const result = evaluateTimingRules(ctx);

      expect(result.triggeringRulesFired.some((r) => r.name === 'commitment_followup')).toBe(true);
    });

    it('should trigger on emotional callback', () => {
      const ctx = createMockTimingContext({
        emotionalSimilarity: 0.8,
        emotionalIntensity: 0.5,
        trustLevel: 'established',
      });
      const result = evaluateTimingRules(ctx);

      expect(result.triggeringRulesFired.some((r) => r.name === 'emotional_callback')).toBe(true);
    });
  });

  describe('evaluateTimingRules', () => {
    it('should return shouldSurface=true for high priority trigger', () => {
      const ctx = createMockTimingContext({ topicRelevance: 0.9 });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should prioritize blocking over triggering', () => {
      const ctx = createMockTimingContext({
        topicRelevance: 0.9, // Trigger
        crisisDetected: true, // Block
      });
      const result = evaluateTimingRules(ctx);

      expect(result.shouldSurface).toBe(false);
      expect(result.blockingRulesFired).toContain('crisis_active');
    });
  });
});

// ============================================================================
// RECEPTIVITY SCORER TESTS
// ============================================================================

describe('Receptivity Scorer', () => {
  let scorer: ReceptivityScorer;

  beforeEach(async () => {
    resetReceptivityScorer();
    scorer = new ReceptivityScorer();
    await scorer.initialize();
  });

  afterEach(() => {
    resetReceptivityScorer();
  });

  it('should score higher for high energy users', async () => {
    const highEnergy = await scorer.score({
      userState: createMockUserState({ energy: 0.8 }),
      emotionalState: createMockEmotionalState(),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    const lowEnergy = await scorer.score({
      userState: createMockUserState({ energy: 0.2 }),
      emotionalState: createMockEmotionalState(),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    expect(highEnergy.score).toBeGreaterThan(lowEnergy.score);
  });

  it('should score lower for intense emotions', async () => {
    const calmResult = await scorer.score({
      userState: createMockUserState(),
      emotionalState: createMockEmotionalState({ intensity: 0.2 }),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    const intenseResult = await scorer.score({
      userState: createMockUserState(),
      emotionalState: createMockEmotionalState({ intensity: 0.9 }),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    expect(calmResult.score).toBeGreaterThan(intenseResult.score);
  });

  it('should boost score with learned patterns', async () => {
    const withProfile = await scorer.score({
      userState: createMockUserState(),
      emotionalState: createMockEmotionalState(),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      userProfile: createMockUserProfile(),
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    const withoutProfile = await scorer.score({
      userState: createMockUserState(),
      emotionalState: createMockEmotionalState(),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'established',
        turnsSinceLastMemory: 5,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.6,
      memoryEmotionalWeight: 0.5,
    });

    // With profile should have higher confidence
    expect(withProfile.confidence).toBeGreaterThanOrEqual(withoutProfile.confidence);
  });

  it('should track boosters and reducers', async () => {
    const result = await scorer.score({
      userState: createMockUserState({ energy: 0.8, mood: 'positive' }),
      emotionalState: createMockEmotionalState({ trajectory: 'improving' }),
      conversationContext: {
        recentMessages: [],
        topicsDiscussed: [],
        trustLevel: 'deep',
        turnsSinceLastMemory: 15,
        memoriesSurfacedThisSession: [],
        sessionStartTime: new Date(),
      },
      memoryRelevance: 0.9,
      memoryEmotionalWeight: 0.5,
    });

    expect(result.boosters.length).toBeGreaterThan(0);
    expect(result.boosters).toContain('High energy');
    expect(result.boosters).toContain('Positive mood');
  });
});

// ============================================================================
// PHRASING TEMPLATES TESTS
// ============================================================================

describe('Phrasing Templates', () => {
  it('should have templates for all styles', () => {
    const styles: PhrasingStyle[] = [
      'warm_recall',
      'gentle_callback',
      'curious_connection',
      'supportive_reference',
      'celebratory',
      'analytical',
      'matter_of_fact',
      'questioning',
    ];

    for (const style of styles) {
      const templates = getTemplatesForStyle(style);
      expect(templates.length).toBeGreaterThan(0);
    }
  });

  it('should have templates for all personas', () => {
    const personas: PersonaId[] = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'];

    for (const persona of personas) {
      const templates = getTemplatesForPersona(persona);
      expect(templates.length).toBeGreaterThan(0);
    }
  });

  it('should filter templates by criteria', () => {
    const templates = findMatchingTemplates({
      style: 'warm_recall',
      persona: 'ferni',
      trustLevel: 'established',
    });

    expect(templates.length).toBeGreaterThan(0);
    templates.forEach((t) => {
      expect(t.style).toBe('warm_recall');
      expect(t.personas).toContain('ferni');
    });
  });
});

// ============================================================================
// PERSONA VOICE TESTS
// ============================================================================

describe('Persona Voice', () => {
  it('should have voice definitions for all personas', () => {
    const personas: PersonaId[] = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'];

    for (const personaId of personas) {
      const voice = getPersonaVoice(personaId);
      expect(voice).toBeDefined();
      expect(voice.id).toBe(personaId);
      expect(voice.preferredStyles.length).toBeGreaterThan(0);
      expect(voice.vocabularyHints.length).toBeGreaterThan(0);
    }
  });

  it('should return appropriate style for emotional context', () => {
    // Ferni should not use celebratory for challenging emotions
    const challengingStyle = getBestStyleForPersona('ferni', { emotional: 'challenging' });
    expect(challengingStyle).not.toBe('celebratory');

    // Ferni can use celebratory for positive emotions with trust
    const positiveStyle = getBestStyleForPersona('ferni', {
      emotional: 'positive',
      trustLevel: 'established',
    });
    expect(positiveStyle).toBe('celebratory');
  });

  it('should have different characteristics per persona', () => {
    const ferni = PERSONA_VOICES.ferni;
    const peter = PERSONA_VOICES.peter;

    // Ferni should be warmer than Peter
    expect(ferni.characteristics.warmth).toBeGreaterThan(peter.characteristics.warmth);

    // Peter should be more analytical
    expect(peter.characteristics.analytical).toBeGreaterThan(ferni.characteristics.analytical);
  });
});

// ============================================================================
// PHRASING GENERATOR TESTS
// ============================================================================

describe('Phrasing Generator', () => {
  let generator: PhrasingGenerator;

  beforeEach(async () => {
    resetPhrasingGenerator();
    generator = new PhrasingGenerator();
    await generator.initialize();
  });

  afterEach(() => {
    resetPhrasingGenerator();
  });

  it('should generate phrasing for a memory', async () => {
    const mockMemory = {
      id: 'mem1',
      userId: 'user1',
      content: 'User mentioned wanting to learn Spanish',
      type: 'entity' as const,
      topics: ['language', 'learning'],
      peopleMentioned: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      importance: 0.6,
      emotionalWeight: 0.4,
      accessCount: 2,
      isActiveCommitment: false,
      embedding: [],
      metadata: {},
      strength: 1.0,
      isProtected: false,
      personaIds: [],
      storageLayer: 'memory' as const,
    };

    const result = await generator.generate(mockMemory, {
      persona: 'ferni',
      trustLevel: 'established',
    });

    expect(result.phrase).toBeDefined();
    expect(result.phrase.length).toBeGreaterThan(0);
    expect(result.style).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should generate alternatives when configured', async () => {
    const mockMemory = {
      id: 'mem2',
      userId: 'user1',
      content: 'User mentioned their sister Sarah',
      type: 'entity' as const,
      topics: ['family'],
      peopleMentioned: ['Sarah'],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      importance: 0.5,
      emotionalWeight: 0.3,
      accessCount: 1,
      isActiveCommitment: false,
      embedding: [],
      metadata: {},
      strength: 1.0,
      isProtected: false,
      personaIds: [],
      storageLayer: 'memory' as const,
    };

    const result = await generator.generate(mockMemory, {
      persona: 'ferni',
      trustLevel: 'established',
    });

    expect(result.alternatives).toBeDefined();
  });
});

// ============================================================================
// RESPONSE TRACKER TESTS
// ============================================================================

describe('Response Tracker', () => {
  let tracker: ResponseTracker;

  beforeEach(async () => {
    resetResponseTracker();
    tracker = new ResponseTracker();
    await tracker.initialize();
  });

  afterEach(() => {
    resetResponseTracker();
  });

  it('should track session state', () => {
    tracker.startSession('user1', 'session1');

    tracker.incrementTurn('session1');
    tracker.incrementTurn('session1');

    const surfacedMemories = tracker.getSessionSurfacedMemories('session1');
    expect(surfacedMemories).toEqual([]);
  });

  it('should record surfaced memories', () => {
    tracker.startSession('user1', 'session1');

    tracker.recordSurfaced({
      userId: 'user1',
      sessionId: 'session1',
      memoryId: 'mem1',
      memoryType: 'entity',
      trigger: 'topic_connection',
      style: 'warm_recall',
      persona: 'ferni',
      timestamp: new Date(),
    });

    const surfaced = tracker.getSessionSurfacedMemories('session1');
    expect(surfaced).toContain('mem1');
  });

  it('should track turns since last surfaced', () => {
    tracker.startSession('user1', 'session1');

    // Initial - should be high
    expect(tracker.getTurnsSinceLastSurfaced('session1')).toBeGreaterThanOrEqual(10);

    // Surface a memory at turn 2
    tracker.incrementTurn('session1');
    tracker.incrementTurn('session1');
    tracker.recordSurfaced({
      userId: 'user1',
      sessionId: 'session1',
      memoryId: 'mem1',
      memoryType: 'entity',
      trigger: 'topic_connection',
      style: 'warm_recall',
      persona: 'ferni',
      timestamp: new Date(),
    });

    // Should be 0 now
    expect(tracker.getTurnsSinceLastSurfaced('session1')).toBe(0);

    // Increment a few more turns
    tracker.incrementTurn('session1');
    tracker.incrementTurn('session1');
    expect(tracker.getTurnsSinceLastSurfaced('session1')).toBe(2);
  });

  it('should analyze response from text', () => {
    // Engaged response
    const engaged = tracker.analyzeResponseFromText(
      "Yes, that's right! I remember that conversation.",
      'User mentioned their career goals'
    );
    expect(engaged.type).toBe('engaged');

    // Deflection
    const deflected = tracker.analyzeResponseFromText(
      "Anyway, let's talk about something else now.",
      'User mentioned their career goals'
    );
    expect(deflected.type).toBe('deflected');

    // Request more
    const requestMore = tracker.analyzeResponseFromText('Tell me more about that, what else happened?', 'User mentioned their career goals');
    expect(requestMore.type).toBe('requested_more');
  });
});

// ============================================================================
// PROFILE BUILDER TESTS
// ============================================================================

describe('Profile Builder', () => {
  let builder: ProfileBuilder;

  beforeEach(async () => {
    resetProfileBuilder();
    builder = new ProfileBuilder();
    await builder.initialize();
  });

  afterEach(() => {
    resetProfileBuilder();
  });

  it('should create empty profile for new user', async () => {
    const result = await builder.buildProfile({
      userId: 'new-user',
      sessionRecords: [],
    });

    expect(result.profile.userId).toBe('new-user');
    expect(result.profile.trustLevel).toBe('new');
    expect(result.profile.totalMemoriesSurfaced).toBe(0);
  });

  it('should update profile from session records', async () => {
    const records = [
      {
        memoryId: 'mem1',
        userId: 'user1',
        sessionId: 'session1',
        surfacedAt: new Date(),
        trigger: 'topic_connection',
        style: 'warm_recall',
        persona: 'ferni',
        contextSnapshot: {
          turnCount: 5,
          emotionalIntensity: 0.4,
          topics: ['career'],
        },
        response: {
          type: 'engaged' as const,
          intensity: 0.7,
          timestamp: new Date(),
          turnsUntilResponse: 1,
        },
      },
    ];

    const result = await builder.buildProfile({
      userId: 'user1',
      sessionRecords: records,
    });

    expect(result.profile.totalMemoriesSurfaced).toBe(1);
    expect(result.profile.responsePatterns.topicsWelcomed).toContain('career');
  });

  it('should track deflected topics', async () => {
    const records = [
      {
        memoryId: 'mem1',
        userId: 'user1',
        sessionId: 'session1',
        surfacedAt: new Date(),
        trigger: 'topic_connection',
        style: 'warm_recall',
        persona: 'ferni',
        contextSnapshot: {
          turnCount: 5,
          emotionalIntensity: 0.4,
          topics: ['politics'],
        },
        response: {
          type: 'deflected' as const,
          intensity: 0.6,
          timestamp: new Date(),
          turnsUntilResponse: 1,
        },
      },
    ];

    const result = await builder.buildProfile({
      userId: 'user1',
      sessionRecords: records,
    });

    expect(result.profile.responsePatterns.topicsDeflected).toContain('politics');
    expect(result.changes.some((c) => c.field === 'topicsDeflected')).toBe(true);
  });

  it('should mark sensitive topics on negative emotional response', async () => {
    const records = [
      {
        memoryId: 'mem1',
        userId: 'user1',
        sessionId: 'session1',
        surfacedAt: new Date(),
        trigger: 'topic_connection',
        style: 'warm_recall',
        persona: 'ferni',
        contextSnapshot: {
          turnCount: 5,
          emotionalIntensity: 0.7,
          topics: ['health'],
        },
        response: {
          type: 'emotional_negative' as const,
          intensity: 0.8,
          timestamp: new Date(),
          turnsUntilResponse: 1,
        },
      },
    ];

    const result = await builder.buildProfile({
      userId: 'user1',
      sessionRecords: records,
    });

    expect(result.profile.sensitiveTopics.has('health')).toBe(true);
  });
});
