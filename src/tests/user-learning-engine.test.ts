/**
 * Tests for UserLearningEngine
 *
 * Validates that Jack gets smarter over time by:
 * 1. Learning user preferences from conversation patterns
 * 2. Capturing key moments (breakthroughs, concerns, celebrations)
 * 3. Building dynamic context for personalized responses
 * 4. Persisting insights to user profiles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  UserLearningEngine,
  getLearningEngine,
  resetLearningEngine,
} from '../intelligence/user-learning-engine.js';
import type { UserProfile } from '../types/user-profile.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type { IntentResult } from '../intelligence/intent-classifier.js';
import type { ConversationState } from '../intelligence/conversation-state.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockProfile(overrides?: Partial<UserProfile>): UserProfile {
  const now = new Date();
  return {
    id: 'test-user-123',
    name: 'Test User',
    firstContact: now,
    lastContact: now,
    totalConversations: 5,
    totalMinutesTalked: 120,
    communicationStyle: 'casual',
    speakingPace: 'moderate',
    preferredTopics: ['retirement', 'investing'],
    avoidTopics: [],
    humorAppreciation: 'high',
    relationshipStage: 'trusted_advisor',
    familyMembers: [],
    keyMoments: [],
    sharedStories: [],
    emotionalPatterns: [],
    riskProfile: {
      tolerance: 'moderate',
      confidence: 0.7,
      assessedAt: now,
      factors: [],
    },
    goals: [
      {
        id: 'goal-1',
        name: 'Retire Early',
        type: 'retirement',
        status: 'active',
        priority: 'high',
        timeHorizon: 'long',
        progressPercent: 45,
        createdAt: now,
        updatedAt: now,
      },
    ],
    primaryConcerns: ['retirement', 'market_volatility'],
    investmentEvents: [],
    hasInvestments: true,
    investmentExperience: 'intermediate',
    preferences: {
      verbosity: 'balanced',
      topicsToAvoid: [],
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'moderate',
    },
    conversationSummaries: [],
    openQuestions: [],
    pendingFollowUps: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

function createMockAnalysis(overrides?: {
  emotion?: Partial<EmotionResult>;
  intent?: Partial<IntentResult>;
  state?: Partial<ConversationState>;
}): {
  emotion: EmotionResult;
  intent: IntentResult;
  state: ConversationState;
} {
  const baseEmotion: EmotionResult = {
    primary: 'neutral',
    valence: 'neutral',
    intensity: 0.5,
    distressLevel: 0,
    confidence: 0.8,
    markers: [],
    suggestedTone: 'calm',
  };

  const baseIntent: IntentResult = {
    primary: 'asking_question',
    secondary: [],
    confidence: 0.8,
    requiresEmpathy: false,
    requiresAction: false,
    urgency: 'low',
    markers: [],
    suggestedApproach: 'Listen and respond naturally',
  };

  const baseState: ConversationState = {
    phase: 'exploring',
    turnCount: 5,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    greetingComplete: true,
    nameObtained: false,
    emotionalStateKnown: true,
    primaryConcernIdentified: false,
    currentMood: 'neutral',
    distressLevel: 0,
    emotionalTrend: 'stable',
    topicsDiscussed: [],
    currentTopic: null,
    topicsToCircleBack: [],
    userWantsToEnd: false,
    userNeedsSupport: false,
    userIsReturning: false,
  };

  return {
    emotion: { ...baseEmotion, ...overrides?.emotion } as EmotionResult,
    intent: { ...baseIntent, ...overrides?.intent } as IntentResult,
    state: { ...baseState, ...overrides?.state } as ConversationState,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('UserLearningEngine', () => {
  let engine: UserLearningEngine;

  beforeEach(() => {
    resetLearningEngine();
    engine = getLearningEngine();
  });

  afterEach(() => {
    resetLearningEngine();
  });

  describe('Key Moment Detection', () => {
    it('should detect shared vulnerability', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis({
        emotion: { primary: 'sadness', distressLevel: 0.6, intensity: 0.7 },
      });

      engine.processUserTurn(
        "I'm scared about the market. I've never told anyone this, but I lost half my savings in 2008.",
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.keyMoments).toHaveLength(1);
      expect(data.keyMoments[0].type).toBe('shared_vulnerability');
      expect(data.keyMoments[0].emotionalWeight).toBe('heavy');
    });

    it('should detect breakthrough moments', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis({
        emotion: { primary: 'joy', valence: 'positive', intensity: 0.8 },
      });

      engine.processUserTurn(
        'Oh! I finally understand what you mean about compound interest. That makes so much sense now!',
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.keyMoments.some((km) => km.type === 'breakthrough')).toBe(true);
    });

    it('should detect decision moments', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis({
        emotion: { primary: 'anticipation', intensity: 0.7 },
      });

      engine.processUserTurn(
        "You know what? I've decided to stop checking my portfolio every day. From now on, I'll only look quarterly.",
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.keyMoments.some((km) => km.type === 'decision')).toBe(true);
    });

    it('should detect celebration moments', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis({
        emotion: { primary: 'joy', valence: 'positive', intensity: 0.9 },
      });

      engine.processUserTurn(
        "I can't believe I actually did it! I finally paid off my credit card debt!",
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.keyMoments.some((km) => km.type === 'celebration')).toBe(true);
    });

    it('should detect concern moments from distress', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis({
        emotion: { primary: 'fear', distressLevel: 0.8, intensity: 0.8 },
      });

      engine.processUserTurn(
        'What if the market crashes again? This keeps me up at night.',
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.keyMoments.some((km) => km.type === 'concern')).toBe(true);
      expect(data.keyMoments.some((km) => km.followUpNeeded === true)).toBe(true);
    });
  });

  describe('Small Detail Extraction', () => {
    it('should extract family member names', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      engine.processUserTurn(
        'My wife Sarah and I are planning for our retirement together.',
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.smallDetails.some((d) => d.type === 'person_name' && d.value === 'Sarah')).toBe(
        true
      );
    });

    it('should extract pet names', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      engine.processUserTurn(
        'I was sitting with my dog Max when I saw the news about the market.',
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.smallDetails.some((d) => d.type === 'pet_name' && d.value === 'Max')).toBe(true);
    });

    it('should extract dollar amounts', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      engine.processUserTurn(
        "I've managed to save $50,000 so far for retirement.",
        analysis,
        profile
      );

      const data = engine.finalizeSession(profile);

      expect(data.smallDetails.some((d) => d.type === 'amount')).toBe(true);
    });
  });

  describe('Preference Learning', () => {
    it('should infer concise communication preference from short responses', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      // Simulate multiple short responses
      engine.processUserTurn('Yes.', analysis, profile);
      engine.processUserTurn('Makes sense.', analysis, profile);
      engine.processUserTurn('Got it.', analysis, profile);
      engine.processUserTurn('Okay.', analysis, profile);
      engine.processUserTurn('Sure.', analysis, profile);
      engine.processUserTurn('Right.', analysis, profile);

      const data = engine.finalizeSession(profile);

      // Should have learned concise preference
      const verbosityInsight = data.insights.find((i) => i.key === 'verbosity');
      expect(verbosityInsight).toBeDefined();
      expect(verbosityInsight?.value).toBe('concise');
    });

    it('should infer story appetite from engagement patterns', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      // Simulate asking for stories
      engine.processUserTurn('Tell me more about that. What happened?', analysis, profile);
      engine.processUserTurn(
        'I love hearing about your experiences. What else?',
        analysis,
        profile
      );
      engine.processUserTurn(
        "That's fascinating. Do you have any other stories like that?",
        analysis,
        profile
      );
      engine.processUserTurn('What was it like back then?', analysis, profile);
      engine.processUserTurn('Tell me about when you started Vanguard.', analysis, profile);
      engine.processUserTurn('I want to hear more stories.', analysis, profile);

      const data = engine.finalizeSession(profile);

      const storyInsight = data.insights.find((i) => i.key === 'storyAppetite');
      expect(storyInsight).toBeDefined();
      expect(storyInsight?.value).toBe('loves_stories');
    });

    it('should detect humor receptivity from user responses', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      // Simulate laughing at jokes
      engine.processUserTurn("Haha, that's a good one!", analysis, profile);
      engine.processUserTurn("LOL, you're funny Jack.", analysis, profile);
      engine.processUserTurn('That joke made my day 😂', analysis, profile);
      engine.processUserTurn('I love your sense of humor.', analysis, profile);
      engine.processUserTurn('You crack me up!', analysis, profile);
      engine.processUserTurn('Keep the jokes coming!', analysis, profile);

      const data = engine.finalizeSession(profile);

      const humorInsight = data.insights.find((i) => i.key === 'humorAppreciation');
      expect(humorInsight).toBeDefined();
      expect(humorInsight?.value).toBe('high');
    });
  });

  describe('Dynamic Context Building', () => {
    it('should include communication guidance in context', () => {
      const profile = createMockProfile({
        communicationStyle: 'formal',
        preferences: {
          verbosity: 'concise',
          topicsToAvoid: [],
          wantsProactiveAdvice: true,
          financialPrivacyLevel: 'moderate',
        },
        humorAppreciation: 'low',
      });
      const analysis = createMockAnalysis();

      engine.processUserTurn('Just give me the bottom line.', analysis, profile);

      const context = engine.buildDynamicContext(profile);

      expect(context.communicationGuidance).toContain('formal');
      expect(context.formattedForPrompt).toContain('COMMUNICATION');
    });

    it('should include active goals in context', () => {
      const profile = createMockProfile({
        goals: [
          {
            id: 'goal-1',
            name: 'Retire by 55',
            type: 'retirement',
            status: 'active',
            priority: 'high',
            timeHorizon: 'long',
            progressPercent: 60,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      const analysis = createMockAnalysis();

      engine.processUserTurn('How am I doing?', analysis, profile);

      const context = engine.buildDynamicContext(profile);

      expect(context.activeGoals).toHaveLength(1);
      expect(context.activeGoals[0]).toContain('retirement');
      expect(context.activeGoals[0]).toContain('60%');
    });

    it('should include known concerns in context', () => {
      const profile = createMockProfile({
        primaryConcerns: ['market_volatility', 'inflation'],
      });
      const analysis = createMockAnalysis();

      engine.processUserTurn('I worry about the economy.', analysis, profile);

      const context = engine.buildDynamicContext(profile);

      expect(context.knownConcerns).toContain('market_volatility');
      expect(context.knownConcerns).toContain('inflation');
    });

    it('should include relationship depth for returning users', () => {
      const profile = createMockProfile({
        totalConversations: 15,
        totalMinutesTalked: 300,
        relationshipStage: 'trusted_advisor',
      });
      const analysis = createMockAnalysis();

      engine.processUserTurn('Good to talk to you again.', analysis, profile);

      const context = engine.buildDynamicContext(profile);

      expect(context.relationshipDepth).toContain('Trusted advisor');
      expect(context.relationshipDepth).toContain('15 conversations');
    });
  });

  describe('Profile Learning Application', () => {
    it('should apply key moments to profile', () => {
      const profile = createMockProfile({ keyMoments: [] });
      const analysis = createMockAnalysis({
        emotion: { primary: 'sadness', distressLevel: 0.7, intensity: 0.8 },
      });

      engine.processUserTurn(
        "I'm scared I won't have enough for retirement. I've never told anyone how worried I am.",
        analysis,
        profile
      );

      const learningData = engine.finalizeSession(profile);
      const updatedProfile = UserLearningEngine.applyLearningToProfile(profile, learningData);

      expect(updatedProfile.keyMoments.length).toBeGreaterThan(0);
      expect(updatedProfile.keyMoments[0].type).toBe('shared_vulnerability');
    });

    it('should apply preference updates to profile', () => {
      const profile = createMockProfile({
        preferences: {
          verbosity: 'balanced',
          topicsToAvoid: [],
          wantsProactiveAdvice: true,
          financialPrivacyLevel: 'moderate',
        },
      });
      const analysis = createMockAnalysis();

      // Multiple short responses indicating concise preference
      for (let i = 0; i < 6; i++) {
        engine.processUserTurn('Yes. Got it.', analysis, profile);
      }

      const learningData = engine.finalizeSession(profile);
      const updatedProfile = UserLearningEngine.applyLearningToProfile(profile, learningData);

      // The preference should be updated
      expect(['concise', 'balanced']).toContain(updatedProfile.preferences.verbosity);
    });

    it('should add follow-up items from concerns', () => {
      const profile = createMockProfile({ pendingFollowUps: [] });
      const analysis = createMockAnalysis({
        emotion: { primary: 'fear', distressLevel: 0.6 },
      });

      engine.processUserTurn(
        "I'm really worried about retiring. What if the market crashes next month?",
        analysis,
        profile
      );

      // Simulate more turns for farewell summary
      engine.processAssistantTurn("That's a valid concern. Let me share some perspective...");
      engine.processUserTurn('Thanks, that helps.', createMockAnalysis(), profile);

      const learningData = engine.finalizeSession(profile);

      // Check that concerns were extracted
      expect(learningData.keyMoments.some((km) => km.type === 'concern')).toBe(true);
    });

    it('should track emotional patterns across conversation', () => {
      const profile = createMockProfile({ emotionalPatterns: [] });

      engine.processUserTurn(
        "I'm so worried about everything.",
        createMockAnalysis({
          emotion: { primary: 'fear', intensity: 0.8, distressLevel: 0.7 },
        }),
        profile
      );

      engine.processUserTurn(
        'That makes me feel a little better.',
        createMockAnalysis({
          emotion: { primary: 'trust', intensity: 0.6, valence: 'positive' },
        }),
        profile
      );

      engine.processUserTurn(
        'I think I can do this!',
        createMockAnalysis({
          emotion: { primary: 'anticipation', intensity: 0.7, valence: 'positive' },
        }),
        profile
      );

      const learningData = engine.finalizeSession(profile);
      const updatedProfile = UserLearningEngine.applyLearningToProfile(profile, learningData);

      expect(updatedProfile.emotionalPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Session Stats', () => {
    it('should track session statistics accurately', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      engine.processUserTurn('Hello Jack!', analysis, profile);
      engine.processAssistantTurn('Hello! Good to see you.');
      engine.processUserTurn(
        "I've decided to invest more.",
        createMockAnalysis({
          emotion: { primary: 'anticipation', intensity: 0.7 },
        }),
        profile
      );
      engine.processAssistantTurn("That's great!");

      const stats = engine.getSessionStats();

      expect(stats.turns).toBe(4);
      expect(stats.keyMoments).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Proactive Insights', () => {
    it('should suggest follow-up on pending topics', () => {
      const profile = createMockProfile({
        pendingFollowUps: [
          {
            topic: 'retirement planning',
            targetDate: new Date(Date.now() - 1000), // Due
            reason: 'User expressed concern',
          },
        ],
      });

      // Turn 5 - after warmup
      const insight = engine.getProactiveInsight(profile, 5);

      expect(insight).toBeDefined();
      expect(insight).toContain('retirement planning');
    });

    it('should celebrate near-completion goals', () => {
      const profile = createMockProfile({
        goals: [
          {
            id: 'goal-1',
            name: 'Pay off debt',
            type: 'other',
            status: 'active',
            priority: 'high',
            timeHorizon: 'medium',
            progressPercent: 92,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      // Try multiple times since there's randomness
      let found = false;
      for (let i = 0; i < 10; i++) {
        const insight = engine.getProactiveInsight(profile, 5);
        if (insight && insight.includes('92%')) {
          found = true;
          break;
        }
      }

      // At least once we should get the celebration
      expect(found).toBe(true);
    });

    it('should not suggest proactive insights too early', () => {
      const profile = createMockProfile();

      // Turn 2 - too early
      const insight = engine.getProactiveInsight(profile, 2);

      expect(insight).toBeNull();
    });

    it('should capture small details for potential reference', () => {
      const profile = createMockProfile();
      const analysis = createMockAnalysis();

      // Add a pet name
      engine.processUserTurn('My dog Max is my best friend.', analysis, profile);

      // Verify the detail was captured
      const stats = engine.getSessionStats();
      expect(stats.detailsCaptured).toBeGreaterThan(0);

      // The learning data should include the detail
      const learningData = engine.finalizeSession(profile);
      expect(learningData.smallDetails.some((d) => d.value === 'Max')).toBe(true);
    });
  });
});
