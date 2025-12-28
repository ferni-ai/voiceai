/**
 * Superhuman Capabilities - Synthetic Testing
 *
 * LLM-powered testing for all "Better Than Human" detection systems:
 * - Commitment Detection (promises, intentions, decisions)
 * - Values Alignment (detecting core values)
 * - Crisis Detection (emotional first aid triggers)
 * - Predictive Coaching (anticipating struggles)
 *
 * @module tests/superhuman/synthetic-superhuman.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ============================================================================
// IMPORTS (lazy to allow standalone running)
// ============================================================================

let detectCommitment: typeof import('../../services/superhuman/commitment-keeper.js').detectCommitment;
let detectValue: typeof import('../../services/superhuman/values-alignment.js').detectValue;
let detectCrisis: typeof import('../../services/superhuman/emotional-first-aid.js').detectCrisis;

beforeAll(async () => {
  const [commitmentModule, valuesModule, crisisModule] = await Promise.all([
    import('../../services/superhuman/commitment-keeper.js'),
    import('../../services/superhuman/values-alignment.js'),
    import('../../services/superhuman/emotional-first-aid.js'),
  ]);

  detectCommitment = commitmentModule.detectCommitment;
  detectValue = valuesModule.detectValue;
  detectCrisis = crisisModule.detectCrisis;
});

// ============================================================================
// COMMITMENT DETECTION TESTS
// ============================================================================

describe('Commitment Detection - Better Than Human', () => {
  describe('Seed Scenarios - Intentions', () => {
    const intentionScenarios = [
      { utterance: "I'm going to start exercising every day", expectedType: 'intention' },
      { utterance: "I'll call my mom tomorrow", expectedType: 'intention' },
      { utterance: 'I need to finish that report by Friday', expectedType: 'intention' },
      { utterance: 'I have to stop procrastinating', expectedType: 'intention' },
      { utterance: "I've got to get my finances in order", expectedType: 'intention' },
      { utterance: 'I want to learn Spanish this year', expectedType: 'intention' },
    ];

    intentionScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
        expect(result.confidence).toBeGreaterThan(0.4);
      });
    });
  });

  describe('Seed Scenarios - Promises', () => {
    const promiseScenarios = [
      { utterance: 'I promise I will be there for you', expectedType: 'promise' },
      { utterance: 'I swear I will never do that again', expectedType: 'promise' },
      { utterance: 'I commit to making this work', expectedType: 'promise' },
    ];

    promiseScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
        expect(result.confidence).toBeGreaterThan(0.8);
      });
    });
  });

  describe('Seed Scenarios - Goals', () => {
    const goalScenarios = [
      { utterance: 'My goal is to run a marathon this year', expectedType: 'goal' },
      { utterance: "I'm working on being more patient", expectedType: 'goal' },
      { utterance: "I'm trying to eat healthier", expectedType: 'experiment' },
    ];

    goalScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
      });
    });
  });

  describe('Seed Scenarios - Boundaries', () => {
    const boundaryScenarios = [
      { utterance: 'I need to stop letting people walk all over me', expectedType: 'boundary' },
      { utterance: "I'm done with toxic relationships", expectedType: 'boundary' },
      { utterance: 'No more late nights at work', expectedType: 'boundary' },
    ];

    boundaryScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
      });
    });
  });

  describe('Seed Scenarios - Decisions', () => {
    const decisionScenarios = [
      { utterance: "I've decided to quit my job", expectedType: 'decision' },
      { utterance: "I'm going to start my own business", expectedType: 'decision' },
      { utterance: "That's it, I'm leaving this city", expectedType: 'decision' },
    ];

    decisionScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
      });
    });
  });

  describe('Seed Scenarios - Conversations', () => {
    const conversationScenarios = [
      { utterance: 'I need to talk to my boss about a raise', expectedType: 'conversation' },
      { utterance: "I'm going to tell my partner how I really feel", expectedType: 'conversation' },
      {
        utterance: 'I have to have that difficult conversation with my mom',
        expectedType: 'conversation',
      },
    ];

    conversationScenarios.forEach(({ utterance, expectedType }) => {
      it(`should detect '${expectedType}' from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(true);
        expect(result.commitment?.type).toBe(expectedType);
      });
    });
  });

  describe('Edge Cases - Should NOT Detect', () => {
    const nonCommitmentScenarios = [
      'The weather is nice today',
      'I had a great lunch yesterday',
      'My friend went to the movies',
      "That's an interesting perspective",
    ];

    nonCommitmentScenarios.forEach((utterance) => {
      it(`should NOT detect commitment in: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectCommitment(utterance, 'test-user');
        expect(result.detected).toBe(false);
      });
    });
  });
});

// ============================================================================
// VALUES ALIGNMENT TESTS
// ============================================================================

describe('Values Alignment Detection - Better Than Human', () => {
  describe('Seed Scenarios - Family Values', () => {
    const familyScenarios = [
      { utterance: 'Family is everything to me', expectedCategory: 'family' },
      { utterance: 'My kids are the most important thing in my life', expectedCategory: 'family' },
      { utterance: 'Nothing matters more than my family', expectedCategory: 'family' },
    ];

    familyScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });

  describe('Seed Scenarios - Freedom Values', () => {
    const freedomScenarios = [
      { utterance: 'I need my freedom more than anything', expectedCategory: 'freedom' },
      { utterance: "I can't stand being told what to do", expectedCategory: 'freedom' },
      { utterance: 'My independence is sacred to me', expectedCategory: 'freedom' },
    ];

    freedomScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });

  describe('Seed Scenarios - Growth Values', () => {
    const growthScenarios = [
      { utterance: 'I want to grow and become a better person', expectedCategory: 'growth' },
      { utterance: 'Growth is everything to me', expectedCategory: 'growth' },
      { utterance: "I'm always learning something new", expectedCategory: 'growth' },
    ];

    growthScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });

  describe('Seed Scenarios - Authenticity Values', () => {
    const authenticityScenarios = [
      { utterance: 'I need to be authentic and true to myself', expectedCategory: 'authenticity' },
      { utterance: 'Honesty matters most to me', expectedCategory: 'authenticity' },
      { utterance: "I won't pretend to be someone I'm not", expectedCategory: 'authenticity' },
    ];

    authenticityScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });

  describe('Seed Scenarios - Achievement Values', () => {
    const achievementScenarios = [
      {
        utterance: 'I want to succeed and accomplish great things',
        expectedCategory: 'achievement',
      },
      { utterance: 'Success is what drives me', expectedCategory: 'achievement' },
      { utterance: 'I need to prove myself', expectedCategory: 'achievement' },
    ];

    achievementScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });

  describe('Seed Scenarios - Service Values', () => {
    const serviceScenarios = [
      { utterance: 'I want to help others and give back', expectedCategory: 'service' },
      { utterance: 'Making a difference is what matters', expectedCategory: 'service' },
      { utterance: 'I need to contribute to something bigger', expectedCategory: 'service' },
    ];

    serviceScenarios.forEach(({ utterance, expectedCategory }) => {
      it(`should detect '${expectedCategory}' value from: "${utterance.slice(0, 50)}..."`, () => {
        const result = detectValue(utterance);
        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      });
    });
  });
});

// ============================================================================
// CRISIS DETECTION TESTS
// ============================================================================

describe('Crisis Detection - Better Than Human', () => {
  describe('Seed Scenarios - Safety Level (Highest Priority)', () => {
    const safetyScenarios = [
      { utterance: "I don't want to be here anymore", expectedLevel: 'safety' },
      { utterance: "What's the point of living", expectedLevel: 'safety' },
    ];

    safetyScenarios.forEach(({ utterance, expectedLevel }) => {
      it(`should detect '${expectedLevel}' level from: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).not.toBeNull();
        expect(result?.severity).toBe(expectedLevel);
        expect(result?.confidence).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  describe('Seed Scenarios - Containing Level', () => {
    const containingScenarios = [
      { utterance: "I can't do this anymore, everything is too much", expectedLevel: 'containing' },
      { utterance: "I'm completely falling apart", expectedLevel: 'containing' },
      { utterance: "I'm totally overwhelmed and lost", expectedLevel: 'containing' },
    ];

    containingScenarios.forEach(({ utterance, expectedLevel }) => {
      it(`should detect '${expectedLevel}' level from: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).not.toBeNull();
        expect(result?.severity).toBe(expectedLevel);
      });
    });
  });

  describe('Seed Scenarios - Stabilizing Level', () => {
    const stabilizingScenarios = [
      { utterance: "I'm so sad I can't function", expectedLevel: 'stabilizing' },
      { utterance: "I can't stop crying", expectedLevel: 'stabilizing' },
      { utterance: 'My chest is so tight and it hurts', expectedLevel: 'stabilizing' },
    ];

    stabilizingScenarios.forEach(({ utterance, expectedLevel }) => {
      it(`should detect '${expectedLevel}' level from: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).not.toBeNull();
        expect(result?.severity).toBe(expectedLevel);
      });
    });
  });

  describe('Seed Scenarios - Calming Level', () => {
    const calmingScenarios = [
      { utterance: "I'm having a panic attack", expectedLevel: 'calming' },
      { utterance: "I can't breathe, I can't calm down", expectedLevel: 'calming' },
      { utterance: "My thoughts won't stop racing", expectedLevel: 'calming' },
      { utterance: "I'm freaking out right now", expectedLevel: 'calming' },
    ];

    calmingScenarios.forEach(({ utterance, expectedLevel }) => {
      it(`should detect '${expectedLevel}' level from: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).not.toBeNull();
        expect(result?.severity).toBe(expectedLevel);
      });
    });
  });

  describe('Seed Scenarios - Grounding Level', () => {
    const groundingScenarios = [
      { utterance: 'I feel disconnected from everything', expectedLevel: 'grounding' },
      { utterance: 'Nothing feels real right now', expectedLevel: 'grounding' },
    ];

    groundingScenarios.forEach(({ utterance, expectedLevel }) => {
      it(`should detect '${expectedLevel}' level from: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).not.toBeNull();
        expect(result?.severity).toBe(expectedLevel);
      });
    });
  });

  describe('Edge Cases - Should NOT Detect Crisis', () => {
    const nonCrisisScenarios = [
      'I had a stressful day at work',
      "I'm a bit tired today",
      'The traffic was really bad',
      'I wish I had more time',
    ];

    nonCrisisScenarios.forEach((utterance) => {
      it(`should NOT detect crisis in: "${utterance.slice(0, 40)}..."`, () => {
        const result = detectCrisis(utterance);
        expect(result).toBeNull();
      });
    });
  });
});
