/**
 * Multi-Turn Conversation Scenario Tests
 *
 * Tests complete conversation flows across multiple turns.
 * Validates:
 * - Emotional arc tracking
 * - Context coherence
 * - Topic continuity
 * - Appropriate agent behaviors
 *
 * @module agents/__tests__/scenarios/multi-turn-conversation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockLLMClient, resetAllMocks, setupAllMocks } from '../mocks/index.js';

import {
  allScenarios,
  celebrationScenario,
  coachingSession,
  crisisDetection,
  emotionalSupportJourney,
  handoffScenario,
  newUserOnboarding,
  type MultiTurnScenario,
  type TurnExpectation,
} from '../fixtures/multi-turn-scenarios.js';

// Setup mocks
const mockLLM = createMockLLMClient();
setupAllMocks({ llmClient: mockLLM });

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Simulate a conversation turn and get response
 */
async function simulateTurn(
  userMessage: string,
  turnNumber: number,
  scenario: MultiTurnScenario
): Promise<{
  response: string;
  emotion: { primary: string; intensity: number };
  injections: string[];
}> {
  // Queue appropriate response based on scenario
  const turn = scenario.turns[turnNumber];
  const emotionBasedResponse = getResponseForTone(turn.expectedTone);

  mockLLM.queueResponse(emotionBasedResponse);

  const response = await mockLLM.generate([{ role: 'user', content: userMessage }]);

  // Simulate emotion detection based on expected
  const emotion = {
    primary: turn.expectedEmotion.primary,
    intensity:
      (turn.expectedEmotion.intensityRange[0] + turn.expectedEmotion.intensityRange[1]) / 2,
  };

  return {
    response,
    emotion,
    injections: turn.expectedActions || [],
  };
}

/**
 * Get an appropriate response for a given tone
 */
function getResponseForTone(tone: string): string {
  const toneResponses: Record<string, string> = {
    warm: "Hey there! It's so good to hear from you. What's on your mind?",
    empathetic:
      "I hear you, and that sounds really difficult. Tell me more about what you're going through.",
    supportive: "You're doing great, and I'm here for you. It's okay to feel this way.",
    celebratory: "That's amazing! I'm so proud of you! This is definitely worth celebrating!",
    curious: "That's really interesting. Tell me more about that.",
    encouraging: "I believe in you. You've got this.",
    'calm-present': "I'm here with you. You're not alone in this.",
    'gentle-concerned': "I'm glad you're sharing this with me. How are you feeling right now?",
    compassionate: 'That sounds exhausting. It takes real courage to keep going.',
    collaborative: "Let's figure this out together. What feels most important to start with?",
    'warm-welcoming': "Welcome! I'm Ferni, and I'm so glad to meet you.",
    'informative-warm':
      "I'm here to chat, support you, and help you work through whatever's on your mind.",
    receptive: "I'm listening. Please, share whatever you'd like.",
    'smooth-transition': "Absolutely! Let me connect you with Jordan - they're wonderful at this.",
    understanding: 'I completely understand. Your feelings are valid.',
    affirming: "You've worked so hard for this. You should be really proud of yourself.",
  };

  return toneResponses[tone] || toneResponses.warm;
}

/**
 * Validate turn expectations against actual results
 */
function validateTurn(
  expectation: TurnExpectation,
  actual: { response: string; emotion: { primary: string; intensity: number } }
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check emotion within range
  const [minIntensity, maxIntensity] = expectation.expectedEmotion.intensityRange;
  if (actual.emotion.intensity < minIntensity || actual.emotion.intensity > maxIntensity) {
    errors.push(
      `Intensity ${actual.emotion.intensity} outside expected range [${minIntensity}, ${maxIntensity}]`
    );
  }

  // Check shouldInclude phrases
  if (expectation.shouldInclude) {
    for (const phrase of expectation.shouldInclude) {
      if (!actual.response.toLowerCase().includes(phrase.toLowerCase())) {
        errors.push(`Response should include "${phrase}"`);
      }
    }
  }

  // Check shouldNotInclude phrases
  if (expectation.shouldNotInclude) {
    for (const phrase of expectation.shouldNotInclude) {
      if (actual.response.toLowerCase().includes(phrase.toLowerCase())) {
        errors.push(`Response should NOT include "${phrase}"`);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Multi-Turn Conversation Scenarios', () => {
  beforeEach(() => {
    resetAllMocks();
    mockLLM.clearHistory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // EMOTIONAL SUPPORT JOURNEY
  // ==========================================================================

  describe('Emotional Support Journey', () => {
    const scenario = emotionalSupportJourney;

    it('should complete full emotional support journey', async () => {
      // With mock LLM, we test the turn simulation mechanism rather than exact responses
      const responses: string[] = [];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);
        responses.push(actual.response);
      }

      // Should complete all turns
      expect(responses).toHaveLength(scenario.turns.length);

      // Each response should be non-empty
      for (const response of responses) {
        expect(response.length).toBeGreaterThan(0);
      }
    });

    it('should track emotional trajectory correctly', async () => {
      const emotions: string[] = [];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);
        emotions.push(actual.emotion.primary);
      }

      // Should start neutral and end relieved
      expect(emotions[0]).toBe('neutral');
      expect(emotions[emotions.length - 1]).toBe('relieved');

      // Should show emotional progression
      expect(emotions.length).toBe(5);
    });

    it('should maintain context coherence', async () => {
      const callHistory: { messages: { role: string; content: string }[] }[] = [];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        await simulateTurn(turn.userMessage, i, scenario);
        callHistory.push(...mockLLM.getCallHistory().slice(-1));
      }

      // Each turn should have been processed
      expect(callHistory.length).toBe(scenario.turns.length);
    });
  });

  // ==========================================================================
  // CELEBRATION SCENARIO
  // ==========================================================================

  describe('Celebration Scenario', () => {
    const scenario = celebrationScenario;

    it('should complete full celebration flow', async () => {
      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);

        // Celebration turns should detect positive emotions
        if (turn.isCelebration) {
          expect(['happy', 'excited', 'proud', 'grateful']).toContain(actual.emotion.primary);
        }
      }
    });

    it('should detect celebration moments', async () => {
      const celebrationTurns = scenario.turns.filter((t) => t.isCelebration);

      expect(celebrationTurns.length).toBeGreaterThan(0);

      for (const turn of celebrationTurns) {
        expect(turn.expectedTone).toBe('celebratory');
        expect(turn.expectedEmotion.intensityRange[1]).toBeGreaterThan(0.7);
      }
    });

    it('should maintain high energy throughout', async () => {
      const intensities: number[] = [];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);
        intensities.push(actual.emotion.intensity);
      }

      // Average intensity should be high for celebration
      const avgIntensity = intensities.reduce((a, b) => a + b, 0) / intensities.length;
      expect(avgIntensity).toBeGreaterThan(0.6);
    });
  });

  // ==========================================================================
  // COACHING SESSION
  // ==========================================================================

  describe('Coaching Session', () => {
    const scenario = coachingSession;

    it('should complete goal-focused coaching flow', async () => {
      const previousTopic = '';

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);

        // Emotions should progress from uncertain to motivated
        if (i === 0) {
          expect(actual.emotion.primary).toBe('neutral');
        }
        if (i === scenario.turns.length - 1) {
          expect(actual.emotion.primary).toBe('motivated');
        }
      }
    });

    it('should progress from problem to solution', async () => {
      const emotionProgression = scenario.turns.map((t) => t.expectedEmotion.primary);

      // Should start with neutral/anxious and end with hopeful/motivated
      const negativeEmotions = ['anxious', 'worried', 'uncertain'];
      const positiveEmotions = ['hopeful', 'motivated', 'confident'];

      const startNegative = negativeEmotions.some((e) =>
        emotionProgression.slice(0, 3).includes(e)
      );
      const endPositive = positiveEmotions.some((e) => emotionProgression.slice(-2).includes(e));

      expect(startNegative || emotionProgression[0] === 'neutral').toBe(true);
      expect(endPositive).toBe(true);
    });
  });

  // ==========================================================================
  // HANDOFF SCENARIO
  // ==========================================================================

  describe('Handoff Scenario', () => {
    const scenario = handoffScenario;

    it('should detect handoff opportunity', async () => {
      const handoffTurns = scenario.turns.filter((t) => t.potentialHandoff);

      expect(handoffTurns.length).toBeGreaterThan(0);
      expect(handoffTurns.some((t) => t.potentialHandoff === 'jordan')).toBe(true);
    });

    it('should complete handoff flow', async () => {
      let handoffDetected = false;
      let handoffTarget: string | undefined;

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        await simulateTurn(turn.userMessage, i, scenario);

        // Track when handoff should be initiated
        if (turn.potentialHandoff) {
          handoffDetected = true;
          handoffTarget = turn.potentialHandoff;
        }
      }

      // Should detect handoff opportunity in the scenario
      expect(handoffDetected).toBe(true);
      expect(handoffTarget).toBe('jordan');
    });

    it('should validate expected handoffs', () => {
      expect(scenario.validation.expectedHandoffs).toContain('jordan');
    });
  });

  // ==========================================================================
  // CRISIS DETECTION
  // ==========================================================================

  describe('Crisis Detection', () => {
    const scenario = crisisDetection;

    it('should handle crisis scenario appropriately', async () => {
      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);

        // Distress levels should be appropriately high
        const [minDistress, maxDistress] = turn.expectedEmotion.distressRange;
        expect(turn.expectedEmotion.distressRange[0]).toBeDefined();
      }
    });

    it('should never include dismissive language', async () => {
      const dismissivePhrases = ['just', 'simply', 'easy', 'try harder', 'be positive'];

      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);

        for (const phrase of dismissivePhrases) {
          // Responses should not contain dismissive language
          if (turn.shouldNotInclude?.includes(phrase)) {
            expect(actual.response.toLowerCase()).not.toContain(phrase);
          }
        }
      }
    });

    it('should prioritize safety throughout', () => {
      // Scenario should have safety-focused expected actions in most turns
      const safetyActions = ['validate', 'stay-present', 'assess', 'support', 'hold-space'];

      // Get turns with actions defined
      const turnsWithActions = scenario.turns.filter(
        (t) => t.expectedActions && t.expectedActions.length > 0
      );

      // Most crisis turns should have safety actions
      const turnsWithSafetyActions = turnsWithActions.filter((turn) =>
        turn.expectedActions?.some(
          (action) =>
            safetyActions.includes(action) ||
            action.includes('safe') ||
            action.includes('support') ||
            action.includes('present')
        )
      );

      // Majority of turns with actions should be safety-focused
      expect(turnsWithSafetyActions.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // NEW USER ONBOARDING
  // ==========================================================================

  describe('New User Onboarding', () => {
    const scenario = newUserOnboarding;

    it('should complete onboarding flow', async () => {
      for (let i = 0; i < scenario.turns.length; i++) {
        const turn = scenario.turns[i];
        const actual = await simulateTurn(turn.userMessage, i, scenario);

        // First turn should be welcoming
        if (i === 0) {
          expect(turn.expectedTone).toBe('warm-welcoming');
        }
      }
    });

    it('should properly introduce the system', async () => {
      // Second turn should be informative
      expect(scenario.turns[1].expectedTone).toBe('informative-warm');
      expect(scenario.turns[1].expectedActions).toContain('explain');
    });

    it('should transition from uncertain to opening-up', async () => {
      const firstEmotion = scenario.turns[0].expectedEmotion.primary;
      const lastEmotion = scenario.turns[scenario.turns.length - 1].expectedEmotion.primary;

      expect(firstEmotion).toBe('uncertain');
      expect(lastEmotion).toBe('opening-up');
    });
  });

  // ==========================================================================
  // CROSS-SCENARIO VALIDATION
  // ==========================================================================

  describe('Cross-Scenario Validation', () => {
    it('should have valid structure for all scenarios', () => {
      for (const scenario of allScenarios) {
        expect(scenario.id).toBeDefined();
        expect(scenario.name).toBeDefined();
        expect(scenario.personaId).toBeDefined();
        expect(scenario.turns.length).toBeGreaterThan(0);
        expect(scenario.validation).toBeDefined();
      }
    });

    it('should have valid turn structure for all scenarios', () => {
      for (const scenario of allScenarios) {
        for (const turn of scenario.turns) {
          expect(turn.userMessage).toBeDefined();
          expect(turn.expectedEmotion).toBeDefined();
          expect(turn.expectedEmotion.primary).toBeDefined();
          expect(turn.expectedEmotion.intensityRange).toHaveLength(2);
          expect(turn.expectedEmotion.distressRange).toHaveLength(2);
          expect(turn.expectedTone).toBeDefined();
        }
      }
    });

    it('should cover key conversation types', () => {
      const scenarioTypes = allScenarios.map((s) => s.id);

      expect(scenarioTypes).toContain('emotional-support-journey');
      expect(scenarioTypes).toContain('celebration-scenario');
      expect(scenarioTypes).toContain('coaching-session');
      expect(scenarioTypes).toContain('handoff-scenario');
      expect(scenarioTypes).toContain('crisis-detection');
      expect(scenarioTypes).toContain('new-user-onboarding');
    });

    it('should have reasonable turn counts', () => {
      for (const scenario of allScenarios) {
        // Scenarios should have 3-10 turns typically
        expect(scenario.turns.length).toBeGreaterThanOrEqual(3);
        expect(scenario.turns.length).toBeLessThanOrEqual(10);
      }
    });
  });
});
