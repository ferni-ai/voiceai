/**
 * Persona Phrases - Thinking Fillers
 *
 * Thinking/processing fillers for all personas.
 *
 * @module persona-phrases/thinking-fillers
 */

import { getProcessingPhraseWithSSML } from '../../intelligence/processing-intelligence.js';
import { breakTag } from '../../ssml/cartesia.js';
import { normalizePersonaId, addPersonaAliases } from './helpers.js';

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
 */
const THINKING_FILLERS: Record<string, string[]> = {
  // PHILOSOPHY: These are CONVERSATIONAL, not meta about thinking.
  // They should feel like natural conversation continuation, not "AI is loading..."
  ferni: [
    // Natural conversational acknowledgments
    `${breakTag('200ms')}Yeah...${breakTag('300ms')}`,
    `${breakTag('200ms')}So...${breakTag('300ms')}`,
    `${breakTag('250ms')}Okay...${breakTag('350ms')}`,
    `${breakTag('200ms')}Right...${breakTag('300ms')}`,
    `${breakTag('250ms')}Mm.${breakTag('300ms')}`,
  ],
  'nayan-patel': [
    // Wise, unhurried presence
    `${breakTag('350ms')}Mm.${breakTag('400ms')}`,
    `${breakTag('300ms')}Yes...${breakTag('400ms')}`,
    `${breakTag('350ms')}...${breakTag('500ms')}`,
    `${breakTag('300ms')}Indeed.${breakTag('400ms')}`,
  ],
  'peter-john': [
    // Engaged, curious
    `${breakTag('200ms')}Oh!${breakTag('300ms')}`,
    `${breakTag('200ms')}Interesting.${breakTag('300ms')}`,
    `${breakTag('200ms')}Hm.${breakTag('250ms')}`,
    `${breakTag('200ms')}So...${breakTag('300ms')}`,
  ],
  'maya-santos': [
    // Warm, present
    `${breakTag('250ms')}Yeah...${breakTag('350ms')}`,
    `${breakTag('200ms')}Okay so...${breakTag('300ms')}`,
    `${breakTag('250ms')}Right...${breakTag('350ms')}`,
    `${breakTag('200ms')}Mm.${breakTag('300ms')}`,
  ],
  'jordan-taylor': [
    // Enthusiastic, energetic
    `${breakTag('150ms')}Ooh!${breakTag('250ms')}`,
    `${breakTag('150ms')}Oh!${breakTag('250ms')}`,
    `${breakTag('200ms')}Yeah!${breakTag('300ms')}`,
    `${breakTag('200ms')}Okay so...${breakTag('300ms')}`,
  ],
  'alex-chen': [
    // Efficient, direct
    `${breakTag('150ms')}Mm.${breakTag('250ms')}`,
    `${breakTag('150ms')}Right...${breakTag('250ms')}`,
    `${breakTag('200ms')}Yeah...${breakTag('300ms')}`,
    `${breakTag('150ms')}So...${breakTag('250ms')}`,
  ],
};

// Add backward compatibility aliases
addPersonaAliases(THINKING_FILLERS);

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
 * Uses ProcessingIntelligence to compose the right phrase based on context.
 * This is the preferred method for new code.
 *
 * @param personaId - The persona ID
 * @param options - Optional context for phrase composition
 * @param options.forDeadAirPrevention - If true, returns actual verbal filler (not empty)
 * @returns SSML-formatted thinking phrase (empty by default, verbal if forDeadAirPrevention)
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
  }
): string {
  const {
    type = 'thinking',
    weight = 'medium',
    forDeadAirPrevention = false,
    ...rest
  } = options || {};

  // For dead air prevention, we need actual verbal content
  if (forDeadAirPrevention) {
    return getThinkingFillerInternal(personaId);
  }

  try {
    return getProcessingPhraseWithSSML(type, weight, rest);
  } catch {
    // Fallback to legacy system if ProcessingIntelligence fails
    return getThinkingFillerInternal(personaId);
  }
}
