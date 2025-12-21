/**
 * Processing Intelligence
 *
 * UNIFIED system for composing context-aware processing expressions.
 * This replaces the scattered "thinking" phrases across multiple files:
 * - persona-phrases.ts (THINKING_FILLERS)
 * - natural-tool-calling.ts (PRE_CALL_PHRASES)
 * - meaningful-silence.ts (THINKING_OUT_LOUD)
 * - rich-disfluencies.ts (thinking_aloud)
 * - conversation-quality.ts (retry phrases)
 *
 * The key insight: Processing phrases should be COMPOSED based on context,
 * not randomly selected from pools.
 *
 * @module ProcessingIntelligence
 */

import type {
  ProcessingContext,
  ProcessingResult,
  ProcessingType,
  ProcessingWeight,
} from '../agents/realtime/behavior-types.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ProcessingIntelligence' });

// ============================================================================
// INTEGRATION: Import shared building blocks from Personality System
// This ensures consistent language across both systems
// ============================================================================

// We'll dynamically import to avoid circular dependencies
let PERSONALITY_CONNECTORS: Record<string, string[]> | null = null;

async function loadPersonalityBuildingBlocks(): Promise<void> {
  if (PERSONALITY_CONNECTORS) return;

  try {
    const personality = await import('../personas/bundles/ferni/better-than-human-personality.js');
    // Access the CONNECTORS if exported, otherwise use defaults
    if ('CONNECTORS' in personality) {
      PERSONALITY_CONNECTORS = personality.CONNECTORS as Record<string, string[]>;
      log.debug('Loaded personality building blocks for integration');
    }
  } catch {
    // Personality module not available - use defaults
    log.debug('Personality building blocks not available, using defaults');
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Base pause durations by weight (in ms)
 */
const BASE_PAUSES: Record<ProcessingWeight, { pre: number; post: number }> = {
  light: { pre: 100, post: 150 },
  medium: { pre: 200, post: 300 },
  heavy: { pre: 400, post: 500 },
};

/**
 * Time of day multipliers
 * Late night = slower, more spacious
 */
function getTimeMultiplier(hourOfDay?: number): number {
  if (hourOfDay === undefined) return 1.0;
  if (hourOfDay >= 23 || hourOfDay < 5) return 1.4; // Late night: 40% slower
  if (hourOfDay >= 6 && hourOfDay < 9) return 1.1; // Early morning: 10% slower
  return 1.0;
}

/**
 * Relationship stage multipliers
 * New users get more explicit processing signals
 */
const RELATIONSHIP_MULTIPLIERS: Record<string, number> = {
  new: 1.3, // New users need more explicit signals
  developing: 1.1,
  established: 1.0,
  deep: 0.9, // Deep relationships can be more subtle
};

// ============================================================================
// DEPRECATED: STATIC PHRASE LIBRARIES
// ============================================================================
//
// These static phrase pools have been replaced by LLM behavioral guidance.
// See: src/intelligence/context-builders/dynamic-speech-guidance.ts
//
// The new approach:
// - Don't give the LLM phrases to repeat
// - Guide it on INTENT and let it generate naturally
// - Match energy and context, not templates
//
// The phrase pools below are kept for backward compatibility but return
// empty strings. The LLM will generate natural speech based on context.
// ============================================================================

/**
 * @deprecated REMOVED - LLM generates natural speech from behavioral guidance
 * Kept for backward compatibility, returns empty strings.
 */
const PROCESSING_PHRASES: Record<ProcessingType, Record<ProcessingWeight, string[]>> = {
  thinking: {
    light: [''], // Empty - LLM decides naturally
    medium: [''],
    heavy: [''],
  },
  emotional: {
    light: [''],
    medium: [''],
    heavy: [''],
  },
  tool_call: {
    light: [''],
    medium: [''],
    heavy: [''],
  },
  memory_recall: {
    light: [''],
    medium: [''],
    heavy: [''],
  },
  after_tool_result: {
    light: [''],
    medium: [''],
    heavy: [''],
  },
  context_loading: {
    light: [''],
    medium: [''],
    heavy: [''],
  },
};

/**
 * Emotional modifiers that can precede phrases
 */
const EMOTIONAL_MODIFIERS: Record<string, string[]> = {
  sad: ['<emotion value="gentle"/>', '<speed ratio="0.9"/>'],
  anxious: ['<emotion value="calm"/>', '<speed ratio="0.9"/>'],
  excited: ['<emotion value="warm"/>', '<speed ratio="1.05"/>'],
  default: [''],
};

/**
 * Avatar expressions to show during processing
 */
const AVATAR_EXPRESSIONS: Record<ProcessingType, string> = {
  thinking: 'thinking',
  emotional: 'empathy',
  tool_call: 'processing',
  memory_recall: 'remembering',
  after_tool_result: 'interested',
  context_loading: 'processing',
};

// ============================================================================
// CORE COMPOSITION
// ============================================================================

/**
 * Select a phrase based on context
 */
function selectPhrase(type: ProcessingType, weight: ProcessingWeight): string {
  const phrases = PROCESSING_PHRASES[type][weight];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get SSML wrapper based on emotional context
 */
function getSSMLWrapper(emotionalState?: { primary: string; intensity: number }): string {
  if (!emotionalState) return '';

  const modifiers = EMOTIONAL_MODIFIERS[emotionalState.primary] || EMOTIONAL_MODIFIERS.default;

  // Only apply modifier for significant intensity
  if (emotionalState.intensity < 0.5) return '';

  return modifiers[Math.floor(Math.random() * modifiers.length)];
}

/**
 * Calculate pause durations based on all context factors
 */
function calculatePauses(
  weight: ProcessingWeight,
  hourOfDay?: number,
  relationshipStage?: string
): { pre: number; post: number } {
  const base = BASE_PAUSES[weight];
  const timeMultiplier = getTimeMultiplier(hourOfDay);
  const relationshipMultiplier = RELATIONSHIP_MULTIPLIERS[relationshipStage || 'developing'] || 1.0;

  return {
    pre: Math.round(base.pre * timeMultiplier * relationshipMultiplier),
    post: Math.round(base.post * timeMultiplier * relationshipMultiplier),
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Compose a context-aware processing expression
 *
 * This is the main entry point that replaces all the scattered processing phrases.
 * Instead of randomly selecting from a pool, it COMPOSES the right response
 * based on multiple contextual dimensions.
 *
 * @param ctx - Processing context with trigger, weight, emotional state, etc.
 * @returns ProcessingResult with phrase, pauses, and avatar expression
 *
 * @example
 * ```typescript
 * const result = composeProcessingExpression({
 *   trigger: 'emotional',
 *   weight: 'heavy',
 *   emotionalState: { primary: 'sad', intensity: 0.8 },
 *   relationshipStage: 'established',
 *   hourOfDay: 23,
 * });
 *
 * // result.phrase: "That's heavy."
 * // result.prePause: 560 (base 400 * 1.4 late night)
 * // result.avatarExpression: "empathy"
 * ```
 */
export function composeProcessingExpression(ctx: ProcessingContext): ProcessingResult {
  const { trigger, weight, emotionalState, relationshipStage, hourOfDay } = ctx;

  // Select appropriate phrase
  const phrase = selectPhrase(trigger, weight);

  // Get SSML wrapper for emotional context
  const ssmlWrapper = getSSMLWrapper(emotionalState);

  // Calculate pauses
  const pauses = calculatePauses(weight, hourOfDay, relationshipStage);

  // Get avatar expression
  const avatarExpression = AVATAR_EXPRESSIONS[trigger];

  // Compose final result
  const result: ProcessingResult = {
    phrase,
    prePause: pauses.pre,
    postPause: pauses.post,
    avatarExpression,
    ssmlWrapper: ssmlWrapper || undefined,
  };

  log.debug(
    {
      trigger,
      weight,
      phrase: result.phrase,
      prePause: result.prePause,
      postPause: result.postPause,
    },
    'Composed processing expression'
  );

  return result;
}

/**
 * Format a processing result as SSML
 */
export function formatProcessingAsSSML(result: ProcessingResult): string {
  const { phrase, prePause, postPause, ssmlWrapper } = result;

  let output = '';

  // Pre-pause
  if (prePause > 0) {
    output += `<break time="${prePause}ms"/>`;
  }

  // SSML wrapper + phrase
  if (ssmlWrapper) {
    output += `${ssmlWrapper}${phrase}`;
  } else {
    output += phrase;
  }

  // Post-pause
  if (postPause > 0) {
    output += `<break time="${postPause}ms"/>`;
  }

  return output;
}

/**
 * Quick helper for tool calls
 */
export function getToolCallProcessing(
  toolName: string,
  weight: ProcessingWeight = 'light'
): ProcessingResult {
  return composeProcessingExpression({
    trigger: 'tool_call',
    weight,
    currentTopic: toolName,
  });
}

/**
 * Quick helper for emotional processing
 */
export function getEmotionalProcessing(
  emotionalState: { primary: string; intensity: number },
  relationshipStage?: string
): ProcessingResult {
  // Determine weight based on intensity
  const weight: ProcessingWeight =
    emotionalState.intensity > 0.7 ? 'heavy' : emotionalState.intensity > 0.4 ? 'medium' : 'light';

  return composeProcessingExpression({
    trigger: 'emotional',
    weight,
    emotionalState,
    relationshipStage: relationshipStage as ProcessingContext['relationshipStage'],
    hourOfDay: new Date().getHours(),
  });
}

/**
 * Quick helper for thinking/reflection
 */
export function getThinkingProcessing(
  weight: ProcessingWeight = 'medium',
  hourOfDay?: number
): ProcessingResult {
  return composeProcessingExpression({
    trigger: 'thinking',
    weight,
    hourOfDay: hourOfDay ?? new Date().getHours(),
  });
}

/**
 * Quick helper for memory recall
 */
export function getMemoryRecallProcessing(weight: ProcessingWeight = 'medium'): ProcessingResult {
  return composeProcessingExpression({
    trigger: 'memory_recall',
    weight,
  });
}

/**
 * Quick helper for after tool result
 * Use when processing/displaying results from a tool call
 */
export function getAfterToolResultProcessing(
  weight: ProcessingWeight = 'light',
  personaId?: string
): ProcessingResult {
  if (personaId) {
    return composePersonaProcessingExpression({
      personaId,
      trigger: 'after_tool_result',
      weight,
    });
  }
  return composeProcessingExpression({
    trigger: 'after_tool_result',
    weight,
  });
}

/**
 * Quick helper for context loading
 * Use when loading persona bundles, settings, or other context
 */
export function getContextLoadingProcessing(weight: ProcessingWeight = 'light'): ProcessingResult {
  return composeProcessingExpression({
    trigger: 'context_loading',
    weight,
  });
}

// ============================================================================
// DEPRECATED: PERSONA-SPECIFIC PHRASE OVERRIDES
// ============================================================================
//
// These persona-specific phrases have been replaced by LLM behavioral guidance.
// See: src/intelligence/context-builders/dynamic-speech-guidance.ts
//
// The LLM now generates persona-appropriate speech naturally based on:
// 1. Persona identity (system prompt)
// 2. Behavioral guidance (dynamic-speech-guidance.ts)
// 3. Conversation context
//
// The phrase pools below are kept for backward compatibility but return
// empty strings.
// ============================================================================

/**
 * @deprecated REMOVED - LLM generates persona-appropriate speech naturally
 * Kept for backward compatibility, returns empty strings.
 */
const PERSONA_OVERRIDES: Record<
  string,
  Partial<Record<ProcessingType, Partial<Record<ProcessingWeight, string[]>>>>
> = {
  ferni: {
    thinking: { medium: [''], heavy: [''] },
    emotional: { heavy: [''] },
    memory_recall: { medium: [''], heavy: [''] },
  },
  maya: {
    thinking: { light: [''], medium: [''] },
    tool_call: { light: [''], medium: [''] },
    emotional: { medium: [''], heavy: [''] },
  },
  peter: {
    thinking: { light: [''], medium: [''] },
    tool_call: { light: [''], medium: [''], heavy: [''] },
    memory_recall: { medium: [''] },
  },
  nayan: {
    thinking: { medium: [''], heavy: [''] },
    emotional: { medium: [''], heavy: [''] },
    memory_recall: { heavy: [''] },
  },
  jordan: {
    thinking: { light: [''], medium: [''], heavy: [''] },
    tool_call: { light: [''], medium: [''] },
    emotional: { medium: [''], heavy: [''] },
  },
  alex: {
    thinking: { light: [''], medium: [''] },
    tool_call: { light: [''], medium: [''] },
    emotional: { medium: [''], heavy: [''] },
    memory_recall: { light: [''], medium: [''] },
  },
};

/**
 * Get persona-specific processing expression
 */
export function composePersonaProcessingExpression(ctx: ProcessingContext): ProcessingResult {
  const { personaId, trigger, weight } = ctx;

  // Check for persona-specific phrases
  if (personaId && PERSONA_OVERRIDES[personaId]) {
    const personaPhrases = PERSONA_OVERRIDES[personaId][trigger]?.[weight];
    if (personaPhrases && personaPhrases.length > 0) {
      // Use persona-specific phrase
      const phrase = personaPhrases[Math.floor(Math.random() * personaPhrases.length)];
      const pauses = calculatePauses(weight, ctx.hourOfDay, ctx.relationshipStage);

      return {
        phrase,
        prePause: pauses.pre,
        postPause: pauses.post,
        avatarExpression: AVATAR_EXPRESSIONS[trigger],
        ssmlWrapper: getSSMLWrapper(ctx.emotionalState) || undefined,
      };
    }
  }

  // Fall back to generic
  return composeProcessingExpression(ctx);
}

// ============================================================================
// SIMPLE API FOR LEGACY INTEGRATION
// ============================================================================

/**
 * Simple API for getting a processing phrase without full context
 *
 * This is useful for integrating with legacy systems that just need
 * a phrase for a given type/weight combination.
 *
 * @param type - The processing type
 * @param weight - The processing weight
 * @returns A randomly selected phrase
 */
export function getProcessingPhrase(type: ProcessingType, weight: ProcessingWeight): string {
  return selectPhrase(type, weight);
}

/**
 * Get a processing phrase with SSML formatting
 *
 * Convenience method that returns a complete SSML-tagged phrase
 * suitable for TTS output.
 */
export function getProcessingPhraseWithSSML(
  type: ProcessingType,
  weight: ProcessingWeight,
  options?: {
    emotionalState?: { primary: string; intensity: number };
    hourOfDay?: number;
    relationshipStage?: string;
  }
): string {
  const result = composeProcessingExpression({
    trigger: type,
    weight,
    emotionalState: options?.emotionalState,
    hourOfDay: options?.hourOfDay,
    relationshipStage: options?.relationshipStage as ProcessingContext['relationshipStage'],
  });

  return formatProcessingAsSSML(result);
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ProcessingContext, ProcessingResult };

export { AVATAR_EXPRESSIONS, BASE_PAUSES, PERSONA_OVERRIDES, PROCESSING_PHRASES };
