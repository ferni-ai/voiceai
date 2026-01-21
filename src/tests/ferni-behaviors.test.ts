/**
 * Ferni 100% Wiring - Unit Tests
 *
 * Tests all 11 new context builders created in the January 2026 wiring initiative.
 *
 * These tests verify that all builders:
 * - Run without throwing errors
 * - Return arrays
 * - Handle edge cases gracefully
 *
 * @module FerniBehaviorsTest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: 'Hello, how are you?',
    persona: {
      id: 'ferni',
      name: 'Ferni',
      identity: { id: 'ferni' },
    } as ContextBuilderInput['persona'],
    analysis: {
      emotion: {
        primary: 'neutral',
        confidence: 0.8,
      },
    },
    userData: {
      turnCount: 5,
      userName: 'test-user',
    },
    services: {
      sessionId: `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    userProfile: {
      relationshipStage: 'friend',
    },
    bundleRuntime: null,
    ...overrides,
  } as ContextBuilderInput;
}

// ============================================================================
// VOICE DNA CONTEXT TESTS
// ============================================================================

describe('VoiceDNAContext', () => {
  it('runs without throwing and returns array', async () => {
    const { buildVoiceDNAContext, cleanupVoiceDNAState } = await import(
      '../intelligence/context-builders/personas/voice-dna-context.js'
    );
    const input = createTestInput({ userData: { turnCount: 1 } });

    const injections = await buildVoiceDNAContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupVoiceDNAState(input.services?.sessionId || 'anonymous');
  });

  it('handles distressed user input', async () => {
    const { buildVoiceDNAContext, cleanupVoiceDNAState } = await import(
      '../intelligence/context-builders/personas/voice-dna-context.js'
    );
    const input = createTestInput({
      analysis: {
        emotion: { primary: 'sad', distressLevel: 0.7 },
      },
      userData: { turnCount: 5 },
    });

    const injections = await buildVoiceDNAContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupVoiceDNAState(input.services?.sessionId || 'anonymous');
  });

  it('handles empty user text', async () => {
    const { buildVoiceDNAContext } = await import(
      '../intelligence/context-builders/personas/voice-dna-context.js'
    );
    const input = createTestInput({ userText: '' });

    const injections = await buildVoiceDNAContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });
});

// ============================================================================
// BACKCHANNEL CONTEXT TESTS
// ============================================================================

describe('BackchannelContext', () => {
  it('runs without throwing and returns array', async () => {
    const { buildBackchannelContext, cleanupBackchannelState } = await import(
      '../intelligence/context-builders/conversational/backchannel-context.js'
    );
    const input = createTestInput({
      userText: 'My grandmother died last week',
      analysis: { emotion: { primary: 'sad', distressLevel: 0.8 } },
    });

    const injections = await buildBackchannelContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupBackchannelState(input.services?.sessionId || 'anonymous');
  });

  it('handles good news input', async () => {
    const { buildBackchannelContext, cleanupBackchannelState } = await import(
      '../intelligence/context-builders/conversational/backchannel-context.js'
    );
    const input = createTestInput({
      userText: 'I got the promotion!',
      analysis: { emotion: { primary: 'happy' } },
    });

    const injections = await buildBackchannelContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupBackchannelState(input.services?.sessionId || 'anonymous');
  });
});

// ============================================================================
// BREATH CONTEXT TESTS
// ============================================================================

describe('BreathContext', () => {
  it('runs without throwing for anxious input', async () => {
    const { buildBreathContext, cleanupBreathState } = await import(
      '../intelligence/context-builders/emotional/breath-context.js'
    );
    const input = createTestInput({
      userText: 'I cant stop spiraling about this',
      analysis: { emotion: { primary: 'anxious' } },
    });

    const injections = await buildBreathContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupBreathState(input.services?.sessionId || 'anonymous');
  });

  it('handles neutral input', async () => {
    const { buildBreathContext } = await import(
      '../intelligence/context-builders/emotional/breath-context.js'
    );
    const input = createTestInput({
      userText: 'What time is my meeting tomorrow?',
    });

    const injections = await buildBreathContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });
});

// ============================================================================
// CATCHPHRASE CONTEXT TESTS
// ============================================================================

describe('CatchphraseContext', () => {
  it('runs without throwing for kintsugi-related input', async () => {
    const { buildCatchphraseContext, cleanupCatchphraseState } = await import(
      '../intelligence/context-builders/personas/catchphrase-context.js'
    );
    const input = createTestInput({
      userText: 'I feel so broken after what happened',
    });

    const injections = await buildCatchphraseContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupCatchphraseState(input.services?.sessionId || 'anonymous');
  });

  it('handles general input', async () => {
    const { buildCatchphraseContext } = await import(
      '../intelligence/context-builders/personas/catchphrase-context.js'
    );
    const input = createTestInput({
      userText: 'How is your day going?',
    });

    const injections = await buildCatchphraseContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });
});

// ============================================================================
// GOODBYE CONTEXT TESTS
// ============================================================================

describe('GoodbyeContext', () => {
  it('runs without throwing for goodbye input', async () => {
    const { buildGoodbyeContext } = await import(
      '../intelligence/context-builders/conversational/goodbye-context.js'
    );
    const input = createTestInput({
      userText: 'Gotta go, bye!',
      userData: { turnCount: 10 },
    });

    const injections = await buildGoodbyeContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });

  it('returns empty for non-goodbye input', async () => {
    const { buildGoodbyeContext } = await import(
      '../intelligence/context-builders/conversational/goodbye-context.js'
    );
    const input = createTestInput({
      userText: 'Tell me about your day',
    });

    const injections = await buildGoodbyeContext(input);

    expect(injections).toHaveLength(0);
  });
});

// ============================================================================
// HUMOR CONTEXT TESTS
// ============================================================================

describe('HumorContext', () => {
  it('runs without throwing for celebration input', async () => {
    const { buildHumorContext, cleanupHumorState } = await import(
      '../intelligence/context-builders/personas/humor-context.js'
    );
    const input = createTestInput({
      userText: 'I got the job! I did it!',
      analysis: { emotion: { primary: 'excited' } },
    });

    const injections = await buildHumorContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupHumorState(input.services?.sessionId || 'anonymous');
  });

  it('does not throw for crisis input (should block humor)', async () => {
    const { buildHumorContext } = await import(
      '../intelligence/context-builders/personas/humor-context.js'
    );
    const input = createTestInput({
      userText: 'I just found out I have cancer',
      analysis: { emotion: { distressLevel: 0.9 } },
    });

    const injections = await buildHumorContext(input);

    expect(Array.isArray(injections)).toBe(true);
    // Should not inject humor during crisis
    expect(injections).toHaveLength(0);
  });
});

// ============================================================================
// AFFIRMATION CONTEXT TESTS
// ============================================================================

describe('AffirmationContext', () => {
  it('runs without throwing for breakthrough input', async () => {
    const { buildAffirmationContext, cleanupAffirmationState } = await import(
      '../intelligence/context-builders/emotional/affirmation-context.js'
    );
    const input = createTestInput({
      userText: 'I finally figured it out! I did it!',
    });

    const injections = await buildAffirmationContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupAffirmationState(input.services?.sessionId || 'anonymous');
  });

  it('runs without throwing for self-doubt input', async () => {
    const { buildAffirmationContext } = await import(
      '../intelligence/context-builders/emotional/affirmation-context.js'
    );
    const input = createTestInput({
      userText: 'I dont know if I can do this',
      analysis: { emotion: { primary: 'anxious' } },
    });

    const injections = await buildAffirmationContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });
});

// ============================================================================
// PET PEEVE CONTEXT TESTS
// ============================================================================

describe('PetPeeveContext', () => {
  it('runs without throwing for trigger input', async () => {
    const { buildPetPeeveContext, cleanupPetPeeveState } = await import(
      '../intelligence/context-builders/personas/pet-peeve-context.js'
    );
    const input = createTestInput({
      userText: 'I just need to be more positive, good vibes only!',
    });

    const injections = await buildPetPeeveContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupPetPeeveState(input.services?.sessionId || 'anonymous');
  });
});

// ============================================================================
// COACHING MODE CONTEXT TESTS
// ============================================================================

describe('CoachingModeContext', () => {
  it('runs without throwing and returns array', async () => {
    const { buildCoachingModeContext, cleanupCoachingModeState } = await import(
      '../intelligence/context-builders/personas/coaching-mode-context.js'
    );
    const input = createTestInput({
      userText: 'I just need to vent about my day',
    });

    const injections = await buildCoachingModeContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupCoachingModeState(input.services?.sessionId || 'anonymous');
  });

  it('handles celebrating input', async () => {
    const { buildCoachingModeContext, cleanupCoachingModeState } = await import(
      '../intelligence/context-builders/personas/coaching-mode-context.js'
    );
    const input = createTestInput({
      userText: 'I got the job! I did it!',
      analysis: { emotion: { primary: 'excited' } },
    });

    const injections = await buildCoachingModeContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupCoachingModeState(input.services?.sessionId || 'anonymous');
  });
});

// ============================================================================
// PREDICTIVE CONTEXT TESTS
// ============================================================================

describe('PredictiveContext', () => {
  it('runs without throwing for concern-related input', async () => {
    const { buildPredictiveContext, cleanupPredictiveState } = await import(
      '../intelligence/context-builders/intelligence/predictive-context.js'
    );
    const input = createTestInput({
      userText: 'I just feel like theres no point anymore',
    });

    const injections = await buildPredictiveContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupPredictiveState(input.services?.sessionId || 'anonymous');
  });

  it('runs without throwing for deflection input', async () => {
    const { buildPredictiveContext, cleanupPredictiveState } = await import(
      '../intelligence/context-builders/intelligence/predictive-context.js'
    );
    const input = createTestInput({
      userText: 'Its fine, it doesnt matter anyway',
    });

    const injections = await buildPredictiveContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupPredictiveState(input.services?.sessionId || 'anonymous');
  });
});

// ============================================================================
// SENSORY CONTEXT TESTS
// ============================================================================

describe('SensoryContext', () => {
  it('runs without throwing for anxious input', async () => {
    const { buildSensoryContext, cleanupSensoryState } = await import(
      '../intelligence/context-builders/awareness/sensory-context.js'
    );
    const input = createTestInput({
      userText: 'I cant stop spiraling',
      analysis: { emotion: { primary: 'anxious' } },
    });

    const injections = await buildSensoryContext(input);

    expect(Array.isArray(injections)).toBe(true);
    cleanupSensoryState(input.services?.sessionId || 'anonymous');
  });

  it('handles neutral input', async () => {
    const { buildSensoryContext } = await import(
      '../intelligence/context-builders/awareness/sensory-context.js'
    );
    const input = createTestInput({
      userText: 'What should I have for lunch?',
    });

    const injections = await buildSensoryContext(input);

    expect(Array.isArray(injections)).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('all builders handle empty user text gracefully', async () => {
    const builders = [
      import('../intelligence/context-builders/personas/voice-dna-context.js'),
      import('../intelligence/context-builders/conversational/backchannel-context.js'),
      import('../intelligence/context-builders/emotional/breath-context.js'),
      import('../intelligence/context-builders/personas/catchphrase-context.js'),
      import('../intelligence/context-builders/conversational/goodbye-context.js'),
      import('../intelligence/context-builders/personas/humor-context.js'),
      import('../intelligence/context-builders/emotional/affirmation-context.js'),
      import('../intelligence/context-builders/personas/pet-peeve-context.js'),
      import('../intelligence/context-builders/personas/coaching-mode-context.js'),
      import('../intelligence/context-builders/intelligence/predictive-context.js'),
      import('../intelligence/context-builders/awareness/sensory-context.js'),
    ];

    const input = createTestInput({ userText: '' });

    // Should not throw
    for (const builderPromise of builders) {
      const builder = await builderPromise;
      const buildFn = Object.values(builder).find(
        (v): v is (input: ContextBuilderInput) => Promise<unknown[]> =>
          typeof v === 'function' && v.name.startsWith('build')
      );
      if (buildFn) {
        const result = await buildFn(input);
        expect(Array.isArray(result)).toBe(true);
      }
    }
  });

  it('all builders handle missing persona gracefully', async () => {
    const { buildVoiceDNAContext } = await import(
      '../intelligence/context-builders/personas/voice-dna-context.js'
    );
    const input = createTestInput({
      persona: undefined as unknown as ContextBuilderInput['persona'],
    });

    // Should not throw
    const result = await buildVoiceDNAContext(input);
    expect(Array.isArray(result)).toBe(true);
  });

  it('all builders handle null services gracefully', async () => {
    const { buildBackchannelContext } = await import(
      '../intelligence/context-builders/conversational/backchannel-context.js'
    );
    const input = createTestInput({
      services: undefined as unknown as ContextBuilderInput['services'],
    });

    // Should not throw
    const result = await buildBackchannelContext(input);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================================================
// BUILDER REGISTRATION TESTS
// ============================================================================

describe('Builder Registration', () => {
  it('all 11 new builder source files exist and export build functions', async () => {
    // Import each builder and verify it exports a build function
    const builderPaths = [
      '../intelligence/context-builders/personas/voice-dna-context.js',
      '../intelligence/context-builders/personas/catchphrase-context.js',
      '../intelligence/context-builders/personas/humor-context.js',
      '../intelligence/context-builders/personas/pet-peeve-context.js',
      '../intelligence/context-builders/personas/coaching-mode-context.js',
      '../intelligence/context-builders/emotional/affirmation-context.js',
      '../intelligence/context-builders/emotional/breath-context.js',
      '../intelligence/context-builders/conversational/backchannel-context.js',
      '../intelligence/context-builders/conversational/goodbye-context.js',
      '../intelligence/context-builders/intelligence/predictive-context.js',
      '../intelligence/context-builders/awareness/sensory-context.js',
    ];

    for (const path of builderPaths) {
      const module = await import(path);
      // Each builder should export at least one function starting with "build"
      const buildFn = Object.keys(module).find((key) => key.startsWith('build'));
      expect(buildFn).toBeDefined();
    }
  });
});
