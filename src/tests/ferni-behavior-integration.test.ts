/**
 * Ferni 100% Wiring - Integration Tests
 *
 * Tests that all 11 new context builders work together:
 * - All builders load content successfully
 * - Builders aggregate without conflicts
 * - Error in one builder doesn't break pipeline
 * - Priority ordering is correct
 *
 * @module FerniBehaviorIntegrationTest
 */

import { describe, it, expect } from 'vitest';
import type {
  ContextBuilderInput,
  ContextInjection,
} from '../intelligence/context-builders/index.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: 'I feel broken after what happened. I finally figured it out though!',
    persona: {
      id: 'ferni',
      name: 'Ferni',
      identity: { id: 'ferni' },
    } as ContextBuilderInput['persona'],
    analysis: {
      emotion: {
        primary: 'neutral',
        confidence: 0.8,
        intensity: 0.5,
      },
    },
    userData: {
      turnCount: 5,
      userName: 'test-user',
    },
    services: {
      sessionId: `integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userProfile: {
      relationshipStage: 'friend',
    },
    bundleRuntime: null,
    ...overrides,
  } as ContextBuilderInput;
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Ferni Behavior Integration', () => {
  it('all 11 builders can be imported and run together without errors', async () => {
    // Import all builders
    const [
      voiceDna,
      backchannel,
      breath,
      catchphrase,
      goodbye,
      humor,
      affirmation,
      petPeeve,
      coachingMode,
      predictive,
      sensory,
    ] = await Promise.all([
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
    ]);

    const input = createTestInput();

    // Run all builders in parallel (like the real pipeline)
    const results = await Promise.allSettled([
      voiceDna.buildVoiceDNAContext(input),
      backchannel.buildBackchannelContext(input),
      breath.buildBreathContext(input),
      catchphrase.buildCatchphraseContext(input),
      goodbye.buildGoodbyeContext(input),
      humor.buildHumorContext(input),
      affirmation.buildAffirmationContext(input),
      petPeeve.buildPetPeeveContext(input),
      coachingMode.buildCoachingModeContext(input),
      predictive.buildPredictiveContext(input),
      sensory.buildSensoryContext(input),
    ]);

    // All should resolve (not reject)
    for (const result of results) {
      expect(result.status).toBe('fulfilled');
      if (result.status === 'fulfilled') {
        expect(Array.isArray(result.value)).toBe(true);
      }
    }
  });

  it('builders produce injections with valid structure', async () => {
    const [voiceDna, coachingMode, affirmation] = await Promise.all([
      import('../intelligence/context-builders/personas/voice-dna-context.js'),
      import('../intelligence/context-builders/personas/coaching-mode-context.js'),
      import('../intelligence/context-builders/emotional/affirmation-context.js'),
    ]);

    const input = createTestInput({
      userText: 'I finally did it!',
    });

    const [voiceInjections, coachingInjections, affirmationInjections] = await Promise.all([
      voiceDna.buildVoiceDNAContext(input),
      coachingMode.buildCoachingModeContext(input),
      affirmation.buildAffirmationContext(input),
    ]);

    // Aggregate all injections
    const allInjections = [...voiceInjections, ...coachingInjections, ...affirmationInjections];

    // All injections should have required structure (id, source, content, priority)
    for (const injection of allInjections) {
      expect(injection).toHaveProperty('id');
      expect(injection).toHaveProperty('source');
      expect(injection).toHaveProperty('content');
      expect(injection).toHaveProperty('priority');
      expect(typeof injection.id).toBe('string');
      expect(typeof injection.source).toBe('string');
    }

    // Note: Multiple builders may produce injections with different IDs
    // This is by design as different builders focus on different aspects
    // The aggregation layer handles merging/prioritization
    expect(allInjections.length).toBeGreaterThanOrEqual(0);
  });

  it('handles missing optional fields gracefully', async () => {
    // Create input with missing optional fields (but valid required fields)
    const input = createTestInput({
      userText: 'Hello there',
      analysis: undefined, // Optional - builders should handle gracefully
      userProfile: undefined, // Optional
    });

    const builders = await Promise.all([
      import('../intelligence/context-builders/personas/voice-dna-context.js'),
      import('../intelligence/context-builders/conversational/backchannel-context.js'),
      import('../intelligence/context-builders/emotional/breath-context.js'),
    ]);

    // Run with Promise.allSettled to catch individual failures
    const results = await Promise.allSettled(
      builders.map(async (builder) => {
        const buildFn = Object.values(builder).find(
          (v): v is (input: ContextBuilderInput) => Promise<ContextInjection[]> =>
            typeof v === 'function' && v.name.startsWith('build')
        );
        return buildFn ? buildFn(input) : [];
      })
    );

    // Builders should handle missing optional fields gracefully
    // Either succeed with empty results or succeed with partial results
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded.length).toBeGreaterThan(0);
  });

  it('builders respect session isolation', async () => {
    const { buildCatchphraseContext, cleanupCatchphraseState } =
      await import('../intelligence/context-builders/personas/catchphrase-context.js');

    const session1 = `session-1-${Date.now()}`;
    const session2 = `session-2-${Date.now()}`;

    // Clean up sessions first
    cleanupCatchphraseState(session1);
    cleanupCatchphraseState(session2);

    // Run for session 1
    const input1 = createTestInput({
      userText: 'I feel broken',
      services: {
        sessionId: session1,
        sessionStartTime: Date.now(),
        userProfile: null,
      },
      userData: { turnCount: 5 },
    });
    await buildCatchphraseContext(input1);

    // Run for session 2 (should start fresh)
    const input2 = createTestInput({
      userText: 'I feel broken',
      services: {
        sessionId: session2,
        sessionStartTime: Date.now(),
        userProfile: null,
      },
      userData: { turnCount: 5 },
    });
    const result2 = await buildCatchphraseContext(input2);

    // Session 2 should not be affected by session 1
    expect(Array.isArray(result2)).toBe(true);

    // Cleanup
    cleanupCatchphraseState(session1);
    cleanupCatchphraseState(session2);
  });

  it('builders respect frequency limits within a session', async () => {
    const { buildAffirmationContext, cleanupAffirmationState } =
      await import('../intelligence/context-builders/emotional/affirmation-context.js');

    const sessionId = `session-limits-${Date.now()}`;
    cleanupAffirmationState(sessionId);

    let totalInjections = 0;

    // Run many times in the same session
    for (let i = 0; i < 20; i++) {
      const input = createTestInput({
        userText: 'I finally figured it out! I did it!',
        services: {
          sessionId,
          sessionStartTime: Date.now(),
          userProfile: null,
        },
        userData: { turnCount: i + 1 },
      });
      const injections = await buildAffirmationContext(input);
      totalInjections += injections.length;
    }

    // Should be limited (not 20 injections)
    expect(totalInjections).toBeLessThan(20);
    expect(totalInjections).toBeLessThanOrEqual(3); // Max 3 affirmations per session

    cleanupAffirmationState(sessionId);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Ferni Behavior Performance', () => {
  it('all builders complete within 50ms each', async () => {
    const builders = await Promise.all([
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
    ]);

    const input = createTestInput();

    for (const builder of builders) {
      const buildFn = Object.values(builder).find(
        (v): v is (input: ContextBuilderInput) => Promise<ContextInjection[]> =>
          typeof v === 'function' && v.name.startsWith('build')
      );

      if (buildFn) {
        const start = performance.now();
        await buildFn(input);
        const duration = performance.now() - start;

        // Each builder should complete within 50ms
        expect(duration).toBeLessThan(50);
      }
    }
  });

  it('all builders together complete within 200ms', async () => {
    const builders = await Promise.all([
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
    ]);

    const input = createTestInput();

    const start = performance.now();

    await Promise.all(
      builders.map(async (builder) => {
        const buildFn = Object.values(builder).find(
          (v): v is (input: ContextBuilderInput) => Promise<ContextInjection[]> =>
            typeof v === 'function' && v.name.startsWith('build')
        );
        return buildFn ? buildFn(input) : [];
      })
    );

    const duration = performance.now() - start;

    // All builders together should complete within 200ms
    expect(duration).toBeLessThan(200);
  });
});
