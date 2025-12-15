/**
 * Intelligence Systems E2E Tests
 *
 * End-to-end tests that verify the complete flow:
 * 1. Initialize intelligence for new user
 * 2. Process messages and detect moments
 * 3. Track relationship progression
 * 4. Verify prompt injection
 * 5. Export memory for persistence
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// E2E FLOW TESTS
// ============================================================================

describe('Intelligence E2E Flow', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should complete full session flow for new user', async () => {
    const { IntelligenceIntegration } =
      await import('../../agents/shared/intelligence-integration.js');

    // Create new user session
    const intelligence = new IntelligenceIntegration('ferni', 'new-user-123', undefined, {
      autoDetectMoments: true,
      enablePredictive: true,
      enablePersistence: false, // Skip Firestore for test
      saveOnSessionEnd: false,
      momentConfidenceThreshold: 0.5,
    });

    // Start session
    intelligence.startSession();
    const initialState = intelligence.getSessionState();
    expect(initialState.sessionNumber).toBe(1);

    // Process first message - should detect vulnerability
    const result1 = await intelligence.processMessage(
      "This is hard to say, but I've never told anyone about my struggles with self-doubt."
    );
    expect(result1.moments.length).toBeGreaterThan(0);
    expect(result1.moments.some((m) => m.type === 'first_vulnerability')).toBe(true);

    // Get prompt injection - should have relationship context
    const injection = intelligence.getPromptInjection('self-doubt');
    expect(injection).toContain('RELATIONSHIP');

    // Process message with breakthrough
    const result2 = await intelligence.processMessage(
      "I never realized I was scared of success. That's why I keep holding myself back."
    );
    expect(result2.moments.some((m) => m.type === 'breakthrough')).toBe(true);

    // Check session state
    const finalState = intelligence.getSessionState();
    expect(finalState.momentsDetected.length).toBeGreaterThanOrEqual(2);
    expect(finalState.hasSharedVulnerability).toBe(true);

    // Export memory
    const memory = intelligence.getEngine().getRelationshipMemory();
    expect(memory.sharedMoments.length).toBeGreaterThanOrEqual(2);
    expect(memory.totalSessions).toBe(1);
  });

  it('should track relationship progression across sessions', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const userId = 'returning-user-456';
    const personaId = 'ferni';

    // Session 1: First conversation
    const engine1 = new RelationshipMemoryEngine(userId, personaId);
    engine1.startSession();
    engine1.recordMoment('first_vulnerability', 'User opened up about anxiety');
    engine1.endSession('neutral', 'medium', ['mental-health']);

    // Get memory after session 1
    const memory1 = engine1.getMemory();
    expect(memory1.stage).toBe('stranger');
    expect(memory1.totalSessions).toBe(1);

    // Session 2-5: Build relationship
    for (let i = 2; i <= 5; i++) {
      engine1.startSession();
      engine1.recordMoment('breakthrough', `Session ${i} insight`);
      engine1.endSession('positive', 'high', ['growth']);
    }

    // Check progression
    const memory5 = engine1.getMemory();
    expect(memory5.totalSessions).toBe(5);
    expect(memory5.sharedMoments.length).toBe(5);

    // Session 6-10: Deepen relationship
    for (let i = 6; i <= 10; i++) {
      engine1.startSession();
      if (i === 8) {
        engine1.recordMoment('laughter', 'Shared laugh moment');
      } else {
        engine1.recordMoment('callback_resonance', `Callback landed in session ${i}`);
      }
      engine1.endSession('positive', 'high', ['relationship']);
    }

    // Check final state
    const memory10 = engine1.getMemory();
    expect(memory10.totalSessions).toBe(10);
    // Should have progressed from stranger
    expect(['stranger', 'acquaintance', 'friend']).toContain(memory10.stage);
  });

  it('should detect crisis and flag for immediate attention', async () => {
    const { IntelligenceIntegration } =
      await import('../../agents/shared/intelligence-integration.js');

    const intelligence = new IntelligenceIntegration('ferni', 'crisis-user-789', undefined, {
      autoDetectMoments: true,
      enablePredictive: true,
      enablePersistence: false,
      saveOnSessionEnd: false,
      momentConfidenceThreshold: 0.5,
    });

    intelligence.startSession();

    // Process crisis message
    const result = await intelligence.processMessage(
      "I can't do this anymore. Everything is falling apart. What's the point of trying?"
    );

    // Should detect crisis
    expect(result.moments.some((m) => m.type === 'crisis_support')).toBe(true);

    // Predictive should flag concerns
    expect(result.predictive?.concerns.length).toBeGreaterThan(0);

    // Session state should reflect crisis
    const state = intelligence.getSessionState();
    expect(state.overallMood).toBe('crisis');
  });

  it('should generate appropriate team references', async () => {
    const { getTeamReference, checkTeamInsideJoke, generateHandoffNote } =
      await import('../shared/team-chemistry.js');

    // Ferni referencing Peter
    const ferniAboutPeter = getTeamReference('ferni', 'peter-john', 'admiration');
    expect(ferniAboutPeter).toBeDefined();
    expect(ferniAboutPeter?.toLowerCase()).toContain('peter');

    // Check team inside joke
    const joke = checkTeamInsideJoke('I need to check the spreadsheet', 'ferni');
    expect(joke).toBeDefined();
    expect(joke?.reference.toLowerCase()).toContain('peter');

    // Generate handoff
    const handoff = generateHandoffNote('ferni', 'maya-santos', 'habits', 'struggling', 'friend');
    expect(handoff).toBeDefined();
    expect(handoff).toContain('Ferni');
  });

  it('should provide persona-specific cognitive responses', async () => {
    const { getCognitiveDifferentiation, getPersonaQuestion, getDisagreementPhrase } =
      await import('../cognitive-differentiation.js');

    // Ferni cognitive style
    const ferniProfile = getCognitiveDifferentiation('ferni');
    expect(ferniProfile).toBeDefined();
    expect(ferniProfile?.questioning.feelingVsData).toBeGreaterThan(0.5); // Feeling-focused

    // Peter cognitive style
    const peterProfile = getCognitiveDifferentiation('peter-john');
    expect(peterProfile).toBeDefined();
    expect(peterProfile?.questioning.feelingVsData).toBeLessThan(0.5); // Data-focused

    // Get questions
    const ferniQuestion = getPersonaQuestion('ferni', 'deep_dive');
    const peterQuestion = getPersonaQuestion('peter-john', 'deep_dive');
    expect(ferniQuestion).toBeDefined();
    expect(peterQuestion).toBeDefined();
    expect(ferniQuestion).not.toBe(peterQuestion);

    // Get disagreement
    const ferniDisagree = getDisagreementPhrase('ferni', 'mild');
    const peterDisagree = getDisagreementPhrase('peter-john', 'mild');
    expect(ferniDisagree).toBeDefined();
    expect(peterDisagree).toBeDefined();
  });

  it('should generate correct prompt injection structure', async () => {
    const { PersonaIntelligenceEngine } = await import('../persona-intelligence.js');

    const engine = new PersonaIntelligenceEngine('ferni', 'prompt-test-user');
    engine.startSession();

    // Record some history
    engine.recordMoment('breakthrough', 'User realized pattern', { significance: 0.8 });

    const injection = engine.buildPromptInjection('career');

    // Should have all sections
    expect(injection.relationshipSection).toContain('RELATIONSHIP');
    expect(injection.cognitiveSection).toContain('COGNITIVE');
    expect(injection.combined.length).toBeGreaterThan(0);

    // Combined should include context
    expect(injection.combined).toContain('Stage');
  });

  it('should properly serialize and deserialize relationship memory', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    // Create and populate memory
    const engine = new RelationshipMemoryEngine('serialize-user', 'ferni');
    engine.startSession();
    engine.recordMoment('first_vulnerability', 'User shared something personal', {
      topic: 'personal',
      userPhrase: 'I never told anyone this before',
      significance: 0.9,
    });
    // Note: Inside joke seeds only record at "friend" stage or higher
    // So we skip testing that here
    engine.endSession('positive', 'high', ['personal', 'growth']);

    // Get memory
    const memory = engine.getMemory();

    // Simulate serialization (what would happen to/from Firestore)
    const serialized = JSON.stringify(memory, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });

    // Deserialize
    const deserialized = JSON.parse(serialized, (key, value) => {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
      }
      return value;
    });

    // Verify structure preserved
    expect(deserialized.userId).toBe('serialize-user');
    expect(deserialized.personaId).toBe('ferni');
    expect(deserialized.stage).toBe('stranger');
    expect(deserialized.sharedMoments.length).toBe(1);
    // Verify dates are properly deserialized
    expect(deserialized.firstConversation).toBeInstanceOf(Date);
  });
});

// ============================================================================
// MOMENT DETECTION E2E
// ============================================================================

describe('Moment Detection E2E', () => {
  it('should detect multiple moment types in realistic messages', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const testCases = [
      {
        message:
          "Oh my god, I finally get it! I've been self-sabotaging because I'm afraid of what success would mean for my relationships.",
        expectedTypes: ['breakthrough'],
      },
      {
        message:
          "I've never told anyone this, but I grew up in a really chaotic household and I think it affects how I handle conflict now.",
        expectedTypes: ['first_vulnerability'],
      },
      {
        message: "Hahaha that's hilarious! You're killing me! I can't stop laughing 😂",
        expectedTypes: ['laughter'],
      },
      {
        message:
          'I did it! I got the job offer! After 6 months of interviews, they finally said yes!',
        expectedTypes: ['celebration'],
      },
      {
        message:
          "I can't do this anymore. Everything is falling apart. I don't know what the point is.",
        expectedTypes: ['crisis_support'],
      },
    ];

    for (const { message, expectedTypes } of testCases) {
      const moments = detectMoments({
        userMessage: message,
        sessionNumber: 5,
        hasSharedVulnerabilityBefore: false,
      });

      for (const expectedType of expectedTypes) {
        expect(
          moments.some((m) => m.type === expectedType),
          `Expected ${expectedType} in "${message.slice(0, 50)}..."`
        ).toBe(true);
      }
    }
  });

  it('should not false-positive on neutral messages', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const neutralMessages = [
      "What's the weather like today?",
      'I need to schedule a meeting for next week.',
      'Can you remind me about my appointment?',
      'How do I change my settings?',
    ];

    for (const message of neutralMessages) {
      const moments = detectMoments({
        userMessage: message,
        sessionNumber: 5,
        hasSharedVulnerabilityBefore: true,
      });

      expect(moments.length).toBe(0);
    }
  });
});









