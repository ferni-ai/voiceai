/**
 * Agent Orchestration Tests
 *
 * Tests for SessionServices, ContextManager, and conversation flow orchestration.
 * These tests verify the core integration points of the voice AI system.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import {
  createSessionServices,
  getSessionServices,
  getActiveSessionIds,
  initializeServices,
  type SessionServices,
} from '../services/index.js';
import { getContextManager, removeContextManager, type ContextManager } from '../context/context-manager.js';
import { createUserProfile, type UserProfile } from '../types/user-profile.js';
import { getEmotionDetector } from '../intelligence/emotion-detector.js';
import { getTopicTracker } from '../intelligence/topic-tracker.js';

describe('Agent Orchestration Tests', () => {
  // Initialize services ONCE for all tests (expensive operation)
  beforeAll(async () => {
    await initializeServices(false); // Don't index persona in tests
  }, 60000); // 60 second timeout for initialization

  describe('Session Services', () => {
    let testSessionId: string;
    let services: SessionServices;

    beforeEach(async () => {
      // Use unique session ID per test to avoid conflicts
      testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      services = await createSessionServices(testSessionId);
    }, 10000); // 10 second timeout for session creation

    afterEach(async () => {
      if (services) {
        await services.endSession();
      }
    });

    it('should create session services with unique session ID', () => {
      expect(services).toBeDefined();
      expect(services.sessionId).toBe(testSessionId);
      expect(services.sessionStartTime).toBeGreaterThan(0);
    });

    it('should track session in active sessions', () => {
      const activeIds = getActiveSessionIds();
      expect(activeIds).toContain(testSessionId);
    });

    it('should retrieve existing session', () => {
      const retrieved = getSessionServices(testSessionId);
      expect(retrieved).toBe(services);
    });

    it('should return undefined for non-existent session', () => {
      const nonExistent = getSessionServices('non-existent-session');
      expect(nonExistent).toBeUndefined();
    });

    it('should have all required service methods', () => {
      expect(typeof services.analyze).toBe('function');
      expect(typeof services.addTurn).toBe('function');
      expect(typeof services.getPromptContext).toBe('function');
      expect(typeof services.getDynamicContext).toBe('function');
      expect(typeof services.getSpeechContext).toBe('function');
      expect(typeof services.tagWithSsml).toBe('function');
      expect(typeof services.searchKnowledge).toBe('function');
      expect(typeof services.saveProfile).toBe('function');
      expect(typeof services.endSession).toBe('function');
    });

    it('should analyze user messages and return analysis', () => {
      const analysis = services.analyze("I'm worried about my retirement savings");

      expect(analysis).toBeDefined();
      expect(analysis.emotion).toBeDefined();
      expect(analysis.intent).toBeDefined();
      expect(analysis.state).toBeDefined();
      expect(analysis.topics).toBeDefined();
    });

    it('should detect emotion in analysis', () => {
      const anxiousAnalysis = services.analyze("I'm terrified about the market crash");
      expect(anxiousAnalysis.emotion.primary).toMatch(/fear|anxiety/);

      const happyAnalysis = services.analyze("I'm so excited about my investments!");
      expect(happyAnalysis.emotion.primary).toMatch(/joy|anticipation/);
    });

    it('should track conversation turns', () => {
      services.addTurn('user', 'Hello, I want to discuss retirement');
      services.addTurn('assistant', 'Of course! Tell me about your retirement goals.');
      services.addTurn('user', 'I want to retire at 65');

      const context = services.getPromptContext();
      expect(context.turnCount).toBeGreaterThanOrEqual(3);
    });

    it('should build prompt context', () => {
      services.addTurn('user', "I'm worried about my 401k");
      services.analyze("I'm worried about my 401k");

      const context = services.getPromptContext();

      expect(context).toBeDefined();
      expect(context.phase).toBeDefined();
      expect(context.formattedForPrompt).toBeDefined();
    });

    it('should build dynamic context from learning engine', () => {
      services.addTurn('user', 'I prefer index funds over individual stocks');
      services.analyze('I prefer index funds over individual stocks');

      const dynamicContext = services.getDynamicContext();

      expect(dynamicContext).toBeDefined();
      expect(dynamicContext.formattedForPrompt).toBeDefined();
    });

    it('should generate speech context', () => {
      const speechContext = services.getSpeechContext('Let me explain compound interest.');

      expect(speechContext).toBeDefined();
      expect(speechContext.userWPM).toBeGreaterThan(0);
    });

    it('should tag text with SSML', () => {
      const text = 'Remember: time in the market beats timing the market.';
      const tagged = services.tagWithSsml(text);

      expect(tagged).toBeDefined();
      expect(tagged.length).toBeGreaterThan(text.length); // SSML adds tags
    });

    it('should capture insights', () => {
      // Should not throw
      expect(() => {
        services.captureInsight('preference', 'response_length', 'brief', 0.8);
      }).not.toThrow();
    });
  });

  describe('Context Manager', () => {
    const testSessionId = `test-context-${Date.now()}`;
    let contextManager: ContextManager;
    let userProfile: UserProfile;

    beforeEach(() => {
      userProfile = createUserProfile('test-user', 'John');
      userProfile.totalConversations = 5;
      userProfile.relationshipStage = 'getting_to_know';
      userProfile.preferredTopics = ['retirement', 'index funds'];

      contextManager = getContextManager(testSessionId, userProfile);
    });

    afterEach(() => {
      removeContextManager(testSessionId);
    });

    it('should create context manager with session ID', () => {
      expect(contextManager).toBeDefined();
    });

    // Helper to create valid PhaseGuidance for tests
    const createMockGuidance = (
      phase:
        | 'greeting'
        | 'warming_up'
        | 'exploring'
        | 'advising'
        | 'supporting'
        | 'wrapping_up'
        | 'follow_up' = 'greeting'
    ) => ({
      phase,
      voiceMode: 'warm_welcome' as const,
      pacing: 'moderate' as const,
      focus: 'Build rapport',
      shouldAsk: ['How are you feeling?', 'What brings you here?'],
      shouldAvoid: ['Technical jargon', 'Rushing'],
      transitionCue: 'When user shares concern',
    });

    it('should track conversation turns', () => {
      contextManager.addTurn({ role: 'user', content: 'Hello', timestamp: new Date() });
      contextManager.addTurn({ role: 'assistant', content: 'Hi there!', timestamp: new Date() });

      const context = contextManager.buildPromptContext(
        {
          phase: 'greeting',
          currentMood: 'neutral',
          distressLevel: 0,
          turnCount: 2,
          userNeedsSupport: false,
          topicsDiscussed: [],
          currentTopic: null,
          topicsToCircleBack: [],
          startedAt: new Date(),
          lastActivityAt: new Date(),
          greetingComplete: false,
          nameObtained: false,
          emotionalStateKnown: false,
          primaryConcernIdentified: false,
          emotionalTrend: 'stable',
          userWantsToEnd: false,
          userIsReturning: false,
        },
        createMockGuidance(),
        {
          primary: 'neutral',
          intensity: 0.3,
          valence: 'neutral',
          distressLevel: 0,
          confidence: 0.5,
          markers: [],
          suggestedTone: 'friendly',
        }
      );

      expect(context.turnCount).toBe(2);
    });

    it('should build relationship context from profile', () => {
      const relationshipContext = contextManager.buildRelationshipContext();

      expect(relationshipContext).toContain('John');
      expect(relationshipContext).toContain('5'); // total conversations
    });

    it('should detect returning user status', () => {
      const context = contextManager.buildPromptContext(
        {
          phase: 'greeting',
          currentMood: 'neutral',
          distressLevel: 0,
          turnCount: 1,
          userNeedsSupport: false,
          topicsDiscussed: [],
          currentTopic: null,
          topicsToCircleBack: [],
          startedAt: new Date(),
          lastActivityAt: new Date(),
          greetingComplete: false,
          nameObtained: false,
          emotionalStateKnown: false,
          primaryConcernIdentified: false,
          emotionalTrend: 'stable',
          userWantsToEnd: false,
          userIsReturning: false,
        },
        createMockGuidance(),
        {
          primary: 'neutral',
          intensity: 0.3,
          valence: 'neutral',
          distressLevel: 0,
          confidence: 0.5,
          markers: [],
          suggestedTone: 'friendly',
        }
      );

      expect(context.isReturning).toBe(true);
      expect(context.userName).toBe('John');
    });

    it('should format context for prompt injection', () => {
      contextManager.addTurn({
        role: 'user',
        content: 'Tell me about retirement',
        timestamp: new Date(),
      });

      const context = contextManager.buildPromptContext(
        {
          phase: 'exploring',
          currentMood: 'curious',
          distressLevel: 0,
          turnCount: 1,
          userNeedsSupport: false,
          topicsDiscussed: ['retirement'],
          currentTopic: 'retirement',
          topicsToCircleBack: [],
          startedAt: new Date(),
          lastActivityAt: new Date(),
          greetingComplete: true,
          nameObtained: false,
          emotionalStateKnown: false,
          primaryConcernIdentified: false,
          emotionalTrend: 'stable',
          userWantsToEnd: false,
          userIsReturning: false,
        },
        createMockGuidance('exploring'),
        {
          primary: 'anticipation',
          intensity: 0.5,
          valence: 'positive',
          distressLevel: 0,
          confidence: 0.7,
          markers: [],
          suggestedTone: 'friendly',
        }
      );

      expect(context.formattedForPrompt).toBeDefined();
      expect(context.formattedForPrompt.length).toBeGreaterThan(0);
    });

    it('should handle new user without profile', () => {
      removeContextManager(testSessionId);
      const newContextManager = getContextManager(`new-${testSessionId}`);

      const context = newContextManager.buildPromptContext(
        {
          phase: 'greeting',
          currentMood: 'neutral',
          distressLevel: 0,
          turnCount: 0,
          userNeedsSupport: false,
          topicsDiscussed: [],
          currentTopic: null,
          topicsToCircleBack: [],
          startedAt: new Date(),
          lastActivityAt: new Date(),
          greetingComplete: false,
          nameObtained: false,
          emotionalStateKnown: false,
          primaryConcernIdentified: false,
          emotionalTrend: 'stable',
          userWantsToEnd: false,
          userIsReturning: false,
        },
        createMockGuidance(),
        {
          primary: 'neutral',
          intensity: 0.3,
          valence: 'neutral',
          distressLevel: 0,
          confidence: 0.5,
          markers: [],
          suggestedTone: 'friendly',
        }
      );

      expect(context.isReturning).toBe(false);
      expect(context.userName).toBeUndefined();

      removeContextManager(`new-${testSessionId}`);
    });
  });

  describe('Conversation Analyzer Integration', () => {
    it('should detect emotions correctly', () => {
      const detector = getEmotionDetector();

      const anxious = detector.detect("I'm so worried about losing everything");
      expect(anxious.valence).toBe('negative');
      expect(anxious.distressLevel).toBeGreaterThan(0.3);

      const happy = detector.detect('This is wonderful news!');
      expect(happy.valence).toBe('positive');
      expect(happy.primary).toBe('joy');
    });

    it('should track topics throughout conversation', () => {
      const tracker = getTopicTracker();
      // Create a fresh tracker for this test
      tracker.clear();

      const result1 = tracker.extract('I want to discuss my retirement savings');
      expect(result1.detected).toContain('retirement');

      const result2 = tracker.extract('What about mutual funds?');
      expect(result2.detected).toContain('funds');

      // Use getActiveTopics which returns Topic objects with name property
      const activeTopics = tracker.getActiveTopics();
      const topicNames = activeTopics.map((t) => t.name);
      expect(topicNames).toContain('retirement');
      expect(topicNames).toContain('funds');
    });

    it('should detect distress requiring support', () => {
      const detector = getEmotionDetector();

      const distressed = detector.detect(
        "I'm desperate and can't cope, I feel helpless about losing everything"
      );
      expect(distressed.distressLevel).toBeGreaterThan(0.5);
      // High distress should suggest supportive tones
      expect(['gentle', 'reassuring', 'calm', 'measured', 'informative']).toContain(
        distressed.suggestedTone
      );
    });

    it('should provide suggested tone based on emotion', () => {
      const detector = getEmotionDetector();

      const excited = detector.detect("I'm so excited about hitting my savings goal!");
      expect(excited.suggestedTone).toMatch(/warm|enthusiastic|friendly/);

      const sad = detector.detect('I feel really down about my financial situation');
      expect(sad.suggestedTone).toMatch(/gentle|reassuring/);
    });
  });

  describe('Session Lifecycle', () => {
    it('should clean up session on end', async () => {
      const sessionId = `lifecycle-test-${Date.now()}`;

      await initializeServices(false);
      const services = await createSessionServices(sessionId);

      // Session should be active
      expect(getActiveSessionIds()).toContain(sessionId);

      // End session
      await services.endSession();

      // Session should be removed
      expect(getActiveSessionIds()).not.toContain(sessionId);
      expect(getSessionServices(sessionId)).toBeUndefined();
    });

    it('should handle multiple concurrent sessions', async () => {
      const sessionIds = [
        `multi-test-1-${Date.now()}`,
        `multi-test-2-${Date.now()}`,
        `multi-test-3-${Date.now()}`,
      ];

      await initializeServices(false);

      // Create all sessions
      const sessions = await Promise.all(sessionIds.map((id) => createSessionServices(id)));

      // All should be active
      for (const id of sessionIds) {
        expect(getActiveSessionIds()).toContain(id);
      }

      // Clean up
      await Promise.all(sessions.map((s) => s.endSession()));

      // All should be removed
      for (const id of sessionIds) {
        expect(getActiveSessionIds()).not.toContain(id);
      }
    });
  });

  describe('Knowledge Search', () => {
    let services: SessionServices;
    let sessionId: string;

    beforeEach(async () => {
      // Services already initialized in top-level beforeAll
      sessionId = `knowledge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      services = await createSessionServices(sessionId);
    }, 10000);

    afterEach(async () => {
      if (services) {
        await services.endSession();
      }
    });

    it('should search knowledge base', async () => {
      // Knowledge search should return something or null, not throw
      const result = await services.searchKnowledge('compound interest');

      // Result could be null if embeddings aren't configured
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should handle empty search gracefully', async () => {
      const result = await services.searchKnowledge('');
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});
