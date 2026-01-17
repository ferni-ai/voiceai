/**
 * Backchannel Library
 *
 * "Better Than Human" Listening Philosophy:
 *
 * The best human listeners don't constantly interject—they're PRESENT.
 * They use breath sounds and soft resonance, not questions or commands.
 * A good listener never asks a question they don't know they asked.
 *
 * Our backchannels should:
 * 1. BLEND into silence, not interrupt it
 * 2. Be breath-like sounds that signal presence, not words that demand response
 * 3. Never sound like questions without context
 * 4. Never sound like commands ("Go on", "Tell me more")
 *
 * @module conversation/active-listening/backchannels
 */

import type { Backchannel, PersonaBackchannelStyle } from './types.js';

// ============================================================================
// BACKCHANNEL LIBRARY
// ============================================================================

export const BACKCHANNELS: Record<Backchannel['type'], Array<Omit<Backchannel, 'type'>>> = {
  // Soft presence sounds - blend into the silence
  acknowledgment: [
    { verbal: 'Mm-hmm.', ssml: '<volume ratio="0.8"/><break time="50ms"/>Mm-hmm.', energy: 'low' },
    { verbal: 'Mm.', ssml: '<volume ratio="0.75"/><break time="50ms"/>Mm.', energy: 'low' },
    { verbal: 'Yeah.', ssml: '<volume ratio="0.85"/>Yeah.', energy: 'low' },
    { verbal: 'Mhm.', ssml: '<volume ratio="0.8"/>Mhm.', energy: 'low' },
  ],
  // Gentle invitations - NOT commands. These should feel like an open door, not a push.
  encouragement: [
    {
      verbal: "I'm with you.",
      ssml: '<volume ratio="0.85"/><break time="100ms"/>I\'m with you.',
      energy: 'low',
    },
    {
      verbal: "I'm here.",
      ssml: '<volume ratio="0.8"/><break time="100ms"/>I\'m here.',
      energy: 'low',
    },
    {
      verbal: 'Take your time.',
      ssml: '<volume ratio="0.85"/><break time="150ms"/>Take your time.',
      energy: 'low',
    },
  ],
  // Holding space for heavy moments - soft, present, not reactive
  empathy: [
    { verbal: 'Mm.', ssml: '<volume ratio="0.7"/><break time="200ms"/>Mm.', energy: 'low' },
    {
      verbal: 'I hear you.',
      ssml: '<volume ratio="0.75"/><break time="200ms"/>I hear you.',
      energy: 'low',
    },
    { verbal: 'Yeah.', ssml: '<volume ratio="0.7"/><break time="150ms"/>Yeah.', energy: 'low' },
    {
      verbal: "That's a lot.",
      ssml: '<volume ratio="0.7"/><break time="250ms"/>That\'s a lot.',
      energy: 'low',
    },
    {
      verbal: 'I can imagine.',
      ssml: '<volume ratio="0.75"/><break time="200ms"/>I can imagine.',
      energy: 'low',
    },
  ],
  // Genuine interest - NOT questions. Just soft sounds of engagement.
  curiosity: [
    { verbal: 'Hmm.', ssml: '<volume ratio="0.85"/><break time="100ms"/>Hmm.', energy: 'low' },
    { verbal: 'Mm.', ssml: '<volume ratio="0.8"/><break time="80ms"/>Mm.', energy: 'low' },
    { verbal: 'Hm.', ssml: '<volume ratio="0.8"/><break time="80ms"/>Hm.', energy: 'low' },
  ],
  // Alignment - still warm, but these are for when user shares something positive
  agreement: [
    { verbal: 'Yeah.', ssml: 'Yeah.', energy: 'medium' },
    { verbal: 'Mm-hmm.', ssml: 'Mm-hmm.', energy: 'medium' },
    { verbal: 'Right.', ssml: '<break time="50ms"/>Right.', energy: 'medium' },
    { verbal: 'Absolutely.', ssml: 'Absolutely.', energy: 'medium' },
  ],
};

// ============================================================================
// PERSONA-SPECIFIC STYLES
// ============================================================================

export const PERSONA_BACKCHANNEL_STYLES: Record<string, PersonaBackchannelStyle> = {
  'nayan-patel': {
    preferred: ['acknowledgment', 'empathy'],
    energyBias: 'low',
    uniquePhrases: [
      {
        phrase: 'Mm.',
        type: 'acknowledgment',
        ssml: '<volume ratio="0.8"/><break time="150ms"/>Mm.',
      },
      {
        phrase: 'I see.',
        type: 'empathy',
        ssml: '<volume ratio="0.85"/><break time="150ms"/>I see.',
      },
    ],
  },
  ferni: {
    preferred: ['empathy', 'acknowledgment'],
    energyBias: 'low',
    uniquePhrases: [
      {
        phrase: 'I feel that.',
        type: 'empathy',
        ssml: '<volume ratio="0.8"/><break time="150ms"/>I feel that.',
      },
      {
        phrase: 'Mm.',
        type: 'acknowledgment',
        ssml: '<volume ratio="0.75"/><break time="100ms"/>Mm.',
      },
      {
        phrase: "I'm here.",
        type: 'encouragement',
        ssml: '<volume ratio="0.8"/><break time="200ms"/>I\'m here.',
      },
    ],
  },
  'peter-john': {
    preferred: ['acknowledgment', 'agreement'],
    energyBias: 'medium',
    uniquePhrases: [
      { phrase: 'Mm-hmm!', type: 'acknowledgment', ssml: 'Mm-hmm!' },
      { phrase: 'Yeah!', type: 'agreement', ssml: 'Yeah!' },
      { phrase: "You're onto something.", type: 'agreement', ssml: "You're onto something." },
    ],
  },
  'maya-santos': {
    preferred: ['empathy', 'acknowledgment'],
    energyBias: 'low',
    uniquePhrases: [
      { phrase: 'Mm.', type: 'acknowledgment', ssml: '<volume ratio="0.8"/>Mm.' },
      { phrase: 'Yeah.', type: 'empathy', ssml: '<volume ratio="0.85"/>Yeah.' },
      {
        phrase: "That's real progress.",
        type: 'agreement',
        ssml: '<break time="100ms"/>That\'s real progress.',
      },
    ],
  },
  'alex-chen': {
    preferred: ['acknowledgment', 'agreement'],
    energyBias: 'low',
    uniquePhrases: [
      { phrase: 'Mm-hmm.', type: 'acknowledgment', ssml: 'Mm-hmm.' },
      { phrase: 'Got it.', type: 'acknowledgment', ssml: 'Got it.' },
      { phrase: 'Makes sense.', type: 'agreement', ssml: 'Makes sense.' },
    ],
  },
  'jordan-taylor': {
    preferred: ['agreement', 'acknowledgment'],
    energyBias: 'medium',
    uniquePhrases: [
      { phrase: 'Mm-hmm!', type: 'acknowledgment', ssml: 'Mm-hmm!' },
      { phrase: 'Yeah!', type: 'agreement', ssml: 'Yeah!' },
      { phrase: 'I love that.', type: 'agreement', ssml: 'I love that.' },
    ],
  },
};

// ============================================================================
// SILENCE BACKCHANNELS
// ============================================================================

export const SILENCE_BACKCHANNELS: Array<Backchannel> = [
  {
    verbal: 'Mm-hmm.',
    ssml: '<volume ratio="0.75"/><break time="100ms"/>Mm-hmm.',
    type: 'acknowledgment',
    energy: 'low',
  },
  {
    verbal: "I'm here.",
    ssml: '<volume ratio="0.75"/><break time="150ms"/>I\'m here.',
    type: 'empathy',
    energy: 'low',
  },
  {
    verbal: 'Take your time.',
    ssml: '<volume ratio="0.75"/><break time="200ms"/>Take your time.',
    type: 'encouragement',
    energy: 'low',
  },
  {
    verbal: 'No rush.',
    ssml: '<volume ratio="0.75"/><break time="150ms"/>No rush.',
    type: 'encouragement',
    energy: 'low',
  },
];

// Emotion-specific silence backchannels
export const SAD_SILENCE_BACKCHANNELS: Array<Backchannel> = [
  {
    verbal: "I'm with you.",
    ssml: '<volume ratio="0.75"/><break time="200ms"/>I\'m with you.',
    type: 'empathy',
    energy: 'low',
  },
  {
    verbal: "It's okay.",
    ssml: '<volume ratio="0.75"/><break time="200ms"/>It\'s okay.',
    type: 'empathy',
    energy: 'low',
  },
];

// Persona-specific silence backchannels
export const FERNI_SILENCE_BACKCHANNEL: Backchannel = {
  verbal: 'Sit with it.',
  ssml: '<volume ratio="0.75"/><break time="200ms"/>Sit with it.',
  type: 'encouragement',
  energy: 'low',
};

export const NAYAN_SILENCE_BACKCHANNEL: Backchannel = {
  verbal: 'Thinking is good.',
  ssml: '<volume ratio="0.75"/><break time="150ms"/>Thinking is good.',
  type: 'acknowledgment',
  energy: 'low',
};
