/**
 * Cognitive Style Context Builder
 *
 * > "Each persona should feel distinctly different, not just in personality but in HOW they think."
 *
 * Core Principle #4: Authentic Personality
 * "Express unique perspectives that feel genuine, not performed."
 *
 * This context builder injects cognitive differentiation into LLM prompts:
 * - Questioning style (why vs how, feelings vs data)
 * - Silence interpretation
 * - Disagreement approach
 * - Insight framing
 * - Response pacing
 *
 * @module intelligence/context-builders/cognitive/cognitive-style
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createStandardInjection,
  registerContextBuilder,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getCognitiveEngineResult,
  getCognitiveProfile,
} from '../../cognitive/engine.js';
import type { PersonaId } from '../../../personas/types.js';

const log = createLogger({ module: 'CognitiveStyleBuilder' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * How often to inject full cognitive context (vs lightweight hints)
 * Too frequent = bloated context, too rare = inconsistent behavior
 */
const FULL_CONTEXT_PROBABILITY = 0.6; // 60% of turns

/**
 * Priority for cognitive context
 * Should run after persona identity but before final output shaping
 */
const COGNITIVE_PRIORITY = 65;

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Build lightweight cognitive hints for quick reference
 */
function buildLightweightHints(personaId: PersonaId): string | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const hints: string[] = [];
  hints.push('[🧠 COGNITIVE QUICK REFERENCE]');

  // Questioning
  if (profile.questioning.whyVsHow > 0.6) {
    hints.push('• Ask "why" before "how"');
  } else if (profile.questioning.whyVsHow < 0.4) {
    hints.push('• Focus on practical "how"');
  }

  // Silence
  hints.push(`• Silence = ${profile.silence.primaryInterpretation}`);

  // Disagreement
  if (profile.disagreement.disagreementFrequency > 0.3) {
    hints.push(`• Disagree via: ${profile.disagreement.primaryStyle}`);
  }

  // Insight
  hints.push(`• Frame insights as: ${profile.insight.primaryFraming}`);

  return hints.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build cognitive style context for the current turn
 */
async function buildCognitiveStyleContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const personaId = (input.persona?.id || 'ferni') as PersonaId;
  const injections: ContextInjection[] = [];

  try {
    // Determine conversation state from input
    const conversationState = {
      isEmotional: (input.analysis?.emotion?.intensity || 0) > 0.6,
      isAnalytical: input.analysis?.topics?.detected?.some((t) =>
        ['research', 'data', 'analysis', 'numbers'].includes(t.toLowerCase())
      ) || false,
      isActionable: input.analysis?.topics?.detected?.some((t) =>
        ['plan', 'goal', 'action', 'task', 'todo'].includes(t.toLowerCase())
      ) || false,
      hasSilence: false, // Would need to detect from session state
      hasDisagreement: false, // Would need to detect from conversation
    };

    // Determine user context
    const userContext = {
      emotionalIntensity: input.analysis?.emotion?.intensity,
    };

    // Decide between full context and lightweight hints
    const useFull = Math.random() < FULL_CONTEXT_PROBABILITY;

    if (useFull) {
      // Get full cognitive engine result
      const result = getCognitiveEngineResult(personaId, {
        personaId,
        conversationState,
        userContext,
      });

      if (result) {
        injections.push(
          createStandardInjection('cognitive-style', result.promptInjection, {
            category: 'cognitive',
            confidence: 0.9,
          })
        );

        log.debug(
          {
            personaId,
            style: result.profile.insight.primaryFraming,
            questioning: result.profile.questioning.whyVsHow > 0.5 ? 'why' : 'how',
          },
          'Injected full cognitive context'
        );
      }
    } else {
      // Use lightweight hints
      const hints = buildLightweightHints(personaId);
      if (hints) {
        injections.push(
          createStandardInjection('cognitive-hints', hints, {
            category: 'cognitive',
            confidence: 0.7,
          })
        );

        log.debug({ personaId }, 'Injected lightweight cognitive hints');
      }
    }
  } catch (error) {
    log.error({ error, personaId }, 'Error building cognitive style context');
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'cognitive-style',
  description: 'Persona cognitive differentiation - questioning style, silence handling, insight framing',
  priority: COGNITIVE_PRIORITY, // After persona identity (60), before output shaping (70)
  build: buildCognitiveStyleContext,
});

export { buildCognitiveStyleContext };
