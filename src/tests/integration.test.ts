/**
 * Integration Tests
 *
 * Tests the complete flow: Tools → Memory → Services → Context
 * These tests verify that all components work together correctly.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import {
  createSessionServices,
  initializeServices,
  type SessionServices,
} from '../services/index.js';
import { InMemoryStore } from '../memory/in-memory-store.js';
import { createUserProfile, type UserProfile } from '../types/user-profile.js';
import {
  createCalculatorTools,
  calculateCompoundGrowth,
  calculateFeeImpact,
} from '../tools/domains/finance/calculators.js';
import { getEmotionDetector } from '../intelligence/emotion-detector.js';
import { getStateMachine } from '../intelligence/conversation-state.js';

describe('Integration Tests: Tools → Memory → Services', () => {
  // Initialize services ONCE for all tests (expensive operation)
  beforeAll(async () => {
    await initializeServices(false);
  }, 60000); // 60 second timeout for initialization

  describe('Calculator Tools → Service Integration', () => {
    let services: SessionServices;
    let sessionId: string;

    beforeEach(async () => {
      // Use unique session ID per test
      sessionId = `integration-calc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      services = await createSessionServices(sessionId);
    }, 10000); // 10 second timeout

    afterEach(async () => {
      if (services) {
        await services.endSession();
      }
    });

    it('should analyze financial questions and provide context', () => {
      // User asks about compound interest
      const analysis = services.analyze('How much will my $10,000 grow in 30 years at 7%?');

      expect(analysis.topics).toBeDefined();
      expect(analysis.intent).toBeDefined();

      // Perform actual calculation
      const result = calculateCompoundGrowth(10000, 0, 30, 7);

      // Verify the numbers match expectations
      expect(result.finalValue).toBeGreaterThan(70000);
      expect(result.totalGrowth).toBeGreaterThan(60000);
    });

    it('should track fee impact question and provide context', () => {
      services.addTurn('user', "What's the impact of fees on my investments?");
      services.analyze("What's the impact of fees on my investments?");

      // Calculate fee impact
      const result = calculateFeeImpact(100000, 30, 7, 0.1, 2);

      // The fee impact should be substantial
      expect(result.difference).toBeGreaterThan(200000);
      expect(result.percentLost).toBeGreaterThan(30);

      // Context should track this conversation
      const context = services.getPromptContext();
      expect(context.turnCount).toBeGreaterThan(0);
    });
  });

  describe('Memory Store → Service Integration', () => {
    let store: InMemoryStore;
    let profile: UserProfile;

    beforeEach(async () => {
      store = new InMemoryStore();
      await store.initialize();
      profile = createUserProfile('test-user-123', 'Alice');
      await store.saveProfile(profile);
    });

    afterEach(async () => {
      await store.close();
    });

    it('should persist and retrieve user profile', async () => {
      const retrieved = await store.getProfile('test-user-123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Alice');
      expect(retrieved?.id).toBe('test-user-123');
    });

    it('should update profile through service lifecycle', async () => {
      // Modify profile
      profile.totalConversations = 5;
      profile.preferredTopics = ['retirement', 'index funds'];
      profile.relationshipStage = 'getting_to_know';
      await store.saveProfile(profile);

      // Retrieve and verify
      const updated = await store.getProfile('test-user-123');
      expect(updated?.totalConversations).toBe(5);
      expect(updated?.preferredTopics).toContain('retirement');
      expect(updated?.relationshipStage).toBe('getting_to_know');
    });

    it('should save and retrieve conversation summaries', async () => {
      const summary = {
        id: 'summary-001',
        sessionId: 'session-001',
        timestamp: new Date(),
        duration: 600,
        turnCount: 15,
        mainTopics: ['retirement', 'savings'],
        keyPoints: ['Discussed 401k contributions', 'Explained compound interest'],
        emotionalArc: 'curious → engaged → satisfied',
      };

      await store.saveSummary('test-user-123', summary);
      const summaries = await store.getSummaries('test-user-123');

      expect(summaries.length).toBe(1);
      expect(summaries[0].mainTopics).toContain('retirement');
    });

    it('should save and retrieve financial goals', async () => {
      const goal = {
        id: 'goal-001',
        name: 'Retirement Fund',
        type: 'retirement' as const,
        targetAmount: 1000000,
        currentProgress: 250000,
        progressPercent: 25,
        status: 'active' as const,
        priority: 'high' as const,
        timeHorizon: 'long' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await store.saveGoal('test-user-123', goal);
      const goals = await store.getGoals('test-user-123');

      expect(goals.length).toBe(1);
      expect(goals[0].name).toBe('Retirement Fund');
      expect(goals[0].targetAmount).toBe(1000000);
    });
  });

  describe('Emotion Detection → Context Flow', () => {
    let services: SessionServices;
    let sessionId: string;

    beforeEach(async () => {
      // Services already initialized in top-level beforeAll
      sessionId = `integration-emotion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      services = await createSessionServices(sessionId);
    }, 10000);

    afterEach(async () => {
      if (services) {
        await services.endSession();
      }
    });

    it('should detect emotion and propagate to context', () => {
      // User expresses worry
      services.addTurn('user', "I'm really worried about my retirement");
      const analysis = services.analyze("I'm really worried about my retirement");

      expect(analysis.emotion.primary).toMatch(/fear|anxiety|worry/);
      expect(analysis.emotion.distressLevel).toBeGreaterThan(0.2);

      // Context should reflect emotional state
      const context = services.getPromptContext();
      expect(context.needsSupport || context.emotionalContext).toBeTruthy();
    });

    it('should track emotional trajectory across turns', () => {
      // Start worried
      services.addTurn('user', "I'm stressed about money");
      services.analyze("I'm stressed about money");

      // Reassure with info
      services.addTurn('assistant', "Let's look at this together. What are your main concerns?");

      // User feels better
      services.addTurn('user', 'That helps, I feel more confident now');
      const analysis2 = services.analyze('That helps, I feel more confident now');

      // Emotion should shift positive
      expect(analysis2.emotion.valence).toBe('positive');
    });
  });

  describe('State Machine → Context Integration', () => {
    it('should progress through conversation phases', () => {
      const stateMachine = getStateMachine(false);

      // Start in greeting
      expect(stateMachine.getState().phase).toBe('greeting');

      // Simulate conversation progression using processTurn()
      stateMachine.processTurn({
        userMessage: 'I need help with retirement planning',
        topics: ['retirement'],
        emotion: {
          primary: 'neutral',
          valence: 'neutral',
          distressLevel: 0,
          intensity: 0.3,
          confidence: 0.7,
          markers: [],
          suggestedTone: 'friendly',
        },
        intent: {
          primary: 'seeking_advice',
          secondary: [],
          confidence: 0.8,
          urgency: 'medium',
          requiresAction: false,
          requiresEmpathy: false,
          suggestedApproach: 'provide advice',
          markers: [],
        },
      });

      // Should transition based on content
      const state = stateMachine.getState();
      expect(state.topicsDiscussed).toContain('retirement');
    });

    it('should generate appropriate guidance per phase', () => {
      const stateMachine = getStateMachine(false);

      const guidance = stateMachine.getGuidance();

      expect(guidance.voiceMode).toBeDefined();
      expect(guidance.shouldAsk).toBeDefined();
      expect(guidance.shouldAsk.length).toBeGreaterThan(0);
    });
  });

  describe('Full Conversation Cycle', () => {
    let services: SessionServices;
    let sessionId: string;

    beforeEach(async () => {
      // Services already initialized in top-level beforeAll
      sessionId = `integration-full-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      services = await createSessionServices(sessionId);
    }, 10000);

    afterEach(async () => {
      if (services) {
        await services.endSession();
      }
    });

    it('should handle complete conversation flow', async () => {
      // Turn 1: Greeting
      services.addTurn('user', 'Hi, I want to talk about investing');
      const analysis1 = services.analyze('Hi, I want to talk about investing');
      expect(analysis1.topics.detected).toBeDefined();

      // Turn 2: Question
      services.addTurn('assistant', 'Of course! What aspect of investing interests you most?');

      // Turn 3: Specific topic
      services.addTurn('user', 'How do I start investing for retirement?');
      const analysis2 = services.analyze('How do I start investing for retirement?');
      expect(analysis2.intent).toBeDefined();

      // Turn 4: Response
      services.addTurn(
        'assistant',
        'Great question! Let me explain the basics of retirement investing...'
      );

      // Check context evolution
      const context = services.getPromptContext();
      expect(context.turnCount).toBe(4);
      expect(context.phase).toBeDefined();

      // Dynamic context should have learned something
      const dynamicContext = services.getDynamicContext();
      expect(dynamicContext).toBeDefined();
    });

    it('should generate SSML for responses', () => {
      services.addTurn('user', 'Tell me about index funds');

      const text =
        'Index funds are a great choice for most investors. They offer low costs and broad diversification.';
      const ssml = services.tagWithSsml(text);

      // Should have SSML tags
      expect(ssml).toContain('<');
      expect(ssml.length).toBeGreaterThan(text.length);
    });

    it('should handle learning and insights', () => {
      // Simulate learning
      services.addTurn('user', 'I prefer keeping things simple');
      services.analyze('I prefer keeping things simple');

      // Capture insight
      services.captureInsight('preference', 'communication_style', 'simple', 0.8);

      // Should not throw
      expect(() => {
        services.captureInsight('topic_interest', 'index_funds', 'high', 0.9);
      }).not.toThrow();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid profile ID gracefully', async () => {
      const store = new InMemoryStore();
      await store.initialize();

      const profile = await store.getProfile('non-existent-user');
      expect(profile).toBeNull();

      await store.close();
    });

    it('should handle empty message analysis', async () => {
      await initializeServices(false);
      const services = await createSessionServices(`error-test-${Date.now()}`);

      // Empty message should not throw
      const analysis = services.analyze('');
      expect(analysis).toBeDefined();

      await services.endSession();
    });

    it('should handle concurrent session operations', async () => {
      await initializeServices(false);

      const sessions = await Promise.all([
        createSessionServices(`concurrent-1-${Date.now()}`),
        createSessionServices(`concurrent-2-${Date.now()}`),
        createSessionServices(`concurrent-3-${Date.now()}`),
      ]);

      // All should be independent
      sessions[0].addTurn('user', 'Session 1 message');
      sessions[1].addTurn('user', 'Session 2 message');
      sessions[2].addTurn('user', 'Session 3 message');

      // Each should have own turn count
      expect(sessions[0].getPromptContext().turnCount).toBe(1);
      expect(sessions[1].getPromptContext().turnCount).toBe(1);
      expect(sessions[2].getPromptContext().turnCount).toBe(1);

      // Cleanup
      await Promise.all(sessions.map((s) => s.endSession()));
    });
  });
});
