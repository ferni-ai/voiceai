/**
 * Persona Phrases - Single Source of Truth
 *
 * All persona-specific phrases consolidated in one place.
 * This prevents duplication across backchanneling, response-naturalness, etc.
 *
 * @module persona-phrases
 */

import { breakTag } from '../ssml/cartesia.js';

// ============================================================================
// PERSONA IDS
// ============================================================================

export type PersonaId =
  | 'ferni'
  | 'jack-b' // Legacy alias for ferni
  | 'nayan-patel'
  | 'peter-john'
  | 'maya-santos'
  | 'maya' // Short alias
  | 'jordan-taylor'
  | 'jordan' // Short alias
  | 'alex-chen'
  | 'alex'; // Short alias

/**
 * Normalize persona ID to canonical form
 */
export function normalizePersonaId(personaId: string): string {
  const aliases: Record<string, string> = {
    'jack-b': 'ferni',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    alex: 'alex-chen',
  };
  return aliases[personaId] || personaId;
}

// ============================================================================
// BACKCHANNEL TYPES
// ============================================================================

export type BackchannelEmotionType =
  | 'neutral'
  | 'engaged'
  | 'empathetic'
  | 'excited'
  | 'supportive';

export type BackchannelCategory =
  | 'acknowledgment' // "Mm-hmm", "Yeah"
  | 'understanding' // "I see", "Got it"
  | 'encouragement' // "Go on", "Tell me more"
  | 'empathy' // "Mmm", "Oh", "I hear you"
  | 'agreement' // "Right", "Exactly"
  | 'surprise' // "Oh!", "Wow"
  | 'thinking'; // "Hmm", "Interesting"

// ============================================================================
// SOFT BACKCHANNELS (Ultra-short, for live overlays)
// ============================================================================

export const SOFT_BACKCHANNELS: Record<string, Record<BackchannelEmotionType, string[]>> = {
  ferni: {
    neutral: ['Mm', 'Yeah', 'Mhm', 'Right'],
    engaged: ['Oh', 'Mm', 'Yeah'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    excited: ['Oh!', 'Yeah!', 'Mm!'],
    supportive: ['Mm', 'Yeah', 'I understand'],
  },
  'nayan-patel': {
    neutral: ['Mm', 'Yes', 'Indeed'],
    engaged: ['Mm', 'Yes', 'Ah'],
    empathetic: ['Mm', 'Yes', 'I see'],
    excited: ['Ah!', 'Yes!', 'Indeed'],
    supportive: ['Yes', 'I understand', 'Mm'],
  },
  'peter-john': {
    neutral: ['Mm', 'Yeah', 'Okay'],
    engaged: ['Oh!', 'Yeah!', 'Interesting'],
    empathetic: ['Mm', 'Yeah', 'Right'],
    excited: ['Oh!', 'Yeah!', 'Wow!'],
    supportive: ['Yeah', 'I get it', 'Mm'],
  },
  'maya-santos': {
    neutral: ['Mm', 'Yeah', 'Okay'],
    engaged: ['Oh', 'Yeah', 'Right'],
    empathetic: ['Mm', 'Yeah', 'I hear you'],
    excited: ['Oh!', 'Yeah!', "That's great!"],
    supportive: ['Yeah', 'I understand', 'Mm'],
  },
  'jordan-taylor': {
    neutral: ['Yeah', 'Mhm', 'Uh-huh'],
    engaged: ['Oh!', 'Yeah!', 'Mhm!'],
    empathetic: ['Mm', 'Yeah', 'Oh'],
    excited: ['Yes!', 'Oh!', 'Awesome!'],
    supportive: ['Yeah', 'I hear you', 'Mm'],
  },
  'alex-chen': {
    neutral: ['Mm', 'Yeah', 'Got it'],
    engaged: ['Right', 'Yeah', 'Okay'],
    empathetic: ['Mm', 'Yeah', 'I see'],
    excited: ['Great', 'Perfect', 'Excellent'],
    supportive: ['Got it', 'Understood', 'Yeah'],
  },
};

// ============================================================================
// STANDARD BACKCHANNELS (Full phrases with SSML)
// ============================================================================

export const BACKCHANNEL_LIBRARY: Record<BackchannelCategory, string[]> = {
  acknowledgment: ['Mm-hmm', 'Mhm', 'Yeah', 'Yes', 'Uh-huh', 'Okay'],
  understanding: ['I see', 'Got it', 'I understand', 'Okay', 'Ah', 'Right'],
  encouragement: ['Go on', 'Tell me more', 'And then?', "I'm listening", 'Continue', "I'm here"],
  empathy: ['Mmm', 'Oh', 'I hear you', "That's...", 'I feel that', 'Yeah...'],
  agreement: ['Right', 'Exactly', 'Absolutely', 'Yes', 'Definitely', "That's right"],
  surprise: ['Oh!', 'Wow', 'Really?', 'Oh wow', 'No kidding', 'Huh'],
  thinking: [
    'Hmm',
    'Interesting',
    'Hm',
    "That's interesting",
    'I see what you mean',
    'Let me think about that',
  ],
};

// ============================================================================
// PERSONA BACKCHANNEL STYLE
// ============================================================================

export interface PersonaBackchannelStyle {
  /** Preferred backchannel categories for this persona */
  preferred: BackchannelCategory[];
  /** Volume ratio for backchannels (0-1) */
  volumeRatio: number;
  /** Cartesia emotion tag to use */
  emotionTag?: string;
}

export const PERSONA_BACKCHANNEL_STYLE: Record<string, PersonaBackchannelStyle> = {
  ferni: {
    preferred: ['acknowledgment', 'empathy', 'encouragement'],
    volumeRatio: 0.75,
    emotionTag: 'affectionate',
  },
  'nayan-patel': {
    preferred: ['understanding', 'thinking', 'agreement'],
    volumeRatio: 0.8,
    emotionTag: 'calm',
  },
  'peter-john': {
    preferred: ['thinking', 'surprise', 'understanding'],
    volumeRatio: 0.75,
    emotionTag: 'curious',
  },
  'maya-santos': {
    preferred: ['acknowledgment', 'empathy', 'encouragement'],
    volumeRatio: 0.7,
    emotionTag: 'sympathetic',
  },
  'alex-chen': {
    preferred: ['understanding', 'agreement', 'thinking'],
    volumeRatio: 0.8,
    emotionTag: 'content',
  },
  'jordan-taylor': {
    preferred: ['acknowledgment', 'surprise', 'encouragement'],
    volumeRatio: 0.75,
    emotionTag: 'enthusiastic',
  },
};

// ============================================================================
// ACKNOWLEDGMENT PREFIXES (Added before responses)
// ============================================================================

export type AcknowledgmentMood = 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful';

export const ACKNOWLEDGMENT_PREFIXES: Record<string, Record<AcknowledgmentMood, string[]>> = {
  ferni: {
    neutral: [
      `Mm-hmm.${breakTag('200ms')}`,
      `Yeah.${breakTag('200ms')}`,
      `Okay.${breakTag('200ms')}So,${breakTag('150ms')}`,
    ],
    engaged: [
      `Oh!${breakTag('200ms')}I like where this is going!${breakTag('250ms')}`,
      `Tell me more!${breakTag('200ms')}Actually—${breakTag('150ms')}`,
      `Yes!${breakTag('200ms')}`,
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
      `Good question.${breakTag('300ms')}`,
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
      `Good question.${breakTag('350ms')}`,
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
      `${breakTag('200ms')}Let me think...${breakTag('500ms')}`,
      `Well...${breakTag('400ms')}`,
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
      `Ooh, great question!${breakTag('200ms')}`,
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
      `Hmm, interesting...${breakTag('300ms')}`,
      `Let me think about that...${breakTag('400ms')}`,
      `Well, you know...${breakTag('300ms')}`,
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
      `Tell me more—${breakTag('150ms')}well, actually,${breakTag('200ms')}`,
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
      `That's a good question.${breakTag('300ms')}`,
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

// ============================================================================
// THINKING FILLERS (For LLM processing delays)
// ============================================================================

export const THINKING_FILLERS: Record<string, string[]> = {
  ferni: [
    `${breakTag('250ms')}Hmm...${breakTag('400ms')}let me think about that.${breakTag('350ms')}`,
    `${breakTag('200ms')}Good question!${breakTag('400ms')}`,
    `${breakTag('250ms')}Well...${breakTag('400ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('300ms')}Hmm...${breakTag('500ms')}let me think about that.${breakTag('400ms')}`,
    `${breakTag('200ms')}Well...${breakTag('600ms')}`,
    `${breakTag('300ms')}That's a good question.${breakTag('500ms')}`,
    `${breakTag('400ms')}You know...${breakTag('400ms')}`,
  ],
  'peter-john': [
    `${breakTag('200ms')}Ooh, interesting!${breakTag('300ms')}Let me think...${breakTag('400ms')}`,
    `${breakTag('200ms')}Hmm!${breakTag('400ms')}`,
    `${breakTag('200ms')}Oh, good question!${breakTag('300ms')}`,
    `${breakTag('200ms')}Well, you know what...${breakTag('400ms')}`,
  ],
  'maya-santos': [
    `${breakTag('250ms')}Hmm...${breakTag('400ms')}that's a good one.${breakTag('300ms')}`,
    `${breakTag('200ms')}Let me think about this...${breakTag('400ms')}`,
    `${breakTag('250ms')}Okay...${breakTag('350ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('200ms')}Ooh!${breakTag('300ms')}Let me think...${breakTag('350ms')}`,
    `${breakTag('200ms')}Hmm!${breakTag('350ms')}`,
    `${breakTag('200ms')}Good question!${breakTag('300ms')}`,
  ],
  'alex-chen': [
    `${breakTag('200ms')}One moment...${breakTag('400ms')}`,
    `${breakTag('200ms')}Let me check...${breakTag('350ms')}`,
    `${breakTag('200ms')}Processing...${breakTag('300ms')}`,
  ],
};

// ============================================================================
// CATCHPHRASES (Signature phrases for each persona)
// ============================================================================

export interface CatchphraseConfig {
  phrases: string[];
  emphasis: 'slow' | 'normal' | 'excited';
  ssmlWrapper: (phrase: string) => string;
}

export const PERSONA_CATCHPHRASES: Record<string, CatchphraseConfig> = {
  ferni: {
    phrases: [
      "You've got this.",
      "Let's figure this out together.",
      "I'm here for you.",
      'One step at a time.',
    ],
    emphasis: 'normal',
    ssmlWrapper: (phrase) =>
      `${breakTag('250ms')}<emotion value="affectionate">${phrase}</emotion>${breakTag('300ms')}`,
  },
  'nayan-patel': {
    phrases: [
      'Stay the course.',
      'Time in the market, not timing the market.',
      'Keep costs low.',
      "Don't look for the needle in the haystack. Buy the haystack.",
    ],
    emphasis: 'slow',
    ssmlWrapper: (phrase) =>
      `${breakTag('300ms')}<speed ratio="0.78"><emotion value="affectionate">${phrase}</emotion></speed>${breakTag('400ms')}`,
  },
  'peter-john': {
    phrases: [
      'Invest in what you know!',
      "Behind every stock is a company—find out what it's doing!",
      'Know what you own, and know why you own it!',
      'Everyone has the brainpower to follow the stock market!',
    ],
    emphasis: 'excited',
    ssmlWrapper: (phrase) =>
      `${breakTag('200ms')}<speed ratio="1.05"><emotion value="curious">${phrase}</emotion></speed>${breakTag('300ms')}`,
  },
  'maya-santos': {
    phrases: [
      'Progress, not perfection.',
      'Every dollar has a job.',
      "You're not alone in this.",
      'Small wins add up.',
    ],
    emphasis: 'normal',
    ssmlWrapper: (phrase) =>
      `${breakTag('250ms')}<emotion value="affectionate">${phrase}</emotion>${breakTag('300ms')}`,
  },
  'jordan-taylor': {
    phrases: [
      "Let's make it happen!",
      'The future you will thank you!',
      'This is exciting!',
      "We've got this!",
    ],
    emphasis: 'excited',
    ssmlWrapper: (phrase) =>
      `${breakTag('200ms')}<speed ratio="1.08"><emotion value="surprised">${phrase}</emotion></speed>${breakTag('250ms')}`,
  },
  'alex-chen': {
    phrases: ["Let's get this done.", 'Efficient and effective.', 'On it.'],
    emphasis: 'normal',
    ssmlWrapper: (phrase) => `${breakTag('150ms')}${phrase}${breakTag('200ms')}`,
  },
};

// ============================================================================
// BACKWARD COMPATIBILITY: ALIAS KEYS
// ============================================================================

// Many older callers (and some tests) use short/legacy persona IDs directly as keys
// into these exported maps. We keep those aliases pointing at canonical entries.
ACKNOWLEDGMENT_PREFIXES['jack-b'] = ACKNOWLEDGMENT_PREFIXES.ferni;
ACKNOWLEDGMENT_PREFIXES.maya = ACKNOWLEDGMENT_PREFIXES['maya-santos'];
ACKNOWLEDGMENT_PREFIXES.jordan = ACKNOWLEDGMENT_PREFIXES['jordan-taylor'];
ACKNOWLEDGMENT_PREFIXES.alex = ACKNOWLEDGMENT_PREFIXES['alex-chen'];

THINKING_FILLERS['jack-b'] = THINKING_FILLERS.ferni;
THINKING_FILLERS.maya = THINKING_FILLERS['maya-santos'];
THINKING_FILLERS.jordan = THINKING_FILLERS['jordan-taylor'];
THINKING_FILLERS.alex = THINKING_FILLERS['alex-chen'];

PERSONA_CATCHPHRASES['jack-b'] = PERSONA_CATCHPHRASES.ferni;
PERSONA_CATCHPHRASES.maya = PERSONA_CATCHPHRASES['maya-santos'];
PERSONA_CATCHPHRASES.jordan = PERSONA_CATCHPHRASES['jordan-taylor'];
PERSONA_CATCHPHRASES.alex = PERSONA_CATCHPHRASES['alex-chen'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get soft backchannel for a persona
 */
export function getSoftBackchannel(
  personaId: string,
  emotionType: BackchannelEmotionType = 'neutral'
): string {
  const normalized = normalizePersonaId(personaId);
  const phrases = SOFT_BACKCHANNELS[normalized]?.[emotionType] ?? SOFT_BACKCHANNELS.ferni.neutral;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get acknowledgment prefix for a persona
 */
export function getAcknowledgmentPrefix(
  personaId: string,
  mood: AcknowledgmentMood = 'neutral'
): string {
  const normalized = normalizePersonaId(personaId);
  const prefixes = ACKNOWLEDGMENT_PREFIXES[normalized];
  if (!prefixes) {
    return `${breakTag('200ms')}`;
  }
  const moodPrefixes = prefixes[mood] || prefixes.neutral;
  return moodPrefixes[Math.floor(Math.random() * moodPrefixes.length)];
}

/**
 * Get thinking filler for a persona
 */
export function getThinkingFiller(personaId: string): string {
  const normalized = normalizePersonaId(personaId);
  const fillers = THINKING_FILLERS[normalized];

  // For unknown personas, return a stable, "safe" default (tests expect "Hmm")
  if (!fillers) {
    return THINKING_FILLERS.ferni[0];
  }

  return fillers[Math.floor(Math.random() * fillers.length)];
}

/**
 * Get catchphrase with SSML wrapping
 */
export function getCatchphraseWithSsml(personaId: string): string | null {
  const normalized = normalizePersonaId(personaId);
  const config = PERSONA_CATCHPHRASES[normalized];
  if (!config) return null;
  const phrase = config.phrases[Math.floor(Math.random() * config.phrases.length)];
  return config.ssmlWrapper(phrase);
}

/**
 * Get backchannel style for a persona
 */
export function getPersonaBackchannelStyle(personaId: string): PersonaBackchannelStyle {
  const normalized = normalizePersonaId(personaId);
  return PERSONA_BACKCHANNEL_STYLE[normalized] ?? PERSONA_BACKCHANNEL_STYLE.ferni;
}

/**
 * Get a backchannel phrase from a category
 */
export function getBackchannelPhrase(category: BackchannelCategory): string {
  const phrases = BACKCHANNEL_LIBRARY[category];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Data
  SOFT_BACKCHANNELS,
  BACKCHANNEL_LIBRARY,
  PERSONA_BACKCHANNEL_STYLE,
  ACKNOWLEDGMENT_PREFIXES,
  THINKING_FILLERS,
  PERSONA_CATCHPHRASES,
  // Helpers
  normalizePersonaId,
  getSoftBackchannel,
  getAcknowledgmentPrefix,
  getThinkingFiller,
  getCatchphraseWithSsml,
  getPersonaBackchannelStyle,
  getBackchannelPhrase,
};
