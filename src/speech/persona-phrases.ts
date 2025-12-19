/**
 * Persona Phrases - Single Source of Truth
 *
 * All persona-specific phrases consolidated in one place.
 * This prevents duplication across backchanneling, response-naturalness, etc.
 *
 * INTEGRATION: Uses ProcessingIntelligence for thinking/processing phrases
 * when contextual composition is needed. Legacy THINKING_FILLERS are kept
 * for backward compatibility.
 *
 * @module persona-phrases
 */

import { getProcessingPhraseWithSSML } from '../intelligence/processing-intelligence.js';
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
  | 'encouragement' // "I'm here", "I'm with you" (NOT commands like "Tell me more")
  | 'empathy' // "Mmm", "I hear you"
  | 'agreement' // "Right", "Exactly"
  | 'surprise' // "Oh!", "Wow"
  | 'thinking'; // "Hmm", "Let me think"

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

// "Better Than Human" Backchannel Philosophy:
// - No questions without context ("Really?" "Is that so?" "And then?")
// - No commands ("Tell me more" "Go on" - these feel bossy)
// - Breath sounds that BLEND into silence, not interrupt it
export const BACKCHANNEL_LIBRARY: Record<BackchannelCategory, string[]> = {
  acknowledgment: ['Mm-hmm', 'Mm', 'Yeah', 'Mhm'],
  understanding: ['I see', 'Got it', 'Okay', 'Right'],
  encouragement: ["I'm here", "I'm with you", 'Take your time'],
  empathy: ['Mm', 'Yeah...', 'I hear you', 'I feel that'],
  agreement: ['Yeah', 'Right', 'Absolutely', "That's right"],
  surprise: ['Oh', 'Wow', 'Hm'],
  thinking: ['Hmm', 'Let me think', 'Hm', 'Let me see'],
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

// ============================================================================
// THINKING FILLERS (For LLM processing delays)
// ============================================================================

// IMPORTANT: Avoid "Good question" and "Well..." phrases - they sound like inner monologue
// These are spoken while the agent is thinking, NOT in response to questions
// Keep these SHORT and active - Ferni doesn't hedge or stall
/**
 * DEPRECATED: Use getContextAwareThinkingFiller() instead
 *
 * Thinking fillers that feel natural, not robotic.
 * Kept as internal fallback for ProcessingIntelligence errors.
 *
 * @deprecated Use getContextAwareThinkingFiller() for context-aware phrases
 * @internal Used only as fallback when ProcessingIntelligence fails
 */
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

const THINKING_FILLERS: Record<string, string[]> = {
  ferni: [
    // Breath sounds that feel complete
    `${breakTag('300ms')}Hmm.${breakTag('400ms')}`,
    `${breakTag('250ms')}Mm.${breakTag('350ms')}`,
    // Clear, complete processing signals
    `${breakTag('200ms')}Let me think.${breakTag('400ms')}`,
    `${breakTag('200ms')}Give me a moment.${breakTag('350ms')}`,
    `${breakTag('250ms')}Let me sit with that.${breakTag('400ms')}`,
  ],
  'nayan-patel': [
    // Wise, unhurried pauses - complete thoughts
    `${breakTag('400ms')}Hmm.${breakTag('500ms')}`,
    `${breakTag('350ms')}Mm.${breakTag('450ms')}`,
    `${breakTag('300ms')}Let me sit with that.${breakTag('500ms')}`,
    `${breakTag('350ms')}Worth considering.${breakTag('450ms')}`,
  ],
  'peter-john': [
    // Energetic but COMPLETE sounds
    `${breakTag('200ms')}Hmm!${breakTag('350ms')}`,
    `${breakTag('200ms')}Let me think here.${breakTag('350ms')}`,
    `${breakTag('250ms')}Okay, let me consider this.${breakTag('400ms')}`,
  ],
  'maya-santos': [
    // Warm, present thinking
    `${breakTag('300ms')}Hmm.${breakTag('400ms')}`,
    `${breakTag('250ms')}Let me think about this.${breakTag('400ms')}`,
    `${breakTag('300ms')}Give me a moment.${breakTag('350ms')}`,
  ],
  'jordan-taylor': [
    // Enthusiastic but complete
    `${breakTag('200ms')}Hmm!${breakTag('300ms')}`,
    `${breakTag('200ms')}Let me see.${breakTag('350ms')}`,
    `${breakTag('250ms')}Okay, thinking.${breakTag('350ms')}`,
  ],
  'alex-chen': [
    // Efficient, clear signals
    `${breakTag('200ms')}One moment.${breakTag('350ms')}`,
    `${breakTag('250ms')}Let me think.${breakTag('350ms')}`,
    `${breakTag('200ms')}Mm.${breakTag('300ms')}`,
  ],
};

// ============================================================================
// TOOL FILLERS (Re-exported from tool-fillers.ts)
// ============================================================================

// Re-export tool fillers from dedicated module
export { getToolFiller, isLongRunningTool, TOOL_FILLERS } from './tool-fillers.js';

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
 *
 * @deprecated Use getContextAwareThinkingFiller for context-aware phrases
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
 * Get context-aware thinking/processing phrase
 *
 * Uses ProcessingIntelligence to compose the right phrase based on context.
 * This is the preferred method for new code.
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
  }
): string {
  const { type = 'thinking', weight = 'medium', ...rest } = options || {};

  try {
    return getProcessingPhraseWithSSML(type, weight, rest);
  } catch {
    // Fallback to legacy system if ProcessingIntelligence fails
    return getThinkingFiller(personaId);
  }
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
// SUPERHUMAN VOICE: SILENCE PRESENCE PHRASES
// ============================================================================

/**
 * Silence presence phrases by persona.
 * Used when holding space in presence mode - comfortable silences with presence.
 */
export const SILENCE_PRESENCE_PHRASES: Record<string, string[]> = {
  ferni: [
    `${breakTag('250ms')}I'm here.${breakTag('400ms')}`,
    `${breakTag('300ms')}Take your time.${breakTag('500ms')}`,
    `${breakTag('350ms')}I'm not going anywhere.${breakTag('600ms')}`,
    `${breakTag('400ms')}...${breakTag('800ms')}`,
    `${breakTag('300ms')}You don't have to say anything.${breakTag('600ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('400ms')}I'm here with you.${breakTag('600ms')}`,
    `${breakTag('500ms')}...${breakTag('1000ms')}`,
    `${breakTag('450ms')}Take the time you need.${breakTag('700ms')}`,
    `${breakTag('400ms')}Breathe.${breakTag('800ms')}`,
  ],
  'peter-john': [
    `${breakTag('300ms')}I'm listening.${breakTag('450ms')}`,
    `${breakTag('350ms')}Take your time.${breakTag('500ms')}`,
    `${breakTag('300ms')}Go on.${breakTag('400ms')}`,
  ],
  'maya-santos': [
    `${breakTag('300ms')}I'm here.${breakTag('450ms')}`,
    `${breakTag('350ms')}I've got you.${breakTag('500ms')}`,
    `${breakTag('300ms')}Take all the time you need.${breakTag('550ms')}`,
    `${breakTag('400ms')}...${breakTag('700ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('250ms')}I'm here.${breakTag('400ms')}`,
    `${breakTag('300ms')}It's okay.${breakTag('450ms')}`,
    `${breakTag('350ms')}...${breakTag('600ms')}`,
  ],
  'alex-chen': [
    `${breakTag('250ms')}I'm here.${breakTag('350ms')}`,
    `${breakTag('300ms')}Take your time.${breakTag('400ms')}`,
    `${breakTag('250ms')}...${breakTag('500ms')}`,
  ],
};

// ============================================================================
// SUPERHUMAN VOICE: ANTICIPATORY COMFORT SOUNDS
// ============================================================================

/**
 * Anticipatory comfort sounds by persona and content type.
 * Emitted when detecting heavy content to show immediate presence.
 */
export const ANTICIPATORY_COMFORT_SOUNDS: Record<
  string,
  Record<'grief' | 'fear' | 'frustration' | 'general', string[]>
> = {
  ferni: {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.75"><speed ratio="0.8">Oh...</speed></volume>${breakTag('200ms')}`,
      `${breakTag('150ms')}<volume ratio="0.7"><speed ratio="0.75">Mm...</speed></volume>${breakTag('200ms')}`,
    ],
    fear: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">I hear you.</speed></volume>${breakTag('150ms')}`,
      `${breakTag('80ms')}<volume ratio="0.8">Mm.</volume>${breakTag('150ms')}`,
    ],
    frustration: [
      `${breakTag('80ms')}Yeah.${breakTag('100ms')}`,
      `${breakTag('100ms')}Ugh.${breakTag('100ms')}`,
    ],
    general: [
      `${breakTag('80ms')}<volume ratio="0.8">Mm.</volume>${breakTag('120ms')}`,
      `${breakTag('100ms')}<volume ratio="0.75">...</volume>${breakTag('150ms')}`,
    ],
  },
  'nayan-patel': {
    grief: [
      `${breakTag('150ms')}<volume ratio="0.7"><speed ratio="0.7">Mm...</speed></volume>${breakTag('300ms')}`,
      `${breakTag('200ms')}<volume ratio="0.65"><speed ratio="0.7">...</speed></volume>${breakTag('350ms')}`,
    ],
    fear: [
      `${breakTag('150ms')}<volume ratio="0.75"><speed ratio="0.8">I see.</speed></volume>${breakTag('200ms')}`,
    ],
    frustration: [`${breakTag('100ms')}<speed ratio="0.85">Yes.</speed>${breakTag('150ms')}`],
    general: [
      `${breakTag('150ms')}<volume ratio="0.75"><speed ratio="0.8">Mm.</speed></volume>${breakTag('200ms')}`,
    ],
  },
  'peter-john': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">Oh...</speed></volume>${breakTag('200ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Yeah...</volume>${breakTag('150ms')}`],
    frustration: [
      `${breakTag('80ms')}Yeah.${breakTag('100ms')}`,
      `${breakTag('100ms')}I get it.${breakTag('100ms')}`,
    ],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
  'maya-santos': {
    grief: [
      `${breakTag('120ms')}<volume ratio="0.75"><speed ratio="0.8">Oh...</speed></volume>${breakTag('200ms')}`,
      `${breakTag('150ms')}<volume ratio="0.7">Mm...</volume>${breakTag('200ms')}`,
    ],
    fear: [`${breakTag('100ms')}<volume ratio="0.8">I hear you.</volume>${breakTag('150ms')}`],
    frustration: [`${breakTag('80ms')}Yeah.${breakTag('100ms')}`],
    general: [`${breakTag('100ms')}<volume ratio="0.8">Mm.</volume>${breakTag('120ms')}`],
  },
  'jordan-taylor': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">Oh...</speed></volume>${breakTag('180ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Oh...</volume>${breakTag('120ms')}`],
    frustration: [
      `${breakTag('60ms')}Ugh.${breakTag('80ms')}`,
      `${breakTag('80ms')}Yeah!${breakTag('80ms')}`,
    ],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
  'alex-chen': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.9">I see.</speed></volume>${breakTag('150ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Got it.</volume>${breakTag('100ms')}`],
    frustration: [`${breakTag('60ms')}Right.${breakTag('80ms')}`],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
};

// ============================================================================
// SUPERHUMAN VOICE: EMOTIONAL TRANSITION BRIDGES
// ============================================================================

/**
 * Bridging sounds/phrases for emotional transitions per persona.
 * Prevents jarring shifts between emotions.
 */
export const EMOTIONAL_TRANSITION_BRIDGES: Record<
  string,
  Record<string, Record<string, string>>
> = {
  ferni: {
    sympathetic: {
      curious: `${breakTag('200ms')}<speed ratio="0.9">But you know...${breakTag('150ms')}</speed>`,
      happy: `${breakTag('250ms')}<speed ratio="0.92">And...${breakTag('150ms')}</speed>`,
      excited: `${breakTag('200ms')}But here's the thing—${breakTag('100ms')}`,
    },
    happy: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.88">Though...${breakTag('200ms')}</speed>`,
      curious: `${breakTag('100ms')}And—${breakTag('100ms')}`,
    },
    excited: {
      sympathetic: `${breakTag('250ms')}<speed ratio="0.85">That said...${breakTag('200ms')}</speed>`,
      calm: `${breakTag('200ms')}<speed ratio="0.9">Okay, so...${breakTag('150ms')}</speed>`,
    },
  },
  'nayan-patel': {
    sympathetic: {
      curious: `${breakTag('300ms')}<speed ratio="0.85">Now...${breakTag('200ms')}</speed>`,
      calm: `${breakTag('350ms')}<speed ratio="0.8">And yet...${breakTag('250ms')}</speed>`,
    },
    calm: {
      sympathetic: `${breakTag('300ms')}<speed ratio="0.8">Mm.${breakTag('200ms')}</speed>`,
      curious: `${breakTag('250ms')}<speed ratio="0.85">Consider...${breakTag('200ms')}</speed>`,
    },
  },
  'peter-john': {
    excited: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.9">But here's the thing...${breakTag('150ms')}</speed>`,
      calm: `${breakTag('150ms')}<speed ratio="0.95">Okay, so...${breakTag('100ms')}</speed>`,
    },
    curious: {
      excited: `${breakTag('100ms')}Oh!${breakTag('80ms')}`,
      sympathetic: `${breakTag('200ms')}<speed ratio="0.9">Ah...${breakTag('150ms')}</speed>`,
    },
  },
  'maya-santos': {
    sympathetic: {
      happy: `${breakTag('200ms')}<speed ratio="0.9">But...${breakTag('150ms')}</speed>`,
      curious: `${breakTag('150ms')}And—${breakTag('100ms')}`,
    },
    happy: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.85">Though...${breakTag('200ms')}</speed>`,
    },
  },
  'jordan-taylor': {
    excited: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.88">But...${breakTag('150ms')}</speed>`,
      calm: `${breakTag('150ms')}<speed ratio="0.92">Okay so...${breakTag('100ms')}</speed>`,
    },
    happy: {
      sympathetic: `${breakTag('180ms')}<speed ratio="0.9">Oh...${breakTag('150ms')}</speed>`,
    },
  },
  'alex-chen': {
    calm: {
      excited: `${breakTag('100ms')}Oh—${breakTag('80ms')}`,
      sympathetic: `${breakTag('150ms')}Right.${breakTag('100ms')}`,
    },
    curious: {
      sympathetic: `${breakTag('150ms')}<speed ratio="0.92">I see.${breakTag('100ms')}</speed>`,
    },
  },
};

// ============================================================================
// SUPERHUMAN VOICE HELPER FUNCTIONS
// ============================================================================

/**
 * Get a silence presence phrase for a persona
 */
export function getPersonaSilencePresencePhrase(personaId: string): string | null {
  const normalized = normalizePersonaId(personaId);
  const phrases = SILENCE_PRESENCE_PHRASES[normalized] || SILENCE_PRESENCE_PHRASES.ferni;
  if (phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get an anticipatory comfort sound for a persona and content type
 */
export function getPersonaAnticipatoryComfortSound(
  personaId: string,
  contentType: 'grief' | 'fear' | 'frustration' | 'general'
): string {
  const normalized = normalizePersonaId(personaId);
  const personaSounds =
    ANTICIPATORY_COMFORT_SOUNDS[normalized] || ANTICIPATORY_COMFORT_SOUNDS.ferni;
  const sounds = personaSounds[contentType] || personaSounds.general;
  return sounds[Math.floor(Math.random() * sounds.length)];
}

/**
 * Get an emotional transition bridge for a persona
 */
export function getPersonaEmotionalTransitionBridge(
  personaId: string,
  fromEmotion: string,
  toEmotion: string
): string | null {
  if (!fromEmotion || !toEmotion || fromEmotion === toEmotion) return null;

  const normalized = normalizePersonaId(personaId);
  const personaBridges =
    EMOTIONAL_TRANSITION_BRIDGES[normalized] || EMOTIONAL_TRANSITION_BRIDGES.ferni;
  const fromBridges = personaBridges[fromEmotion];
  if (!fromBridges) return null;

  return fromBridges[toEmotion] || null;
}

// Add backward compatibility aliases
SILENCE_PRESENCE_PHRASES['jack-b'] = SILENCE_PRESENCE_PHRASES.ferni;
SILENCE_PRESENCE_PHRASES.maya = SILENCE_PRESENCE_PHRASES['maya-santos'];
SILENCE_PRESENCE_PHRASES.jordan = SILENCE_PRESENCE_PHRASES['jordan-taylor'];
SILENCE_PRESENCE_PHRASES.alex = SILENCE_PRESENCE_PHRASES['alex-chen'];

ANTICIPATORY_COMFORT_SOUNDS['jack-b'] = ANTICIPATORY_COMFORT_SOUNDS.ferni;
ANTICIPATORY_COMFORT_SOUNDS.maya = ANTICIPATORY_COMFORT_SOUNDS['maya-santos'];
ANTICIPATORY_COMFORT_SOUNDS.jordan = ANTICIPATORY_COMFORT_SOUNDS['jordan-taylor'];
ANTICIPATORY_COMFORT_SOUNDS.alex = ANTICIPATORY_COMFORT_SOUNDS['alex-chen'];

EMOTIONAL_TRANSITION_BRIDGES['jack-b'] = EMOTIONAL_TRANSITION_BRIDGES.ferni;
EMOTIONAL_TRANSITION_BRIDGES.maya = EMOTIONAL_TRANSITION_BRIDGES['maya-santos'];
EMOTIONAL_TRANSITION_BRIDGES.jordan = EMOTIONAL_TRANSITION_BRIDGES['jordan-taylor'];
EMOTIONAL_TRANSITION_BRIDGES.alex = EMOTIONAL_TRANSITION_BRIDGES['alex-chen'];

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Data
  SOFT_BACKCHANNELS,
  BACKCHANNEL_LIBRARY,
  PERSONA_BACKCHANNEL_STYLE,
  ACKNOWLEDGMENT_PREFIXES,
  // THINKING_FILLERS - DEPRECATED: Use getContextAwareThinkingFiller instead
  PERSONA_CATCHPHRASES,
  // Superhuman voice data
  SILENCE_PRESENCE_PHRASES,
  ANTICIPATORY_COMFORT_SOUNDS,
  EMOTIONAL_TRANSITION_BRIDGES,
  // Helpers
  normalizePersonaId,
  getSoftBackchannel,
  getAcknowledgmentPrefix,
  // getThinkingFiller - DEPRECATED: Use getContextAwareThinkingFiller instead
  getContextAwareThinkingFiller, // Context-aware ProcessingIntelligence integration
  getCatchphraseWithSsml,
  getPersonaBackchannelStyle,
  getBackchannelPhrase,
  // Superhuman voice helpers
  getPersonaSilencePresencePhrase,
  getPersonaAnticipatoryComfortSound,
  getPersonaEmotionalTransitionBridge,
};
