/**
 * Intelligent Music Transitions Tests
 *
 * Tests the context-aware music transition system that makes Ferni
 * respond intelligently when music ends, based on:
 * - Why music started (emotional processing vs celebration vs background)
 * - Conversation context (topic, emotional tone)
 * - Relationship depth
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../utils/safe-logger.js', () => {
  const mockLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  });

  return {
    getLogger: mockLogger,
    createLogger: mockLogger,
  };
});

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  clearMusicContext,
  detectMidThought,
  endMusicContext,
  getMusicContext,
  inferMusicStartReason,
  startMusicContext,
  type MusicSessionContext,
} from '../music-session-context.js';

import {
  getIntelligentMusicTransition,
  type TransitionResult,
} from '../intelligent-music-transitions.js';

// ============================================================================
// MUSIC SESSION CONTEXT TESTS
// ============================================================================

describe('Music Session Context', () => {
  const testSessionId = 'test-session-123';

  beforeEach(() => {
    clearMusicContext(testSessionId);
  });

  afterEach(() => {
    clearMusicContext(testSessionId);
  });

  describe('startMusicContext', () => {
    it('should capture basic context when music starts', () => {
      startMusicContext(testSessionId, {
        startReason: 'emotional_processing',
        trackName: 'Clair de Lune',
        trackArtist: 'Debussy',
        topicBeforeMusic: 'grief',
        emotionalTone: 'heavy',
      });

      const context = getMusicContext(testSessionId);
      expect(context).not.toBeNull();
      expect(context?.startReason).toBe('emotional_processing');
      expect(context?.trackName).toBe('Clair de Lune');
      expect(context?.emotionalToneBeforeMusic).toBe('heavy');
    });

    it('should capture full context with all fields', () => {
      startMusicContext(testSessionId, {
        startReason: 'celebration',
        trackName: 'Happy',
        trackArtist: 'Pharrell Williams',
        topicBeforeMusic: 'job promotion',
        lastUserMessage: 'I got the promotion!',
        emotionalTone: 'light',
        userEmotion: 'happy',
        userEmotionIntensity: 0.9,
        wasUserMidThought: false,
        relationshipStage: 'friend',
        userName: 'Sarah',
        wasAmbient: false,
      });

      const context = getMusicContext(testSessionId);
      expect(context?.userName).toBe('Sarah');
      expect(context?.relationshipStage).toBe('friend');
      expect(context?.userEmotionIntensity).toBe(0.9);
    });
  });

  describe('endMusicContext', () => {
    it('should finalize context with duration', () => {
      startMusicContext(testSessionId, {
        startReason: 'background',
      });

      // Simulate some time passing
      const context = endMusicContext(testSessionId);

      expect(context).not.toBeNull();
      expect(context?.musicEndedAt).toBeDefined();
      expect(context?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return null if no context exists', () => {
      const result = endMusicContext('nonexistent-session');
      expect(result).toBeNull();
    });
  });

  describe('inferMusicStartReason', () => {
    it('should infer emotional_processing for heavy tone', () => {
      const reason = inferMusicStartReason('heavy', undefined, false, false);
      expect(reason).toBe('emotional_processing');
    });

    it('should infer comfort for crisis tone', () => {
      const reason = inferMusicStartReason('crisis', undefined, false, false);
      expect(reason).toBe('comfort');
    });

    it('should infer celebration for celebratory messages', () => {
      const reason = inferMusicStartReason('neutral', 'I got the job! Amazing news!', false, false);
      expect(reason).toBe('celebration');
    });

    it('should infer thinking for thinking keywords', () => {
      const reason = inferMusicStartReason(
        'neutral',
        'Let me think about this for a moment',
        false,
        false
      );
      expect(reason).toBe('thinking');
    });

    it('should infer user_request when user requested via flag', () => {
      const reason = inferMusicStartReason('neutral', 'Play some jazz', true, false);
      expect(reason).toBe('user_request');
    });

    it('should infer user_request from music keywords in message', () => {
      const reason = inferMusicStartReason('neutral', 'Play some jazz', false, false);
      expect(reason).toBe('user_request');
    });

    it('should infer user_request from spotify mention', () => {
      const reason = inferMusicStartReason(
        'neutral',
        'Can you play something on Spotify?',
        false,
        false
      );
      expect(reason).toBe('user_request');
    });

    it('should infer background for light tone', () => {
      const reason = inferMusicStartReason('light', undefined, false, false);
      expect(reason).toBe('background');
    });

    it('should infer background for ambient music', () => {
      const reason = inferMusicStartReason('neutral', undefined, false, true);
      expect(reason).toBe('background');
    });

    it('should infer comfort from comfort-seeking messages', () => {
      const reason = inferMusicStartReason(
        'neutral',
        'I need some calm, it was a rough day',
        false,
        false
      );
      expect(reason).toBe('comfort');
    });
  });

  describe('detectMidThought', () => {
    it('should detect trailing off with ellipsis', () => {
      expect(detectMidThought('I was thinking about...')).toBe(true);
    });

    it('should detect trailing off with dash', () => {
      expect(detectMidThought('The thing is—')).toBe(true);
    });

    it('should detect incomplete sentences with conjunctions', () => {
      expect(detectMidThought('I want to do it because')).toBe(true);
      expect(detectMidThought('I like it but')).toBe(true);
    });

    it('should detect thinking patterns', () => {
      expect(detectMidThought("I've been thinking about my options")).toBe(true);
      expect(detectMidThought('I was wondering if')).toBe(true);
    });

    it('should not detect complete sentences', () => {
      expect(detectMidThought('I feel better now.')).toBe(false);
      expect(detectMidThought('Thanks for listening!')).toBe(false);
    });
  });
});

// ============================================================================
// INTELLIGENT TRANSITIONS TESTS
// ============================================================================

describe('Intelligent Music Transitions', () => {
  const testSessionId = 'transition-test-123';

  beforeEach(() => {
    clearMusicContext(testSessionId);
  });

  afterEach(() => {
    clearMusicContext(testSessionId);
  });

  describe('Emotional Processing Transitions', () => {
    it('should favor silence for heavy emotional moments', () => {
      const context: MusicSessionContext = {
        startReason: 'emotional_processing',
        emotionalToneBeforeMusic: 'heavy',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      // Run multiple times to get statistical distribution
      let silenceCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
        });
        if (!result.shouldSpeak) silenceCount++;
      }

      // Should favor silence (~60% of the time)
      expect(silenceCount).toBeGreaterThan(40);
    });

    it('should have high confidence for silence during emotional moments', () => {
      const context: MusicSessionContext = {
        startReason: 'emotional_processing',
        emotionalToneBeforeMusic: 'heavy',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      const result = getIntelligentMusicTransition({
        musicContext: context,
        personaId: 'ferni',
      });

      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.reasoning.toLowerCase()).toContain('emotional');
    });

    it('should stay quieter for strangers in emotional moments', () => {
      const context: MusicSessionContext = {
        startReason: 'emotional_processing',
        emotionalToneBeforeMusic: 'heavy',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
        relationshipStage: 'stranger',
      };

      // Strangers should get more silence
      let silenceCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
          relationshipStage: 'stranger',
        });
        if (!result.shouldSpeak) silenceCount++;
      }

      // Strangers should get more silence than non-strangers (~60-90% of the time)
      // Using a lower threshold to account for random variance in tests
      expect(silenceCount).toBeGreaterThanOrEqual(55);
    });
  });

  describe('Celebration Transitions', () => {
    it('should mostly speak during celebrations', () => {
      const context: MusicSessionContext = {
        startReason: 'celebration',
        emotionalToneBeforeMusic: 'light',
        lastUserMessageBeforeMusic: 'I got the job!',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      let speakCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
        });
        if (result.shouldSpeak) speakCount++;
      }

      // Should speak ~80% of the time
      expect(speakCount).toBeGreaterThan(60);
    });

    it('should use celebration_close transition type', () => {
      const context: MusicSessionContext = {
        startReason: 'celebration',
        emotionalToneBeforeMusic: 'light',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      // Get a non-silent result
      let result: TransitionResult;
      do {
        result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
        });
      } while (!result.shouldSpeak);

      expect(result.transitionType).toBe('celebration_close');
    });
  });

  describe('Thinking Transitions', () => {
    it('should reference topic when available', () => {
      const context: MusicSessionContext = {
        startReason: 'thinking',
        topicBeforeMusic: 'career',
        lastUserMessageBeforeMusic: 'Let me think about this job decision',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      const result = getIntelligentMusicTransition({
        musicContext: context,
        personaId: 'ferni',
      });

      expect(result.shouldSpeak).toBe(true);
      expect(result.transitionType).toBe('topic_callback');
      expect(result.reasoning).toContain('topic');
    });

    it('should use invitation when no topic', () => {
      const context: MusicSessionContext = {
        startReason: 'thinking',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      const result = getIntelligentMusicTransition({
        musicContext: context,
        personaId: 'ferni',
      });

      expect(result.shouldSpeak).toBe(true);
      expect(result.transitionType).toBe('invitation');
    });
  });

  describe('Game Transitions', () => {
    it('should stay silent for game music (game handles flow)', () => {
      const context: MusicSessionContext = {
        startReason: 'game',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      const result = getIntelligentMusicTransition({
        musicContext: context,
        personaId: 'ferni',
      });

      expect(result.shouldSpeak).toBe(false);
      expect(result.transitionType).toBe('silence');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Background Music Transitions', () => {
    it('should often stay silent for background music', () => {
      const context: MusicSessionContext = {
        startReason: 'background',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      let silenceCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
        });
        if (!result.shouldSpeak) silenceCount++;
      }

      // Should be silent ~50% of the time
      expect(silenceCount).toBeGreaterThan(30);
    });

    it('should favor more silence late at night', () => {
      const context: MusicSessionContext = {
        startReason: 'background',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      let silenceCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
          isLateNight: true,
        });
        if (!result.shouldSpeak) silenceCount++;
      }

      // Should be silent ~70% of the time late at night
      expect(silenceCount).toBeGreaterThan(50);
    });
  });

  describe('Fallback Transitions', () => {
    it('should handle null context gracefully', () => {
      const result = getIntelligentMusicTransition({
        musicContext: null,
        personaId: 'ferni',
      });

      expect(result.transitionType).toBeDefined();
      expect(result.confidence).toBeLessThan(0.6); // Lower confidence for fallback
    });
  });

  describe('Persona-Specific Phrases', () => {
    const personas = [
      'ferni',
      'nayan-patel',
      'peter-john',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
    ];

    it('should generate different phrases for different personas', () => {
      const context: MusicSessionContext = {
        startReason: 'celebration',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      const phrases = new Set<string>();

      for (const persona of personas) {
        // Get a speaking result
        let result: TransitionResult;
        do {
          result = getIntelligentMusicTransition({
            musicContext: context,
            personaId: persona,
          });
        } while (!result.shouldSpeak);

        phrases.add(result.phrase || '');
      }

      // Should have some variety (may have some overlap but not all identical)
      expect(phrases.size).toBeGreaterThan(1);
    });

    it('should include SSML breaks in phrases', () => {
      const context: MusicSessionContext = {
        startReason: 'background',
        musicStartedAt: Date.now() - 30000,
        wasAmbient: false,
      };

      // Get a speaking result
      let result: TransitionResult;
      do {
        result = getIntelligentMusicTransition({
          musicContext: context,
          personaId: 'ferni',
        });
      } while (!result.shouldSpeak);

      // Phrases should include SSML breaks for natural pacing
      expect(result.phrase).toContain('<break');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Full Flow Integration', () => {
  const testSessionId = 'integration-test-123';

  afterEach(() => {
    clearMusicContext(testSessionId);
  });

  it('should capture context at music start and use it at music end', () => {
    // 1. User shares something heavy, music starts
    startMusicContext(testSessionId, {
      startReason: 'emotional_processing',
      trackName: 'Clair de Lune',
      trackArtist: 'Debussy',
      topicBeforeMusic: 'loss',
      lastUserMessage: 'My grandmother passed away last week',
      emotionalTone: 'heavy',
      userEmotion: 'sad',
      userEmotionIntensity: 0.8,
      relationshipStage: 'friend',
      userName: 'Alex',
      wasAmbient: false,
    });

    // 2. Music ends - finalize context
    const finalContext = endMusicContext(testSessionId);
    expect(finalContext).not.toBeNull();

    // 3. Get intelligent transition
    const transition = getIntelligentMusicTransition({
      musicContext: finalContext,
      personaId: 'ferni',
      relationshipStage: 'friend',
    });

    // 4. Should respect the emotional context (can be silence, presence, or check-in)
    const validReasonings = ['emotional', 'relationship', 'support', 'silence'];
    const hasValidReasoning = validReasonings.some((r) =>
      transition.reasoning.toLowerCase().includes(r)
    );
    expect(hasValidReasoning).toBe(true);
    expect(transition.confidence).toBeGreaterThan(0.5);

    // 5. Clear context
    clearMusicContext(testSessionId);
    expect(getMusicContext(testSessionId)).toBeNull();
  });

  it('should handle user-request to celebration flow', () => {
    // User asked for celebratory music
    startMusicContext(testSessionId, {
      startReason: 'user_request',
      trackName: 'Celebration',
      trackArtist: 'Kool & The Gang',
      lastUserMessage: 'Play something fun, I just got engaged!',
      emotionalTone: 'light',
      wasAmbient: false,
    });

    const finalContext = endMusicContext(testSessionId);
    const transition = getIntelligentMusicTransition({
      musicContext: finalContext,
      personaId: 'jordan-taylor', // Jordan is the party planner
    });

    // Should acknowledge with user-request handling
    expect(['silence', 'acknowledgment', 'gentle_return']).toContain(transition.transitionType);
  });
});
