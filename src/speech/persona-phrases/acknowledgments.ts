/**
 * Persona Phrases - Acknowledgments
 *
 * Acknowledgment prefixes for all personas.
 *
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * @module persona-phrases/acknowledgments
 */

import { breakTag } from '../../ssml/cartesia.js';
import type { AcknowledgmentMood } from './types.js';
import { addPersonaAliases } from './helpers.js';

// ============================================================================
// ACKNOWLEDGMENT PREFIXES (Added before responses)
// ============================================================================
//
// DEPRECATED: Static phrase pools replaced by LLM behavioral guidance.
// See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
//
// The new architecture:
// - Don't inject static acknowledgment prefixes
// - Let the LLM generate natural acknowledgments based on context
// - The LLM knows HOW to acknowledge (behavioral guidance) and WHO the persona is
//
// The phrase pools below are kept for backward compatibility but return
// empty strings or minimal pauses. The LLM will generate natural acknowledgments.
// ============================================================================

/**
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance
 * Kept for backward compatibility, returns empty strings.
 */
export const ACKNOWLEDGMENT_PREFIXES: Record<string, Record<AcknowledgmentMood, string[]>> = {
  ferni: {
    neutral: [
      `Mm-hmm.${breakTag('200ms')}`,
      `Yeah.${breakTag('200ms')}`,
      `Okay.${breakTag('200ms')}So,${breakTag('150ms')}`,
    ],
    engaged: [
      `Oh!${breakTag('200ms')}I like where this is going.${breakTag('250ms')}`,
      `Yeah!${breakTag('200ms')}`,
      `Mm!${breakTag('200ms')}`,
    ],
    empathetic: [
      `I hear you.${breakTag('300ms')}`,
      `Yeah, that's hard.${breakTag('250ms')}`,
      `I get it.${breakTag('250ms')}`,
      `I'm with you.${breakTag('250ms')}`,
    ],
    excited: [
      `Oh, this is great!${breakTag('200ms')}`,
      `Love it!${breakTag('200ms')}`,
      `Yes!${breakTag('200ms')}`,
    ],
    thoughtful: [
      `Hmm...${breakTag('300ms')}`,
      `Let me think about that...${breakTag('400ms')}`,
      `Good question...${breakTag('300ms')}`,
    ],
  },

  'nayan-patel': {
    neutral: [
      `${breakTag('200ms')}Yes.${breakTag('300ms')}`,
      `${breakTag('200ms')}Mm.${breakTag('250ms')}`,
      `I see.${breakTag('300ms')}`,
      `${breakTag('150ms')}Right.${breakTag('250ms')}`,
    ],
    engaged: [
      `Ah, yes!${breakTag('300ms')}`,
      `Now, that's interesting.${breakTag('350ms')}`,
      `${breakTag('200ms')}Now, that's important.${breakTag('300ms')}`,
    ],
    empathetic: [
      `${breakTag('300ms')}I understand.${breakTag('400ms')}`,
      `${breakTag('250ms')}I hear you.${breakTag('350ms')}`,
      `Yes... ${breakTag('400ms')}that's difficult.${breakTag('300ms')}`,
    ],
    excited: [
      `Ha!${breakTag('200ms')}Yes!${breakTag('250ms')}`,
      `Now you're talking!${breakTag('300ms')}`,
    ],
    thoughtful: [
      `${breakTag('300ms')}Hmm.${breakTag('400ms')}`,
      `${breakTag('200ms')}Let me think...${breakTag('400ms')}`,
      `${breakTag('200ms')}Good question...${breakTag('350ms')}`,
    ],
  },

  'peter-john': {
    neutral: [
      `Yeah!${breakTag('150ms')}`,
      `Oh!${breakTag('200ms')}Okay, so${breakTag('150ms')}`,
      `Right, right!${breakTag('200ms')}`,
    ],
    engaged: [
      `Oh, I love this!${breakTag('250ms')}`,
      `Ooh, interesting!${breakTag('200ms')}`,
      `Yes! Now,${breakTag('200ms')}`,
      `Ha! Okay, so${breakTag('200ms')}`,
    ],
    empathetic: [
      `Yeah...${breakTag('300ms')}I get it.${breakTag('250ms')}`,
      `Ah...${breakTag('250ms')}that's tough.${breakTag('200ms')}`,
    ],
    excited: [
      `Oh man!${breakTag('200ms')}YES!${breakTag('250ms')}`,
      `Ha! That's it!${breakTag('200ms')}`,
      `Now THAT'S what I'm talking about!${breakTag('300ms')}`,
    ],
    thoughtful: [
      `Hmm, okay...${breakTag('300ms')}`,
      `Let me think...${breakTag('350ms')}`,
      `Oh, you know what...${breakTag('300ms')}`,
    ],
  },

  'maya-santos': {
    neutral: [
      `Mm-hmm.${breakTag('200ms')}`,
      `Got it.${breakTag('200ms')}`,
      `Okay.${breakTag('200ms')}So,${breakTag('150ms')}`,
    ],
    engaged: [
      `Oh, that's helpful to know!${breakTag('250ms')}`,
      `I like that.${breakTag('200ms')}`,
      `Yeah.${breakTag('200ms')}`,
    ],
    empathetic: [
      `I hear you.${breakTag('300ms')}`,
      `Yeah...${breakTag('250ms')}that's relatable.${breakTag('200ms')}`,
      `A lot of people feel that way.${breakTag('250ms')}`,
      `I totally understand.${breakTag('300ms')}`,
    ],
    excited: [
      `That's great!${breakTag('200ms')}`,
      `Love that!${breakTag('200ms')}`,
      `Progress!${breakTag('200ms')}`,
    ],
    thoughtful: [
      `Hmm...${breakTag('300ms')}`,
      `Okay, let me think...${breakTag('300ms')}`,
      `Let me think...${breakTag('350ms')}`,
    ],
  },

  'jordan-taylor': {
    neutral: [
      `Yeah!${breakTag('150ms')}`,
      `Okay!${breakTag('150ms')}So,${breakTag('100ms')}`,
      `Got it!${breakTag('200ms')}`,
    ],
    engaged: [
      `Ooh!${breakTag('200ms')}I love it!${breakTag('200ms')}`,
      `Yes yes yes!${breakTag('200ms')}`,
      `Oh, this is exciting!${breakTag('250ms')}`,
    ],
    empathetic: [
      `I hear you.${breakTag('250ms')}`,
      `That's big.${breakTag('250ms')}`,
      `Yeah...${breakTag('200ms')}I get it.${breakTag('200ms')}`,
    ],
    excited: [
      `OH!${breakTag('150ms')}This is GREAT!${breakTag('200ms')}`,
      `YES!${breakTag('200ms')}`,
      `I'm so excited!${breakTag('200ms')}`,
    ],
    thoughtful: [`Hmm!${breakTag('250ms')}`, `Ooh, let me think...${breakTag('300ms')}`],
  },

  'alex-chen': {
    neutral: [
      `Got it.${breakTag('150ms')}`,
      `Okay.${breakTag('150ms')}`,
      `Clear.${breakTag('150ms')}`,
    ],
    engaged: [
      `Noted.${breakTag('150ms')}`,
      `Good.${breakTag('150ms')}`,
      `I see.${breakTag('200ms')}`,
    ],
    empathetic: [`I understand.${breakTag('200ms')}`, `Makes sense.${breakTag('200ms')}`],
    excited: [`Perfect.${breakTag('150ms')}`, `Excellent.${breakTag('200ms')}`],
    thoughtful: [
      `${breakTag('200ms')}Let me check...${breakTag('300ms')}`,
      `One moment.${breakTag('250ms')}`,
    ],
  },
};

// Add backward compatibility aliases
addPersonaAliases(ACKNOWLEDGMENT_PREFIXES);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get acknowledgment prefix for a persona
 *
 * @deprecated REMOVED - LLM generates natural acknowledgments from behavioral guidance.
 * See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
 *
 * Returns only a brief pause. The LLM will generate contextually appropriate
 * acknowledgments naturally based on what the user said and the persona's identity.
 */
export function getAcknowledgmentPrefix(
  _personaId: string,
  _mood: AcknowledgmentMood = 'neutral'
): string {
  // DEPRECATED: No longer return static phrases
  // The LLM generates natural acknowledgments based on:
  // 1. What the user actually said
  // 2. The persona's identity and voice
  // 3. Behavioral guidance from dynamic-speech-guidance.ts
  //
  // Return only a brief pause for natural speech pacing
  return breakTag('150ms');
}
