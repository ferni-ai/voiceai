/**
 * Persona Phrases - Thinking Fillers
 *
 * Thinking/processing fillers for all personas.
 * Context-aware selection for dead air prevention: tools, memory, heavy topics.
 *
 * @module persona-phrases/thinking-fillers
 */

import { getProcessingPhraseWithSSML } from '../../intelligence/processing-intelligence.js';
import { breakTag } from '../../ssml/cartesia.js';
import { normalizePersonaId, addPersonaAliases } from './helpers.js';

// ============================================================================
// FILLER CONTEXT TYPES
// ============================================================================

/**
 * Context for context-aware filler selection during dead air prevention.
 * Allows selection of appropriate fillers based on what's happening.
 */
export interface FillerContext {
  /** Dead air prevention mode - returns actual verbal content */
  forDeadAirPrevention?: boolean;
  /** A tool is currently executing */
  isToolExecuting?: boolean;
  /** Name of the tool being executed (for tool-specific phrases) */
  toolName?: string;
  /** Primary emotion from voice analysis */
  emotionPrimary?: string;
  /** Emotion intensity (0-1) */
  emotionIntensity?: number;
  /** Memory retrieval is in progress */
  isMemorySearch?: boolean;
  /** User raised a heavy/emotional topic - use softer, slower fillers */
  isHeavyTopic?: boolean;
}

// ============================================================================
// THINKING FILLERS
// ============================================================================
//
// "Better Than Human" Philosophy for Processing Sounds:
//
// When Ferni needs a moment to think, it should feel like a PAUSE, not a crash.
// The sounds should signal "I'm still here, thinking" without sounding like:
// 1. A system error ("You know, I..." then silence = sounds broken)
// 2. An incomplete sentence (the user thinks they need to respond)
// 3. A question (user waits for context that never comes)
//
// Good thinking sounds:
// - Complete breath sounds: "Hmm.", "Mm."
// - Clear processing signals: "Let me think.", "Give me a moment."
// - Comfortable silence embracers: "..." with presence, not absence
//
// BAD thinking sounds (removed):
// - "You know, I..." (incomplete - sounds like crashing)
// - "Right...that's..." (fragmented - sounds broken)
// - "So we could...wait..." (confusing - two incomplete thoughts)
// - "The question itself..." (sounds like starting a sentence)
// ============================================================================

// IMPORTANT: Avoid "Good question" and "Well..." phrases - they sound like inner monologue
// These are spoken while the agent is thinking, NOT in response to questions
// Keep these SHORT and active - Ferni doesn't hedge or stall

/**
 * @deprecated Use getContextAwareThinkingFiller() instead
 * @internal Used only as fallback when ProcessingIntelligence fails
 *
 * UPDATED Dec 29 2024: Reduced break durations from 200-350ms to 100-150ms
 * for faster perceived response. Total filler time now ~200-300ms instead of ~500ms.
 * This is closer to natural human "thinking sounds" timing.
 */
const THINKING_FILLERS: Record<string, string[]> = {
  // PHILOSOPHY: These are CONVERSATIONAL, not meta about thinking.
  // They should feel like natural conversation continuation, not "AI is loading..."
  ferni: [
    // Natural conversational acknowledgments - faster breaks for responsiveness
    `${breakTag('100ms')}Yeah...${breakTag('150ms')}`,
    `${breakTag('100ms')}So...${breakTag('150ms')}`,
    `${breakTag('100ms')}Okay...${breakTag('150ms')}`,
    `${breakTag('100ms')}Right...${breakTag('150ms')}`,
    `${breakTag('100ms')}Mm.${breakTag('150ms')}`,
  ],
  'nayan-patel': [
    // Wise, unhurried presence - slightly longer but still responsive
    `${breakTag('150ms')}Mm.${breakTag('200ms')}`,
    `${breakTag('150ms')}Yes...${breakTag('200ms')}`,
    `${breakTag('150ms')}...${breakTag('250ms')}`,
    `${breakTag('150ms')}Indeed.${breakTag('200ms')}`,
  ],
  'peter-john': [
    // Engaged, curious
    `${breakTag('100ms')}Oh!${breakTag('150ms')}`,
    `${breakTag('100ms')}Interesting.${breakTag('150ms')}`,
    `${breakTag('100ms')}Hm.${breakTag('150ms')}`,
    `${breakTag('100ms')}So...${breakTag('150ms')}`,
  ],
  'maya-santos': [
    // Warm, present
    `${breakTag('100ms')}Yeah...${breakTag('150ms')}`,
    `${breakTag('100ms')}Okay so...${breakTag('150ms')}`,
    `${breakTag('100ms')}Right...${breakTag('150ms')}`,
    `${breakTag('100ms')}Mm.${breakTag('150ms')}`,
  ],
  'jordan-taylor': [
    // Enthusiastic, energetic - fastest
    `${breakTag('50ms')}Ooh!${breakTag('100ms')}`,
    `${breakTag('50ms')}Oh!${breakTag('100ms')}`,
    `${breakTag('75ms')}Yeah!${breakTag('125ms')}`,
    `${breakTag('75ms')}Okay so...${breakTag('125ms')}`,
  ],
  'alex-chen': [
    // Efficient, direct - fast
    `${breakTag('75ms')}Mm.${breakTag('125ms')}`,
    `${breakTag('75ms')}Right...${breakTag('125ms')}`,
    `${breakTag('100ms')}Yeah...${breakTag('150ms')}`,
    `${breakTag('75ms')}So...${breakTag('125ms')}`,
  ],
};

// Add backward compatibility aliases
addPersonaAliases(THINKING_FILLERS);

// ============================================================================
// CONTEXT-AWARE FILLER POOLS
// ============================================================================

/**
 * Verbal fillers when a tool is executing - "Let me check...", "Looking into it..."
 * Short (1-6 words) for natural dead air prevention.
 */
const TOOL_VERBAL_FILLERS: Record<string, string[]> = {
  ferni: [
    `${breakTag('100ms')}Let me check that...${breakTag('150ms')}`,
    `${breakTag('100ms')}Looking into it...${breakTag('150ms')}`,
    `${breakTag('100ms')}One moment...${breakTag('150ms')}`,
    `${breakTag('100ms')}Let me see...${breakTag('150ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('150ms')}Let me see...${breakTag('200ms')}`,
    `${breakTag('150ms')}One moment...${breakTag('200ms')}`,
    `${breakTag('150ms')}Mm, checking...${breakTag('200ms')}`,
  ],
  'peter-john': [
    `${breakTag('100ms')}Let me look that up...${breakTag('150ms')}`,
    `${breakTag('100ms')}Checking...${breakTag('150ms')}`,
    `${breakTag('100ms')}One moment...${breakTag('150ms')}`,
  ],
  'maya-santos': [
    `${breakTag('100ms')}Let me check that...${breakTag('150ms')}`,
    `${breakTag('100ms')}Looking into it...${breakTag('150ms')}`,
    `${breakTag('100ms')}One sec...${breakTag('150ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('50ms')}Let me check...${breakTag('100ms')}`,
    `${breakTag('75ms')}On it!${breakTag('125ms')}`,
    `${breakTag('75ms')}Looking into it...${breakTag('125ms')}`,
  ],
  'alex-chen': [
    `${breakTag('75ms')}Checking...${breakTag('125ms')}`,
    `${breakTag('75ms')}Let me look...${breakTag('125ms')}`,
    `${breakTag('100ms')}One moment...${breakTag('150ms')}`,
  ],
};
addPersonaAliases(TOOL_VERBAL_FILLERS);

/**
 * Verbal fillers during memory search - "I remember something...", "Let me think back..."
 */
const MEMORY_VERBAL_FILLERS: Record<string, string[]> = {
  ferni: [
    `${breakTag('150ms')}I remember something about that...${breakTag('200ms')}`,
    `${breakTag('150ms')}Let me think back...${breakTag('200ms')}`,
    `${breakTag('150ms')}Mm, something comes to mind...${breakTag('200ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('200ms')}Let me recall...${breakTag('250ms')}`,
    `${breakTag('200ms')}Something comes to mind...${breakTag('250ms')}`,
  ],
  'peter-john': [
    `${breakTag('150ms')}Let me think back...${breakTag('200ms')}`,
    `${breakTag('150ms')}I remember...${breakTag('200ms')}`,
  ],
  'maya-santos': [
    `${breakTag('150ms')}I remember something...${breakTag('200ms')}`,
    `${breakTag('150ms')}Let me think back...${breakTag('200ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('100ms')}Let me think back...${breakTag('150ms')}`,
    `${breakTag('100ms')}I remember!${breakTag('150ms')}`,
  ],
  'alex-chen': [
    `${breakTag('100ms')}Let me recall...${breakTag('150ms')}`,
    `${breakTag('100ms')}I remember something...${breakTag('150ms')}`,
  ],
};
addPersonaAliases(MEMORY_VERBAL_FILLERS);

/**
 * Softer, slower fillers for heavy/emotional topics - sometimes gentle silence
 */
const HEAVY_TOPIC_FILLERS: Record<string, string[]> = {
  ferni: [
    `${breakTag('200ms')}Mm.${breakTag('300ms')}`,
    `${breakTag('200ms')}...${breakTag('350ms')}`,
    `${breakTag('250ms')}Hmm.${breakTag('300ms')}`,
    `${breakTag('200ms')}I hear you.${breakTag('300ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('250ms')}Mm.${breakTag('350ms')}`,
    `${breakTag('300ms')}...${breakTag('400ms')}`,
    `${breakTag('250ms')}Indeed.${breakTag('350ms')}`,
  ],
  'peter-john': [
    `${breakTag('200ms')}Mm.${breakTag('300ms')}`,
    `${breakTag('200ms')}I see.${breakTag('300ms')}`,
  ],
  'maya-santos': [
    `${breakTag('200ms')}Mm.${breakTag('300ms')}`,
    `${breakTag('200ms')}I hear you.${breakTag('300ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('150ms')}Mm.${breakTag('250ms')}`,
    `${breakTag('200ms')}I hear you.${breakTag('300ms')}`,
  ],
  'alex-chen': [
    `${breakTag('150ms')}Mm.${breakTag('250ms')}`,
    `${breakTag('200ms')}...${breakTag('300ms')}`,
  ],
};
addPersonaAliases(HEAVY_TOPIC_FILLERS);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Internal helper to get actual verbal filler content
 */
function getThinkingFillerInternal(personaId: string): string {
  const normalized = normalizePersonaId(personaId);
  const fillers = THINKING_FILLERS[normalized];

  // For unknown personas, return a stable, "safe" default
  if (!fillers) {
    return THINKING_FILLERS.ferni[0];
  }

  return fillers[Math.floor(Math.random() * fillers.length)];
}

/**
 * Get thinking filler for a persona
 *
 * @deprecated Use getContextAwareThinkingFiller(personaId, { forDeadAirPrevention: true }).
 * Will be removed in Q2 2025.
 */
export function getThinkingFiller(personaId: string): string {
  // Note: Avoid adding runtime warning here as this is called frequently
  // and would spam logs. The JSDoc deprecation is sufficient.
  return getThinkingFillerInternal(personaId);
}

/**
 * Get context-aware thinking/processing phrase
 *
 * Uses context to select appropriate filler:
 * - Tool executing → "Let me check that...", "Looking into it..."
 * - Memory search → "I remember something about that..."
 * - Heavy topic → softer fillers: "Mm.", "Hmm.", "I hear you."
 * - Strong emotion → emotion-specific phrases from emotion-adaptive-timing
 * - Default → existing thinking fillers
 *
 * @param personaId - The persona ID
 * @param options - Optional context for phrase composition
 * @returns SSML-formatted thinking phrase
 */
export function getContextAwareThinkingFiller(
  personaId: string,
  options?: {
    type?: 'thinking' | 'emotional' | 'tool_call' | 'memory_recall';
    weight?: 'light' | 'medium' | 'heavy';
    emotionalState?: { primary: string; intensity: number };
    hourOfDay?: number;
    relationshipStage?: string;
    /**
     * If true, returns actual verbal content like "Mm", "So...", "Yeah"
     * for dead air prevention. By default (false), returns empty strings
     * to let the LLM generate natural responses.
     */
    forDeadAirPrevention?: boolean;
    /** Context for context-aware filler selection */
    isToolExecuting?: boolean;
    toolName?: string;
    isMemorySearch?: boolean;
    isHeavyTopic?: boolean;
    emotionPrimary?: string;
    emotionIntensity?: number;
    /** Pre-fetched emotion filler phrases (from getEmotionFillerPhrases) - avoids speech importing agents */
    emotionFillerPhrases?: string[];
  }
): string {
  const {
    type = 'thinking',
    weight = 'medium',
    forDeadAirPrevention = false,
    isToolExecuting,
    toolName,
    isMemorySearch,
    isHeavyTopic,
    emotionPrimary,
    emotionIntensity,
    emotionFillerPhrases,
    ...rest
  } = options || {};

  // For dead air prevention, select context-appropriate verbal filler
  if (forDeadAirPrevention) {
    const normalized = normalizePersonaId(personaId);

    // 1. Tool executing → tool-specific verbal fillers
    if (isToolExecuting) {
      const toolFillers = TOOL_VERBAL_FILLERS[normalized] ?? TOOL_VERBAL_FILLERS.ferni;
      return toolFillers[Math.floor(Math.random() * toolFillers.length)];
    }

    // 2. Memory search in progress → memory recall fillers
    if (isMemorySearch) {
      const memoryFillers = MEMORY_VERBAL_FILLERS[normalized] ?? MEMORY_VERBAL_FILLERS.ferni;
      return memoryFillers[Math.floor(Math.random() * memoryFillers.length)];
    }

    // 3. Heavy/emotional topic → softer, slower fillers
    if (isHeavyTopic) {
      const heavyFillers = HEAVY_TOPIC_FILLERS[normalized] ?? HEAVY_TOPIC_FILLERS.ferni;
      return heavyFillers[Math.floor(Math.random() * heavyFillers.length)];
    }

    // 4. Strong emotion → use emotion-aware phrases when provided (from turn-handler)
    if (emotionFillerPhrases && emotionFillerPhrases.length > 0) {
      const phrase = emotionFillerPhrases[Math.floor(Math.random() * emotionFillerPhrases.length)];
      return `${breakTag('150ms')}${phrase}${breakTag('200ms')}`;
    }

    // 5. Default → existing thinking fillers
    return getThinkingFillerInternal(personaId);
  }

  try {
    return getProcessingPhraseWithSSML(type, weight, rest);
  } catch {
    // Fallback to legacy system if ProcessingIntelligence fails
    return getThinkingFillerInternal(personaId);
  }
}
