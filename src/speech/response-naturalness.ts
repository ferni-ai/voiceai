/**
 * Response Naturalness Module
 *
 * Makes AI responses feel more human through:
 * - Acknowledgment prefixes ("Mm-hmm. So...")
 * - Thinking fillers during delays ("Let me think...")
 * - Catchphrase integration
 * - Response warmth markers
 */

import { log } from '@livekit/agents';
import { breakTag } from '../ssml/cartesia.js';

const getLogger = () => log();

// ============================================================================
// ACKNOWLEDGMENT PREFIXES
// ============================================================================

/**
 * Persona-specific acknowledgment prefixes
 * Added before responses to show active listening
 */
export const ACKNOWLEDGMENT_PREFIXES: Record<
  string,
  {
    neutral: string[];
    engaged: string[];
    empathetic: string[];
    excited: string[];
    thoughtful: string[];
  }
> = {
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

  maya: {
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

  jordan: {
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

  alex: {
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
};

// Alias jack-b to ferni
ACKNOWLEDGMENT_PREFIXES['jack-b'] = ACKNOWLEDGMENT_PREFIXES['ferni'];

/**
 * Determine the appropriate acknowledgment mood based on context
 */
export function determineAcknowledgmentMood(
  userEmotion?: string,
  topicWeight?: 'light' | 'medium' | 'heavy',
  isQuestion?: boolean,
  isExciting?: boolean
): 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful' {
  // Empathetic for heavy topics or distressed user
  if (
    topicWeight === 'heavy' ||
    ['sad', 'anxious', 'stressed', 'worried'].includes(userEmotion || '')
  ) {
    return 'empathetic';
  }

  // Excited for positive emotions or exciting news
  if (isExciting || ['joy', 'excited', 'happy'].includes(userEmotion || '')) {
    return 'excited';
  }

  // Thoughtful for questions or analytical topics
  if (isQuestion) {
    return 'thoughtful';
  }

  // Engaged when user is sharing actively
  if (['curious', 'interested'].includes(userEmotion || '') || topicWeight === 'medium') {
    return 'engaged';
  }

  return 'neutral';
}

/**
 * Get acknowledgment prefix for a response
 */
export function getAcknowledgmentPrefix(
  personaId: string,
  mood: 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful' = 'neutral'
): string {
  const prefixes = ACKNOWLEDGMENT_PREFIXES[personaId];
  if (!prefixes) {
    return `${breakTag('200ms')}`;
  }

  const moodPrefixes = prefixes[mood] || prefixes.neutral;
  return moodPrefixes[Math.floor(Math.random() * moodPrefixes.length)];
}

/**
 * Should we add a prefix? (Not every response needs one)
 */
export function shouldAddPrefix(
  turnCount: number,
  isFollowUp: boolean,
  isGreeting: boolean
): boolean {
  // Don't prefix greetings
  if (isGreeting || turnCount === 0) {
    return false;
  }

  // Always prefix follow-up responses
  if (isFollowUp) {
    return true;
  }

  // Add prefix ~70% of the time for natural variation
  return Math.random() < 0.7;
}

// ============================================================================
// THINKING FILLERS
// ============================================================================

/**
 * Persona-specific thinking fillers
 * Used when LLM processing takes longer than expected
 */
export const THINKING_FILLERS: Record<string, string[]> = {
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

  maya: [
    `${breakTag('250ms')}Hmm...${breakTag('400ms')}that's a good one.${breakTag('300ms')}`,
    `${breakTag('200ms')}Let me think about this...${breakTag('400ms')}`,
    `${breakTag('250ms')}Okay...${breakTag('350ms')}`,
  ],

  jordan: [
    `${breakTag('200ms')}Ooh!${breakTag('300ms')}Let me think...${breakTag('350ms')}`,
    `${breakTag('200ms')}Hmm!${breakTag('350ms')}`,
    `${breakTag('200ms')}Good question!${breakTag('300ms')}`,
  ],

  alex: [
    `${breakTag('200ms')}One moment...${breakTag('400ms')}`,
    `${breakTag('200ms')}Let me check...${breakTag('350ms')}`,
    `${breakTag('200ms')}Processing...${breakTag('300ms')}`,
  ],

  ferni: [
    `${breakTag('250ms')}Hmm...${breakTag('400ms')}let me think about that.${breakTag('350ms')}`,
    `${breakTag('200ms')}Good question!${breakTag('400ms')}`,
    `${breakTag('250ms')}Well...${breakTag('400ms')}`,
  ],
};

THINKING_FILLERS['jack-b'] = THINKING_FILLERS['ferni'];

/**
 * Get a thinking filler for a persona
 */
export function getThinkingFiller(personaId: string): string {
  const fillers = THINKING_FILLERS[personaId];
  if (!fillers) {
    return `${breakTag('300ms')}Hmm...${breakTag('400ms')}`;
  }
  return fillers[Math.floor(Math.random() * fillers.length)];
}

// ============================================================================
// CATCHPHRASE INTEGRATION
// ============================================================================

/**
 * Persona catchphrases that can be woven into responses
 * These should be used sparingly (1 per 3-4 exchanges)
 */
export const PERSONA_CATCHPHRASES: Record<
  string,
  {
    phrases: string[];
    emphasis: 'slow' | 'normal' | 'excited';
    ssmlWrapper: (phrase: string) => string;
  }
> = {
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

  maya: {
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

  jordan: {
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

  alex: {
    phrases: ["Let's get this done.", 'Efficient and effective.', 'On it.'],
    emphasis: 'normal',
    ssmlWrapper: (phrase) => `${breakTag('150ms')}${phrase}${breakTag('200ms')}`,
  },

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
};

// FIX BUG #voice-20: Legacy alias - map to canonical ferni
PERSONA_CATCHPHRASES['jack-b'] = PERSONA_CATCHPHRASES['ferni'];

// ============================================================================
// SESSION-SCOPED CATCHPHRASE TRACKING
// ============================================================================

// FIX BUG #voice-9 & #voice-16: Session-scoped tracking with configurable limits
interface CatchphraseConfig {
  maxPerSession: number;
  minTurnsBetween: number;
  positiveChance: number;
  defaultChance: number;
}

const CATCHPHRASE_CONFIG: CatchphraseConfig = {
  maxPerSession: 3,
  minTurnsBetween: 4,
  positiveChance: 0.4,
  defaultChance: 0.15,
};

/**
 * Session-scoped catchphrase usage tracker.
 * FIX BUG #voice-9: Use session-scoped manager instead of global map.
 */
export class CatchphraseTracker {
  private usage: Map<string, { lastUsed: number; count: number }> = new Map();
  private config: CatchphraseConfig;

  constructor(config: Partial<CatchphraseConfig> = {}) {
    this.config = { ...CATCHPHRASE_CONFIG, ...config };
  }

  shouldInject(personaId: string, turnCount: number, isPositiveMoment: boolean): boolean {
    const usage = this.usage.get(personaId) || { lastUsed: -10, count: 0 };

    if (usage.count >= this.config.maxPerSession) return false;
    if (turnCount - usage.lastUsed < this.config.minTurnsBetween) return false;

    const chance = isPositiveMoment ? this.config.positiveChance : this.config.defaultChance;

    if (Math.random() < chance) {
      this.usage.set(personaId, {
        lastUsed: turnCount,
        count: usage.count + 1,
      });
      return true;
    }

    return false;
  }

  reset(): void {
    this.usage.clear();
  }
}

// Global tracker for backward compatibility (will be deprecated)
const globalCatchphraseUsage: Map<string, { lastUsed: number; count: number }> = new Map();

/**
 * Should we inject a catchphrase?
 * @deprecated Use CatchphraseTracker for session-scoped tracking
 */
export function shouldInjectCatchphrase(
  personaId: string,
  turnCount: number,
  isPositiveMoment: boolean
): boolean {
  const usage = globalCatchphraseUsage.get(personaId) || { lastUsed: -10, count: 0 };

  // FIX BUG #voice-16: Use configurable constants instead of magic numbers
  if (usage.count >= CATCHPHRASE_CONFIG.maxPerSession) return false;
  if (turnCount - usage.lastUsed < CATCHPHRASE_CONFIG.minTurnsBetween) return false;

  const chance = isPositiveMoment ? CATCHPHRASE_CONFIG.positiveChance : CATCHPHRASE_CONFIG.defaultChance;

  if (Math.random() < chance) {
    globalCatchphraseUsage.set(personaId, {
      lastUsed: turnCount,
      count: usage.count + 1,
    });
    return true;
  }

  return false;
}

/**
 * Get a catchphrase with appropriate SSML
 */
export function getCatchphraseWithSsml(personaId: string): string | null {
  // FIX BUG #voice-20: Normalize persona ID to canonical form
  const normalizedId = personaId === 'jack-b' ? 'ferni' : personaId;
  const config = PERSONA_CATCHPHRASES[normalizedId] || PERSONA_CATCHPHRASES[personaId];
  if (!config) return null;

  const phrase = config.phrases[Math.floor(Math.random() * config.phrases.length)];
  return config.ssmlWrapper(phrase);
}

/**
 * Reset catchphrase tracking (for new session)
 * @deprecated Use CatchphraseTracker.reset() for session-scoped tracking
 */
export function resetCatchphraseTracking(): void {
  globalCatchphraseUsage.clear();
}

// ============================================================================
// COMBINED RESPONSE ENHANCEMENT
// ============================================================================

export interface ResponseEnhancementOptions {
  personaId: string;
  turnCount: number;
  userEmotion?: string;
  topicWeight?: 'light' | 'medium' | 'heavy';
  isQuestion?: boolean;
  isFollowUp?: boolean;
  isGreeting?: boolean;
  isPositiveMoment?: boolean;
}

export interface ResponseEnhancement {
  prefix: string | null;
  suffix: string | null;
  shouldAddThinkingFiller: boolean;
}

/**
 * Get all response enhancements for a response
 */
export function getResponseEnhancements(options: ResponseEnhancementOptions): ResponseEnhancement {
  const {
    personaId,
    turnCount,
    userEmotion,
    topicWeight,
    isQuestion,
    isFollowUp = false,
    isGreeting = false,
    isPositiveMoment = false,
  } = options;

  let prefix: string | null = null;
  let suffix: string | null = null;

  // Add acknowledgment prefix
  if (shouldAddPrefix(turnCount, isFollowUp, isGreeting)) {
    const mood = determineAcknowledgmentMood(
      userEmotion,
      topicWeight,
      isQuestion,
      isPositiveMoment
    );
    prefix = getAcknowledgmentPrefix(personaId, mood);
  }

  // Maybe add catchphrase at end
  if (shouldInjectCatchphrase(personaId, turnCount, isPositiveMoment)) {
    suffix = getCatchphraseWithSsml(personaId);
  }

  return {
    prefix,
    suffix,
    shouldAddThinkingFiller: isQuestion === true, // More thinking for questions
  };
}

export default {
  getAcknowledgmentPrefix,
  getThinkingFiller,
  getCatchphraseWithSsml,
  getResponseEnhancements,
  resetCatchphraseTracking,
  determineAcknowledgmentMood,
  shouldAddPrefix,
  shouldInjectCatchphrase,
};
