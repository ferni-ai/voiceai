/**
 * Speech Naturalizer Patterns
 *
 * Persona-specific disfluency patterns and templates.
 *
 * @module @ferni/conversation/speech-naturalizer/patterns
 */

import type { DisfluencyPatterns } from './types.js';

/**
 * Persona-specific disfluency patterns
 */
export const PERSONA_DISFLUENCIES: Record<string, DisfluencyPatterns> = {
  'nayan-patel': {
    fillers: ['Now...', 'You see...', 'Look...'],
    hedges: ['I believe', 'In my view', 'Generally speaking', 'As I see it'],
    repairs: [
      'Let me rephrase that.',
      'Actually, let me put it differently.',
      "No, wait—here's a better way to say it.",
    ],
    thinkingPhrases: ["That's worth considering...", 'Now, that brings up an important point...'],
  },
  ferni: {
    fillers: ['You know...', 'I mean...', "It's like..."],
    hedges: ['I sense', 'It feels like', 'Perhaps', 'Maybe'],
    repairs: [
      'Wait, let me say that differently.',
      "Actually—no, that's not quite it.",
      'Let me try again.',
    ],
    thinkingPhrases: ["That's heavy.", "That's a hard one.", 'You know what...'],
  },
  'peter-john': {
    fillers: ['You know...', 'So...', 'I mean...', 'Look...'],
    hedges: ['I think', 'Probably', 'It seems like', 'My guess is'],
    repairs: [
      'Wait, wait—let me back up.',
      "No, here's the thing—",
      "Actually, forget that—here's what matters:",
    ],
    thinkingPhrases: [
      'Let me think about this...',
      "You know what's interesting?",
      "Here's what jumps out at me...",
      'Okay, so...',
    ],
  },
  'maya-santos': {
    fillers: ['So...', 'Like...', 'You know...'],
    hedges: ['I feel like', 'It seems', 'Maybe', 'Possibly'],
    repairs: ['Wait, let me rephrase.', 'Actually, that came out wrong.', 'Let me try that again.'],
    thinkingPhrases: [
      "Hmm, that's interesting...",
      'Let me think about how to say this...',
      'You know what I mean?',
      "Here's the thing...",
    ],
  },
  'alex-chen': {
    fillers: ['So...', 'Right...', 'Okay...'],
    hedges: ['I think', 'Probably', 'Usually', 'In general'],
    repairs: ['Wait—let me be clearer.', 'Actually, scratch that.', 'Let me start over.'],
    thinkingPhrases: [
      'Let me check on that...',
      'Hmm, one second...',
      "Okay, so here's the situation...",
    ],
  },
  'jordan-taylor': {
    fillers: ['Oh!', 'So...', 'Like...', 'You know...'],
    hedges: ['I think', 'Probably', 'Maybe', 'I feel like'],
    repairs: ['Wait, no—even better:', 'Actually, you know what?', 'Oh! Let me rephrase that—'],
    thinkingPhrases: [
      'Ooh, let me think...',
      'You know what would be amazing?',
      'Oh! I just thought of something!',
    ],
  },
};

/**
 * Default patterns for unknown personas
 */
export const DEFAULT_DISFLUENCIES: DisfluencyPatterns = {
  fillers: ['Um...', 'Uh...', 'So...'],
  hedges: ['I think', 'Maybe', 'Probably', 'It seems like'],
  repairs: ['Actually, let me rephrase.', 'Wait—', "No, here's what I mean:"],
  thinkingPhrases: ['Okay.', 'Right.', 'Yeah.'],
};

/**
 * Type-specific thinking patterns
 */
export const TYPE_SPECIFIC_THINKING: Record<
  'processing' | 'recalling' | 'considering' | 'uncertain',
  string[]
> = {
  processing: ['Let me think about that...', 'Hmm...'],
  recalling: ['You know, that reminds me...', 'Now that you mention it...', 'I remember...'],
  considering: [
    'Let me consider this...',
    'There are a few ways to look at this...',
    'On one hand...',
  ],
  uncertain: ["I'm not entirely sure, but...", 'This is tricky...', 'I want to be careful here...'],
};

/**
 * Hedges by strength level
 */
export const HEDGES_BY_STRENGTH = {
  soft: ['I think', 'Maybe', 'Perhaps'],
  medium: ['It seems like', 'In my view', 'Generally'],
  strong: ["I'm not certain, but", 'If I had to guess,', 'This could be wrong, but'],
};

/**
 * Get patterns for a persona
 */
export function getPatternsForPersona(personaId: string): DisfluencyPatterns {
  return PERSONA_DISFLUENCIES[personaId] || DEFAULT_DISFLUENCIES;
}
