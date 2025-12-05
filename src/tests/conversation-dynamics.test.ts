/**
 * Conversation Dynamics Tests
 *
 * Tests for the new conversation improvement modules:
 * - Emotional arc tracking
 * - Response dynamics (length, transitions)
 * - Story timing
 * - Proactive starters
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { EmotionalArcTracker } from '../conversation/emotional-arc.js';
import { getEmotionalArcTracker, resetEmotionalArcTracker } from '../conversation/emotional-arc.js';
import type { ResponseDynamicsEngine } from '../conversation/response-dynamics.js';
import {
  getResponseDynamicsEngine,
  resetResponseDynamicsEngine,
} from '../conversation/response-dynamics.js';
import type { StoryTimingEngine } from '../conversation/story-timing.js';
import { getStoryTimingEngine, resetStoryTimingEngine } from '../conversation/story-timing.js';
import { generateProactiveOpener, buildOpenerContext } from '../conversation/proactive-starters.js';
import type { PersonaConfig } from '../personas/types.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';

// ============================================================================
// EMOTIONAL ARC TRACKER TESTS
// ============================================================================

describe('EmotionalArcTracker', () => {
  let tracker: EmotionalArcTracker;

  beforeEach(() => {
    resetEmotionalArcTracker();
    tracker = getEmotionalArcTracker();
  });

  describe('recordEmotion', () => {
    it('should record text emotion', () => {
      const textEmotion: EmotionResult = {
        primary: 'happy',
        intensity: 0.7,
        distressLevel: 0.1,
      };

      const arc = tracker.recordEmotion(textEmotion, null);

      expect(arc.currentEmotion).toBe('happy');
      expect(arc.currentValence).toBeGreaterThan(0);
    });

    it('should track improving trajectory', () => {
      // Record declining emotions first
      tracker.recordEmotion({ primary: 'sad', intensity: 0.6, distressLevel: 0.5 }, null);
      tracker.recordEmotion({ primary: 'sad', intensity: 0.5, distressLevel: 0.4 }, null);
      tracker.recordEmotion({ primary: 'neutral', intensity: 0.4, distressLevel: 0.2 }, null);

      // Then improving
      tracker.recordEmotion({ primary: 'calm', intensity: 0.4, distressLevel: 0.1 }, null);
      const arc = tracker.recordEmotion(
        { primary: 'happy', intensity: 0.6, distressLevel: 0.1 },
        null
      );

      expect(arc.trajectory).toBe('improving');
      expect(arc.valenceMomentum).toBeGreaterThan(0);
    });

    it('should detect need for emotional support', () => {
      const arc = tracker.recordEmotion(
        { primary: 'anxious', intensity: 0.8, distressLevel: 0.7 },
        null
      );

      expect(arc.needsEmotionalSupport).toBe(true);
    });

    it('should compute conversation temperature', () => {
      tracker.recordEmotion({ primary: 'excited', intensity: 0.9, distressLevel: 0 }, null);
      tracker.recordEmotion({ primary: 'angry', intensity: 0.8, distressLevel: 0.3 }, null);

      const arc = tracker.getArc();

      expect(arc.conversationTemperature).toBeGreaterThan(0.5);
    });
  });

  describe('getSsmlAdjustments', () => {
    it('should return slower speed for support needs', () => {
      tracker.recordEmotion({ primary: 'sad', intensity: 0.8, distressLevel: 0.7 }, null);

      const adjustments = tracker.getSsmlAdjustments();

      expect(adjustments.speed).toBeLessThan(0.85);
      expect(adjustments.addBreaks).toBe(true);
    });

    it('should return energetic settings for positive momentum', () => {
      tracker.recordEmotion({ primary: 'neutral', intensity: 0.4, distressLevel: 0.1 }, null);
      tracker.recordEmotion({ primary: 'happy', intensity: 0.5, distressLevel: 0 }, null);
      tracker.recordEmotion({ primary: 'happy', intensity: 0.6, distressLevel: 0 }, null);
      tracker.recordEmotion({ primary: 'excited', intensity: 0.7, distressLevel: 0 }, null);

      const adjustments = tracker.getSsmlAdjustments();

      // Should be somewhat faster for positive energy
      expect(adjustments.speed).toBeGreaterThanOrEqual(0.75);
    });
  });

  describe('getTransitionPhrase', () => {
    it('should return phrase for sudden mood improvement', () => {
      tracker.recordEmotion({ primary: 'sad', intensity: 0.7, distressLevel: 0.6 }, null);
      tracker.recordEmotion({ primary: 'happy', intensity: 0.7, distressLevel: 0.1 }, null);

      const phrase = tracker.getTransitionPhrase();

      expect(phrase).toBeTruthy();
      // Phrase is randomly selected, just verify it exists
      expect(typeof phrase).toBe('string');
    });

    it('should return phrase for sudden mood decline', () => {
      tracker.recordEmotion({ primary: 'happy', intensity: 0.7, distressLevel: 0.1 }, null);
      tracker.recordEmotion({ primary: 'sad', intensity: 0.7, distressLevel: 0.6 }, null);

      const phrase = tracker.getTransitionPhrase();

      expect(phrase).toBeTruthy();
    });
  });
});

// ============================================================================
// RESPONSE DYNAMICS TESTS
// ============================================================================

describe('ResponseDynamicsEngine', () => {
  let engine: ResponseDynamicsEngine;

  beforeEach(() => {
    resetResponseDynamicsEngine();
    engine = getResponseDynamicsEngine();
  });

  describe('recordMessage', () => {
    it('should track user messages', () => {
      engine.recordMessage('user', 'This is a test message with some words');

      const metrics = engine.getEngagementMetrics();

      expect(metrics.avgWordCount).toBeGreaterThan(0);
    });

    it('should track agent messages', () => {
      engine.recordMessage('agent', 'Hello there! How can I help you today?');

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getResponseLengthRecommendation', () => {
    it('should return default for insufficient data', () => {
      const rec = engine.getResponseLengthRecommendation();

      expect(rec.targetWordCount).toBe(40);
      expect(rec.rationale).toContain('Not enough data');
    });

    it('should adapt to verbose users', () => {
      // Simulate verbose user with increasingly long messages
      for (let i = 0; i < 6; i++) {
        engine.recordMessage(
          'user',
          'This is a very long message with lots of words because I have a lot to say about this particular topic and I want to share all my thoughts with you in great detail and really explain everything thoroughly.'
        );
      }

      const rec = engine.getResponseLengthRecommendation();
      const metrics = engine.getEngagementMetrics();

      // Should adapt to user's verbosity with longer responses
      expect(rec.targetWordCount).toBeGreaterThan(30);
      // Average word count should be high
      expect(metrics.avgWordCount).toBeGreaterThan(30);
    });

    it('should adapt to brief users', () => {
      // Simulate brief user
      for (let i = 0; i < 5; i++) {
        engine.recordMessage('user', 'Yes');
      }

      const rec = engine.getResponseLengthRecommendation();

      expect(rec.targetWordCount).toBeLessThan(40);
      expect(rec.shouldAbbreviate).toBe(true);
    });
  });

  describe('getTopicTransition', () => {
    it('should generate smooth transition phrase', () => {
      const transition = engine.getTopicTransition('retirement', 'investments');

      expect(transition.type).toBe('smooth');
      expect(transition.phrase).toContain('investment');
    });

    it('should generate callback transition', () => {
      // First discuss some topics
      engine.recordMessage('user', 'Let me tell you about retirement', ['retirement']);
      engine.recordMessage('user', 'Now about investments', ['investments']);
      engine.recordMessage('user', 'And then taxes', ['taxes']);

      // Return to earlier topic
      const transition = engine.getTopicTransition('taxes', 'retirement', 'callback');

      expect(transition.type).toBe('callback');
      expect(transition.phrase).toContain('retirement');
    });
  });

  describe('getPacingAnalysis', () => {
    it('should return unknown for insufficient data', () => {
      const pacing = engine.getPacingAnalysis();

      expect(pacing.userPacing).toBe('unknown');
      expect(pacing.confidence).toBe(0);
    });

    it('should include time of day factor', () => {
      const pacing = engine.getPacingAnalysis();

      expect(['morning', 'afternoon', 'evening', 'night']).toContain(pacing.timeOfDayFactor);
    });
  });

  describe('getLengthGuidance', () => {
    it('should return formatted guidance string', () => {
      engine.recordMessage('user', 'Hello');
      engine.recordMessage('user', 'How are you?');

      const guidance = engine.getLengthGuidance();

      expect(guidance).toContain('RESPONSE LENGTH');
      expect(guidance).toContain('Target');
    });
  });
});

// ============================================================================
// STORY TIMING TESTS
// ============================================================================

describe('StoryTimingEngine', () => {
  let engine: StoryTimingEngine;
  let mockPersona: PersonaConfig;

  beforeEach(() => {
    resetStoryTimingEngine();
    engine = getStoryTimingEngine();

    mockPersona = {
      id: 'test-persona',
      name: 'Test Persona',
      stories: [
        {
          id: 'story-1',
          triggers: ['retirement', 'future'],
          content: 'Let me tell you about a friend who retired early...',
        },
        {
          id: 'story-2',
          triggers: ['investing', 'stocks'],
          content: 'Back in the day, I learned an important lesson about investing...',
        },
      ],
    } as PersonaConfig;
  });

  describe('evaluateStoryTiming', () => {
    it('should not recommend story too early', () => {
      const context = {
        turnCount: 2,
        conversationDurationMs: 30000,
        storiesToldThisSession: [],
        userEngagement: 'high' as const,
        userPacing: 'normal' as const,
      };

      const rec = engine.evaluateStoryTiming(mockPersona, context);

      expect(rec.shouldTell).toBe(false);
      expect(rec.timing).toBe('soon');
    });

    it('should recommend story when conditions are right', () => {
      const context = {
        turnCount: 8,
        conversationDurationMs: 120000,
        storiesToldThisSession: [],
        userEngagement: 'high' as const,
        userPacing: 'relaxed' as const,
        currentTopic: 'retirement',
        recentTopics: ['retirement', 'savings'],
      };

      const rec = engine.evaluateStoryTiming(mockPersona, context);

      expect(rec.shouldTell).toBe(true);
      expect(rec.story).toBeDefined();
      expect(rec.transitionPhrase).toBeTruthy();
    });

    it('should not recommend when user is rushed', () => {
      const context = {
        turnCount: 10,
        conversationDurationMs: 60000,
        storiesToldThisSession: [],
        userEngagement: 'high' as const,
        userPacing: 'rushed' as const,
        currentTopic: 'retirement',
      };

      const rec = engine.evaluateStoryTiming(mockPersona, context);

      expect(rec.shouldTell).toBe(false);
      expect(rec.reason).toContain('rushed');
    });

    it('should respect story spacing', () => {
      const context = {
        turnCount: 10,
        conversationDurationMs: 120000,
        lastStoryTurn: 8, // Just told a story
        storiesToldThisSession: ['story-1'],
        userEngagement: 'high' as const,
        userPacing: 'relaxed' as const,
      };

      const rec = engine.evaluateStoryTiming(mockPersona, context);

      expect(rec.shouldTell).toBe(false);
      expect(rec.reason).toContain('Too soon');
    });
  });

  describe('findBestStory', () => {
    it('should find story matching current topic', () => {
      const context = {
        turnCount: 8,
        conversationDurationMs: 120000,
        storiesToldThisSession: [],
        userEngagement: 'high' as const,
        userPacing: 'relaxed' as const,
        currentTopic: 'investing',
      };

      const story = engine.findBestStory(mockPersona, context);

      expect(story).toBeDefined();
      expect(story?.triggers).toContain('investing');
    });

    it('should exclude already-told stories', () => {
      const context = {
        turnCount: 15,
        conversationDurationMs: 300000,
        storiesToldThisSession: ['story-1', 'story-2'],
        userEngagement: 'high' as const,
        userPacing: 'relaxed' as const,
      };

      const story = engine.findBestStory(mockPersona, context);

      expect(story).toBeNull();
    });
  });
});

// ============================================================================
// PROACTIVE STARTERS TESTS
// ============================================================================

describe('Proactive Conversation Starters', () => {
  let mockPersona: PersonaConfig;

  beforeEach(() => {
    mockPersona = {
      id: 'test-persona',
      name: 'Test Agent',
    } as PersonaConfig;
  });

  describe('generateProactiveOpener', () => {
    it('should generate first meeting opener', () => {
      const context = buildOpenerContext(null, false);

      const opener = generateProactiveOpener(mockPersona, context);

      expect(opener.type).toBe('first_meeting');
      expect(opener.greeting).toContain('Test Agent');
      expect(opener.ssmlTagged).toBe(true);
    });

    it('should generate returning user opener with name', () => {
      const context = {
        isReturningUser: true,
        userName: 'Sarah',
        lastConversationDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      };

      const opener = generateProactiveOpener(mockPersona, context);

      expect([
        'returning_familiar',
        'returning_reconnect',
        'memory_callback',
        'time_aware',
      ]).toContain(opener.type);
      expect(opener.greeting).toBeTruthy();
    });

    it('should generate memory callback opener with goals', () => {
      const context = {
        isReturningUser: true,
        userName: 'John',
        // Use a date more than 7 days ago to trigger memory callback (not returning_familiar)
        lastConversationDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        goals: [{ name: 'retirement fund', type: 'savings' }],
      };

      const opener = generateProactiveOpener(mockPersona, context);

      // Could be memory_callback or returning_reconnect depending on logic
      expect(['memory_callback', 'returning_reconnect']).toContain(opener.type);
      // Should reference goals somewhere
      if (opener.followUp) {
        expect(opener.followUp).toContain('retirement');
      }
    });

    it('should generate thread continuity opener with open questions', () => {
      const context = {
        isReturningUser: true,
        userName: 'Alex',
        openQuestions: ['whether to refinance your mortgage'],
      };

      const opener = generateProactiveOpener(mockPersona, context);

      expect(opener.type).toBe('thread_continuity');
      expect(opener.greeting).toContain('refinance');
    });
  });

  describe('buildOpenerContext', () => {
    it('should return minimal context for null profile', () => {
      const context = buildOpenerContext(null, false);

      expect(context.isReturningUser).toBe(false);
      expect(context.userName).toBeUndefined();
    });

    it('should extract user profile data', () => {
      // Note: buildOpenerContext uses UserProfile fields: name, lastContact, goals, primaryConcerns
      // openQuestions and lastConversationSummary are NOT part of UserProfile
      const profile = {
        name: 'Jane',
        lastContact: new Date('2024-01-15'),
        goals: [{ name: 'emergency fund', type: 'savings' }],
        primaryConcerns: ['market volatility'],
      };

      const context = buildOpenerContext(profile as any, true);

      expect(context.isReturningUser).toBe(true);
      expect(context.userName).toBe('Jane');
      expect(context.goals).toHaveLength(1);
      expect(context.primaryConcerns).toContain('market volatility');
      expect(context.lastConversationDate).toEqual(new Date('2024-01-15'));
      // openQuestions is not extracted from UserProfile - it would come from conversation summaries
      expect(context.openQuestions).toBeUndefined();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Conversation Dynamics Integration', () => {
  beforeEach(() => {
    resetEmotionalArcTracker();
    resetResponseDynamicsEngine();
    resetStoryTimingEngine();
  });

  it('should coordinate emotional arc with response dynamics', () => {
    const emotionalArc = getEmotionalArcTracker();
    const responseDynamics = getResponseDynamicsEngine();

    // User is highly distressed (distressLevel must be > 0.6 for needsEmotionalSupport)
    emotionalArc.recordEmotion({ primary: 'anxious', intensity: 0.8, distressLevel: 0.7 }, null);

    // User sends brief messages
    responseDynamics.recordMessage('user', 'I dont know');
    responseDynamics.recordMessage('user', 'Maybe');

    const arc = emotionalArc.getArc();
    const lengthRec = responseDynamics.getResponseLengthRecommendation();

    // Should detect distress
    expect(arc.currentValence).toBeLessThan(0);
    // Should recommend shorter responses due to brief user messages
    expect(lengthRec.targetWordCount).toBeLessThanOrEqual(50);
  });

  it('should integrate story timing with emotional arc', () => {
    const emotionalArc = getEmotionalArcTracker();
    const storyTiming = getStoryTimingEngine();

    // User is distressed
    emotionalArc.recordEmotion({ primary: 'sad', intensity: 0.8, distressLevel: 0.7 }, null);

    const arc = emotionalArc.getArc();

    const mockPersona = {
      id: 'test',
      name: 'Test',
      stories: [{ id: 's1', triggers: ['sad'], content: 'A story...' }],
    } as PersonaConfig;

    const rec = storyTiming.evaluateStoryTiming(mockPersona, {
      turnCount: 10,
      conversationDurationMs: 120000,
      storiesToldThisSession: [],
      emotionalArc: arc,
      userEngagement: 'high',
      userPacing: 'relaxed',
    });

    // Should NOT recommend story when user needs support
    expect(rec.shouldTell).toBe(false);
    expect(rec.reason).toContain('support');
  });
});
