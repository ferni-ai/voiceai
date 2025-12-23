/**
 * Natural Filler Injection
 *
 * DEPRECATED: Static filler injection replaced by LLM behavioral guidance.
 * See: src/intelligence/context-builders/dynamic-speech-guidance.ts
 *
 * The new architecture:
 * - Don't inject static fillers ("um", "well", "you know")
 * - Let the LLM generate natural speech rhythms based on context
 * - The LLM knows WHEN and HOW to use natural speech patterns
 *
 * Static filler injection was problematic because:
 * - "Let me see" / "Let me think" sound robotic when repeated
 * - Starting with "Well..." is an anti-pattern
 * - Random filler injection sounds artificial
 *
 * The injectNaturalFillers function now returns text unchanged.
 * The LLM generates appropriate speech patterns naturally.
 *
 * @module advanced-humanization/fillers
 * @deprecated Use LLM behavioral guidance instead
 */

import { createLogger } from '../../utils/safe-logger.js';
import { DEFAULT_FILLER_CONFIG, type FillerConfig } from './types.js';

const log = createLogger({ module: 'AdvancedHumanization' });

// ============================================================================
// FILLER DEFINITIONS
// ============================================================================

/**
 * Fillers categorized by their conversational function
 *
 * HUMANIZATION FIX: Removed "Let me see/think" - too robotic.
 * Keep only natural conversational sounds.
 */
export const FILLERS = {
  /** Thinking/hesitation fillers - natural sounds only */
  thinking: ['Hmm', 'Um', 'Mm', 'Hm'],

  /** Transition fillers */
  transition: ['So', 'Okay so', 'Alright'],

  /** Connection/engagement fillers */
  connection: ['You know', 'I mean', 'Actually'],

  /** Consideration fillers - removed "Well" at start (anti-pattern) */
  consideration: ['I think', 'It seems like', 'Maybe'],
} as const;

/**
 * Filler category type
 */
export type FillerCategory = keyof typeof FILLERS;

/**
 * Persona-specific filler preferences
 */
export const PERSONA_FILLER_PREFERENCES: Record<string, FillerCategory[]> = {
  ferni: ['thinking', 'connection', 'consideration'],
  'jack-bogle': ['consideration', 'transition'],
  'peter-john': ['thinking', 'transition'],
  'maya-santos': ['connection', 'thinking'],
  'alex-chen': ['transition', 'consideration'],
  'jordan-taylor': ['connection', 'transition'],
};

// ============================================================================
// FILLER INJECTION LOGIC
// ============================================================================

/**
 * Determine if we should inject a filler at this point
 */
function shouldInjectFiller(
  text: string,
  position: number,
  config: FillerConfig,
  currentFillerCount: number
): boolean {
  // Don't exceed max
  if (currentFillerCount >= config.maxPerResponse) return false;

  // Check probability
  if (Math.random() > config.probability) return false;

  // Good injection points: after sentence start, before important content
  const before = text.slice(Math.max(0, position - 30), position);
  const after = text.slice(position, position + 30);

  // After sentence start
  if (/^[.!?]\s*$/.test(before)) return true;

  // Before explanations
  if (/^(I think|The thing is|What I|Here's)/i.test(after)) return true;

  // After transitions
  if (/\b(But|And|So|However)\s*$/i.test(before)) return true;

  return Math.random() < 0.5; // 50% chance at other points
}

/**
 * Get appropriate filler for context
 */
function getFillerForContext(
  personaId: string | undefined,
  position: 'start' | 'middle' | 'before_important'
): string {
  const preferences = personaId
    ? PERSONA_FILLER_PREFERENCES[personaId] || ['thinking', 'transition']
    : ['thinking', 'transition'];

  // Choose filler type based on position
  let fillerType: FillerCategory;
  switch (position) {
    case 'start':
      fillerType = preferences.includes('transition') ? 'transition' : 'thinking';
      break;
    case 'before_important':
      fillerType = preferences.includes('consideration') ? 'consideration' : 'thinking';
      break;
    case 'middle':
    default: {
      const randomIndex = Math.floor(Math.random() * preferences.length);
      const randomPreference = preferences[randomIndex];
      fillerType = (randomPreference as FillerCategory) ?? 'thinking';
    }
  }

  const options = FILLERS[fillerType];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Inject natural fillers into text
 *
 * @deprecated DISABLED - LLM generates natural speech patterns from behavioral guidance.
 * See: src/intelligence/context-builders/dynamic-speech-guidance.ts
 *
 * This function now returns text unchanged. The LLM generates contextually
 * appropriate speech rhythms naturally based on:
 * 1. What the user said
 * 2. The persona's identity and voice
 * 3. Behavioral guidance from dynamic-speech-guidance.ts
 *
 * @param text - The text (returned unchanged)
 * @param _config - Unused
 * @param _personaId - Unused
 * @returns Text unchanged
 */
export function injectNaturalFillers(
  text: string,
  _config: FillerConfig = DEFAULT_FILLER_CONFIG,
  _personaId?: string
): string {
  // DEPRECATED: No longer inject static fillers
  // The LLM generates natural speech patterns based on behavioral guidance
  return text;
}
