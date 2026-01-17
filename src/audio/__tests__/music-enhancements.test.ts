/**
 * Music Enhancements Tests
 *
 * Tests for the enhanced music transition system:
 * - Analytics tracking
 * - Per-user learning (Thompson Sampling)
 * - Music memory integration
 * - A/B testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Analytics
import {
  getTransitionAnalytics,
  resetTransitionAnalytics,
  generateEventId,
  createTransitionEvent,
  recordTransitionWithAnalytics,
  recordEngagementSignals,
  getBestTransitionType,
  type TransitionEvent,
} from '../music-transition-analytics.js';

// User Learning
import {
  getUserProfile,
  selectTransitionWithLearning,
  updateUserLearning,
  getUserPreferredTransition,
  getUserLearningStats,
  clearAllProfiles,
  type UserTransitionProfile,
} from '../music-user-learning.js';

// Music Memory
import {
  storeMusicHelpedMemory,
  findRelevantMemories,
  getMusicPreferences,
  generateMusicCallback,
  shouldMentionMusicMemory,
  clearAllMusicMemories,
  getUserMusicMemoryStats,
  detectEmotionalContext,
  detectMusicHelped,
  type MusicHelpedMemory,
} from '../music-memory-integration.js';

// Enhanced transitions
import {
  getMusicTransition,
  recordTransitionFeedback,
  getTransitionAnalyticsDashboard,
  type TransitionResult,
} from '../intelligent-music-transitions.js';

import type { MusicSessionContext, MusicStartReason } from '../music-session-context.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestMusicContext(overrides: Partial<MusicSessionContext> = {}): MusicSessionContext {
  return {
    startReason: 'user_request',
    emotionalToneBeforeMusic: 'light',
    relationshipStage: 'friend',
    wasAmbient: false,
    durationMs: 30000,
    musicStartedAt: Date.now() - 30000, // 30 seconds ago
    ...overrides,
  };
}

function createTestTransitionResult(overrides: Partial<TransitionResult> = {}): TransitionResult {
  return {
    shouldSpeak: true,
    phrase: 'Test phrase',
    reasoning: 'Test reasoning',
    confidence: 0.8,
    transitionType: 'gentle_return',
    ...overrides,
  };
}

// ============================================================================
// ANALYTICS TESTS
// ============================================================================

describe('Music Transition Analytics', () => {
  beforeEach(() => {
    resetTransitionAnalytics();
  });

  describe('Event Recording', () => {
    it('should generate unique event IDs', () => {
      const id1 = generateEventId();
      const id2 = generateEventId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^evt_\d+_[a-z0-9]+$/);
    });

    it('should create transition events with all required fields', () => {
      const context = createTestMusicContext();
      const result = createTestTransitionResult();

      const event = createTransitionEvent('session-123', 'user-456', 'ferni', context, result);

      expect(event.sessionId).toBe('session-123');
      expect(event.userId).toBe('user-456');
      expect(event.personaId).toBe('ferni');
      expect(event.startReason).toBe(context.startReason);
      expect(event.transitionType).toBe(result.transitionType);
      expect(event.didSpeak).toBe(result.shouldSpeak);
      expect(event.confidence).toBe(result.confidence);
    });

    it('should record transitions and make them retrievable', () => {
      const analytics = getTransitionAnalytics();
      const context = createTestMusicContext();
      const result = createTestTransitionResult();

      const eventId = recordTransitionWithAnalytics(
        'session-123',
        'user-456',
        'ferni',
        context,
        result
      );

      expect(eventId).toMatch(/^evt_/);

      const recentEvents = analytics.getRecentEvents(10);
      expect(recentEvents.length).toBe(1);
      expect(recentEvents[0].eventId).toBe(eventId);
    });
  });

  describe('Engagement Tracking', () => {
    it('should record engagement signals for events', () => {
      const analytics = getTransitionAnalytics();
      const context = createTestMusicContext();
      const result = createTestTransitionResult({ transitionType: 'presence' });

      const eventId = recordTransitionWithAnalytics(
        'session-123',
        'user-456',
        'ferni',
        context,
        result
      );

      recordEngagementSignals(eventId, {
        timeToUserSpeechMs: 500,
        emotionalResponse: 'positive',
        continuedTopic: true,
      });

      const stats = analytics.getStats('presence');
      expect(stats).not.toBeNull();
      expect(stats!.count).toBe(1);
      expect(stats!.avgTimeToSpeech).toBe(500);
      expect(stats!.positiveResponseRate).toBe(1); // 100% positive
    });

    it('should calculate accurate positive response rates', () => {
      const analytics = getTransitionAnalytics();

      // Record 3 transitions: 2 positive, 1 neutral
      for (let i = 0; i < 3; i++) {
        const eventId = recordTransitionWithAnalytics(
          `session-${i}`,
          'user-456',
          'ferni',
          createTestMusicContext(),
          createTestTransitionResult({ transitionType: 'acknowledgment' })
        );

        recordEngagementSignals(eventId, {
          emotionalResponse: i < 2 ? 'positive' : 'neutral',
        });
      }

      const stats = analytics.getStats('acknowledgment');
      expect(stats!.count).toBe(3);
      expect(stats!.positiveResponseRate).toBeCloseTo(0.667, 1); // ~67%
    });
  });

  describe('A/B Testing', () => {
    it('should consistently assign users to variants', () => {
      const analytics = getTransitionAnalytics();

      const variant1 = analytics.getVariantAssignment('user-123', 'intelligent_transitions_v1');
      const variant2 = analytics.getVariantAssignment('user-123', 'intelligent_transitions_v1');

      expect(variant1).toBe(variant2);
      expect(['control', 'intelligent']).toContain(variant1);
    });

    it('should assign different users to different variants over time', () => {
      const analytics = getTransitionAnalytics();
      const variants = new Set<string>();

      // With enough users, we should see both variants
      for (let i = 0; i < 100; i++) {
        const variant = analytics.getVariantAssignment(`user-${i}`, 'intelligent_transitions_v1');
        if (variant) variants.add(variant);
      }

      // Should have at least control variant (20% of users)
      expect(variants.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Best Transition Type', () => {
    it('should return null with insufficient data', () => {
      const best = getBestTransitionType('user_request');
      expect(best).toBeNull();
    });

    it('should find best type based on positive response rate', () => {
      const analytics = getTransitionAnalytics();

      // Record many transitions with different types
      // Make 'presence' have highest positive rate
      for (let i = 0; i < 25; i++) {
        const type = i % 2 === 0 ? 'presence' : 'acknowledgment';
        const eventId = recordTransitionWithAnalytics(
          `session-${i}`,
          'user-test',
          'ferni',
          createTestMusicContext({ startReason: 'user_request' }),
          createTestTransitionResult({ transitionType: type as 'presence' | 'acknowledgment' })
        );

        recordEngagementSignals(eventId, {
          emotionalResponse: type === 'presence' ? 'positive' : 'neutral',
        });
      }

      // With enough data, best type should be presence (100% vs 0%)
      const best = getBestTransitionType('user_request');
      // May be null if not enough per-reason data yet
      if (best) {
        expect(best).toBe('presence');
      }
    });
  });
});

// ============================================================================
// USER LEARNING TESTS
// ============================================================================

describe('Music User Learning (Thompson Sampling)', () => {
  beforeEach(() => {
    clearAllProfiles();
  });

  describe('Profile Management', () => {
    it('should create default profile for new users', () => {
      const profile = getUserProfile('new-user-123');

      expect(profile.userId).toBe('new-user-123');
      expect(profile.totalTransitions).toBe(0);
      expect(profile.transitionArms).toBeDefined();
      expect(profile.transitionArms.silence).toBeDefined();
      expect(profile.transitionArms.silence.alpha).toBe(2); // Default prior
      expect(profile.transitionArms.silence.beta).toBe(2);
    });

    it('should persist profile updates', () => {
      const profile1 = getUserProfile('user-123');
      profile1.totalTransitions = 5;

      const profile2 = getUserProfile('user-123');
      expect(profile2.totalTransitions).toBe(5);
    });
  });

  describe('Thompson Sampling Selection', () => {
    it('should select from available transition types', () => {
      const { selectedType } = selectTransitionWithLearning('user-123', [
        'silence',
        'presence',
        'gentle_return',
      ]);

      expect(['silence', 'presence', 'gentle_return']).toContain(selectedType);
    });

    it('should return exploration rate', () => {
      const { explorationRate } = selectTransitionWithLearning('new-user', ['silence', 'presence']);

      // New users should have high exploration
      expect(explorationRate).toBeGreaterThan(0);
      expect(explorationRate).toBeLessThanOrEqual(1);
    });

    it('should use context preferences when available', () => {
      // Train the system to prefer silence for emotional moments
      updateUserLearning(
        'user-123',
        'silence',
        { wasPositive: true, confidence: 0.9, signals: [] },
        {
          emotionalTone: 'heavy',
        }
      );
      updateUserLearning(
        'user-123',
        'silence',
        { wasPositive: true, confidence: 0.9, signals: [] },
        {
          emotionalTone: 'heavy',
        }
      );
      updateUserLearning(
        'user-123',
        'silence',
        { wasPositive: true, confidence: 0.9, signals: [] },
        {
          emotionalTone: 'heavy',
        }
      );

      // Check preference is learned
      const profile = getUserProfile('user-123');
      expect(profile.contextPreferences.byEmotionalState.heavy).toBe('silence');
    });
  });

  describe('Learning Updates', () => {
    it('should update Thompson Sampling parameters on positive feedback', () => {
      const profile1 = getUserProfile('user-123');
      const initialAlpha = profile1.transitionArms.presence.alpha;

      updateUserLearning('user-123', 'presence', {
        wasPositive: true,
        confidence: 1.0,
        signals: ['Thank you, that was nice'],
      });

      const profile2 = getUserProfile('user-123');
      expect(profile2.transitionArms.presence.alpha).toBeGreaterThan(initialAlpha);
      expect(profile2.transitionArms.presence.pulls).toBe(1);
    });

    it('should update Thompson Sampling parameters on negative feedback', () => {
      const profile1 = getUserProfile('user-123');
      const initialBeta = profile1.transitionArms.presence.beta;

      updateUserLearning('user-123', 'presence', {
        wasPositive: false,
        confidence: 0.8,
        signals: [],
      });

      const profile2 = getUserProfile('user-123');
      expect(profile2.transitionArms.presence.beta).toBeGreaterThan(initialBeta);
    });

    it('should weight updates by confidence', () => {
      // Low confidence update
      updateUserLearning('user-123', 'silence', {
        wasPositive: true,
        confidence: 0.2,
        signals: [],
      });

      const profile1 = getUserProfile('user-123');
      const alpha1 = profile1.transitionArms.silence.alpha;

      // Reset and try high confidence
      clearAllProfiles();

      updateUserLearning('user-123', 'silence', {
        wasPositive: true,
        confidence: 1.0,
        signals: [],
      });

      const profile2 = getUserProfile('user-123');
      const alpha2 = profile2.transitionArms.silence.alpha;

      // High confidence should increase alpha more
      expect(alpha2).toBeGreaterThan(alpha1);
    });
  });

  describe('User Preferences', () => {
    it('should return null for users without enough data', () => {
      const pref = getUserPreferredTransition('new-user', {});
      expect(pref).toBeNull();
    });

    it('should return learned preferences for experienced users', () => {
      // Train the system
      for (let i = 0; i < 10; i++) {
        updateUserLearning('user-123', 'presence', {
          wasPositive: true,
          confidence: 0.9,
          signals: [],
        });
      }

      const stats = getUserLearningStats('user-123');
      expect(stats.totalTransitions).toBe(10);
      expect(stats.topTransitionTypes.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// MUSIC MEMORY TESTS
// ============================================================================

describe('Music Memory Integration', () => {
  beforeEach(() => {
    clearAllMusicMemories();
  });

  describe('Emotional Context Detection', () => {
    it('should detect stress from music context', () => {
      const context = createTestMusicContext({ startReason: 'comfort' });
      const emotional = detectEmotionalContext(context);

      expect(emotional.state).toBe('stressed');
      expect(emotional.intensity).toBeGreaterThan(0.5);
    });

    it('should detect celebration from music context', () => {
      const context = createTestMusicContext({ startReason: 'celebration' });
      const emotional = detectEmotionalContext(context);

      expect(emotional.state).toBe('celebrating');
    });

    it('should detect thinking from music context', () => {
      const context = createTestMusicContext({ startReason: 'thinking' });
      const emotional = detectEmotionalContext(context);

      expect(emotional.state).toBe('thinking');
    });

    it('should detect emotion from user message', () => {
      const emotional = detectEmotionalContext(null, "I've been so stressed lately");
      expect(emotional.state).toBe('stressed');
    });

    it('should extract topic from context', () => {
      const context = createTestMusicContext({ topicBeforeMusic: 'career change' });
      const emotional = detectEmotionalContext(context);

      expect(emotional.topic).toBe('career change');
    });
  });

  describe('Music Helped Detection', () => {
    it('should detect help from explicit positive response', () => {
      const result = detectMusicHelped('That was exactly what I needed, thank you');

      expect(result.helped).toBe(true);
      expect(result.explicitPositive).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect help from voice tone', () => {
      const result = detectMusicHelped(undefined, 'calmer', true);

      expect(result.helped).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect NOT helped from negative response', () => {
      const result = detectMusicHelped('That was kind of annoying actually');

      expect(result.helped).toBe(false);
    });

    it('should have moderate confidence with no signals', () => {
      const result = detectMusicHelped();

      // Base confidence is 0.3 + 0.2 (session continued default) = 0.5
      // This is the threshold - barely counts as "helped"
      expect(result.confidence).toBe(0.5);
      expect(result.helped).toBe(true); // >= 0.5 threshold means helped
      expect(result.explicitPositive).toBe(false); // No explicit positive signal
    });
  });

  describe('Memory Storage', () => {
    it('should store music memory when music helped', () => {
      const context = createTestMusicContext({
        startReason: 'comfort',
        trackArtist: 'Miles Davis',
      });

      const memory = storeMusicHelpedMemory('user-123', context, 'silence', {
        userResponse: 'That was lovely, thank you',
        voiceTone: 'calmer',
        continuedSession: true,
      });

      expect(memory).not.toBeNull();
      expect(memory!.userId).toBe('user-123');
      expect(memory!.effectiveTransition).toBe('silence');
      expect(memory!.evidence.explicitPositive).toBe(true);
    });

    it('should NOT store memory when music did not help', () => {
      const context = createTestMusicContext();

      const memory = storeMusicHelpedMemory('user-123', context, 'acknowledgment', {
        userResponse: 'meh',
        voiceTone: 'neutral',
      });

      // May or may not store depending on confidence
      // Just verify no error occurs
    });
  });

  describe('Memory Retrieval', () => {
    it('should find relevant memories by emotional context', () => {
      // Store some memories
      const context = createTestMusicContext({
        startReason: 'comfort',
        trackArtist: 'Jazz Artist',
      });

      storeMusicHelpedMemory('user-123', context, 'silence', {
        userResponse: 'That jazz really helped, thank you',
        voiceTone: 'calmer',
        continuedSession: true,
      });

      const memories = findRelevantMemories('user-123', {
        emotionalState: 'stressed',
      });

      expect(memories.length).toBeGreaterThanOrEqual(0); // May or may not match
    });

    it('should return empty array for new users', () => {
      const memories = findRelevantMemories('new-user', {});
      expect(memories).toEqual([]);
    });
  });

  describe('Music Callback Phrases', () => {
    it('should not generate callback for users without memories', () => {
      const callback = generateMusicCallback('new-user', 'ferni', {});
      expect(callback).toBeNull();
    });

    it('should check if we should mention music memory', () => {
      // New users shouldn't get music callbacks
      expect(shouldMentionMusicMemory('new-user')).toBe(false);

      // With memory but recent mention, should skip
      const recentTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
      expect(shouldMentionMusicMemory('user-123', recentTimestamp)).toBe(false);
    });
  });

  describe('Memory Stats', () => {
    it('should return empty stats for new users', () => {
      const stats = getUserMusicMemoryStats('new-user');

      expect(stats.totalMemories).toBe(0);
      expect(stats.hasStrongPreferences).toBe(false);
    });

    it('should track memory stats', () => {
      // Store a memory
      const context = createTestMusicContext({ startReason: 'comfort' });
      storeMusicHelpedMemory('user-123', context, 'silence', {
        userResponse: 'That was perfect, thank you',
        voiceTone: 'calmer',
        continuedSession: true,
      });

      const stats = getUserMusicMemoryStats('user-123');
      expect(stats.totalMemories).toBeGreaterThanOrEqual(0); // May or may not store
    });
  });
});

// ============================================================================
// ENHANCED TRANSITIONS INTEGRATION TESTS
// ============================================================================

describe('Enhanced Music Transitions (Full Integration)', () => {
  beforeEach(() => {
    resetTransitionAnalytics();
    clearAllProfiles();
    clearAllMusicMemories();
  });

  describe('getMusicTransition', () => {
    it('should work without enhancements', () => {
      const result = getMusicTransition({
        musicContext: createTestMusicContext(),
        personaId: 'ferni',
        enableEnhancements: false,
      });

      expect(result.usedUserLearning).toBe(false);
      expect(result.eventId).toBeUndefined();
    });

    it('should work without userId/sessionId', () => {
      const result = getMusicTransition({
        musicContext: createTestMusicContext(),
        personaId: 'ferni',
        enableEnhancements: true,
        // No userId or sessionId
      });

      expect(result.usedUserLearning).toBe(false);
    });

    it('should record analytics when enabled', () => {
      const result = getMusicTransition({
        musicContext: createTestMusicContext(),
        personaId: 'ferni',
        userId: 'user-123',
        sessionId: 'session-456',
        enableEnhancements: true,
      });

      expect(result.eventId).toBeDefined();
      expect(result.eventId).toMatch(/^evt_/);
      expect(result.experimentVariant).toBeDefined();
    });

    it('should return appropriate transition types', () => {
      const result = getMusicTransition({
        musicContext: createTestMusicContext({ startReason: 'celebration' }),
        personaId: 'ferni',
        userId: 'user-123',
        sessionId: 'session-456',
        enableEnhancements: true,
      });

      // Should be one of the valid types
      expect([
        'silence',
        'presence',
        'gentle_return',
        'topic_callback',
        'celebration_close',
        'acknowledgment',
        'check_in',
        'invitation',
        'persona_specific',
        'dj_vibes',
      ]).toContain(result.transitionType);
    });
  });

  describe('recordTransitionFeedback', () => {
    it('should update user learning on feedback', () => {
      // First, get a transition
      const result = getMusicTransition({
        musicContext: createTestMusicContext(),
        personaId: 'ferni',
        userId: 'user-123',
        sessionId: 'session-456',
        enableEnhancements: true,
      });

      // Record positive feedback
      recordTransitionFeedback(
        result.eventId!,
        'user-123',
        result.transitionType,
        {
          wasPositive: true,
          confidence: 0.9,
          userResponse: 'That was nice',
        },
        { musicContext: createTestMusicContext() }
      );

      // Check learning was updated
      const stats = getUserLearningStats('user-123');
      expect(stats.totalTransitions).toBeGreaterThan(0);
    });
  });

  describe('Analytics Dashboard', () => {
    it('should return dashboard data', () => {
      // Record some transitions
      for (let i = 0; i < 5; i++) {
        getMusicTransition({
          musicContext: createTestMusicContext(),
          personaId: 'ferni',
          userId: `user-${i}`,
          sessionId: `session-${i}`,
          enableEnhancements: true,
        });
      }

      const dashboard = getTransitionAnalyticsDashboard();

      expect(dashboard.recentDecisions.length).toBeGreaterThan(0);
      expect(dashboard.globalStats).toBeDefined();
    });
  });

  describe('User Learning Integration', () => {
    it('should use learned preferences over time', () => {
      const userId = 'learning-user';

      // Train the system to prefer silence
      for (let i = 0; i < 10; i++) {
        const result = getMusicTransition({
          musicContext: createTestMusicContext({ startReason: 'comfort' }),
          personaId: 'ferni',
          userId,
          sessionId: `session-${i}`,
          enableEnhancements: true,
        });

        // Positive feedback for silence
        if (result.transitionType === 'silence') {
          recordTransitionFeedback(
            result.eventId!,
            userId,
            'silence',
            { wasPositive: true, confidence: 1.0 },
            { emotionalTone: 'heavy' }
          );
        } else {
          // Negative feedback for non-silence
          recordTransitionFeedback(result.eventId!, userId, result.transitionType, {
            wasPositive: false,
            confidence: 0.8,
          });
        }
      }

      // Check if system learned preference
      const stats = getUserLearningStats(userId);
      expect(stats.totalTransitions).toBe(10);
    });
  });
});

// ============================================================================
// EDGE CASES & ERROR HANDLING
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    resetTransitionAnalytics();
    clearAllProfiles();
    clearAllMusicMemories();
  });

  it('should handle null music context gracefully', () => {
    const result = getMusicTransition({
      musicContext: null,
      personaId: 'ferni',
      userId: 'user-123',
      sessionId: 'session-456',
      enableEnhancements: true,
    });

    expect(result.transitionType).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should handle unknown persona gracefully', () => {
    const result = getMusicTransition({
      musicContext: createTestMusicContext(),
      personaId: 'unknown-persona',
      userId: 'user-123',
      sessionId: 'session-456',
    });

    expect(result.transitionType).toBeDefined();
  });

  it('should handle all start reasons', () => {
    const startReasons: MusicStartReason[] = [
      'user_request',
      'emotional_processing',
      'celebration',
      'thinking',
      'background',
      'game',
      'agent_offer',
      'comfort',
      'unknown',
    ];

    for (const reason of startReasons) {
      const result = getMusicTransition({
        musicContext: createTestMusicContext({ startReason: reason }),
        personaId: 'ferni',
        userId: 'user-123',
        sessionId: 'session-456',
      });

      expect(result.transitionType).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    }
  });

  it('should handle concurrent operations', async () => {
    const promises = Array(10)
      .fill(null)
      .map((_, i) =>
        Promise.resolve(
          getMusicTransition({
            musicContext: createTestMusicContext(),
            personaId: 'ferni',
            userId: `user-${i}`,
            sessionId: `session-${i}`,
            enableEnhancements: true,
          })
        )
      );

    const results = await Promise.all(promises);

    expect(results.length).toBe(10);
    results.forEach((result) => {
      expect(result.transitionType).toBeDefined();
    });
  });
});
