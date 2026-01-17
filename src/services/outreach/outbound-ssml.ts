/**
 * Outbound Call SSML Enhancement
 *
 * Makes Ferni's outbound calls sound natural and human by adding:
 * - Natural pauses for breathing
 * - Emotional warmth
 * - Speed variations for emphasis
 * - Thoughtful hesitations
 *
 * USES CANONICAL PERSONA PROFILES from src/speech/voice-manager/config.ts
 *
 * @module outbound-ssml
 */

import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getEmotionProfile } from '../../speech/voice-manager/config.js';
import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// SSML TAG HELPERS (inlined to avoid layer violation with ssml/)
// ============================================================================

function breakTag(time: string): string {
  return `<break time="${time}"/>`;
}

function speedTag(ratio: number): string {
  const clamped = Math.max(0.6, Math.min(1.5, ratio));
  return `<speed ratio="${clamped.toFixed(2)}"/>`;
}

function emotionTag(emotion: string): string {
  return `<emotion value="${emotion}"/>`;
}

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface OutboundSsmlOptions {
  /** The persona making the call */
  personaId?: string;
  /** Type of call for appropriate tone */
  callType?: 'introduction' | 'check-in' | 'celebration' | 'support' | 'reminder';
  /** Relationship with recipient */
  relationshipStage?: 'new' | 'building' | 'established' | 'deep';
  /** Whether to add opening warmth */
  addOpeningWarmth?: boolean;
}

// Context-based emotion overrides (when call type warrants different emotion)
const CALL_TYPE_EMOTION_OVERRIDES: Record<string, string> = {
  celebration: 'excited',
  support: 'sympathetic',
};

// ============================================================================
// SSML ENHANCEMENT
// ============================================================================

/**
 * Enhance outbound call message with natural SSML
 *
 * Transforms plain text into human-sounding speech with:
 * - Opening warmth (emotion tag from persona's canonical profile)
 * - Natural pauses after sentences
 * - Breath pauses after names
 * - Thoughtful pacing for important phrases (using persona's defaultSpeed)
 * - Closing warmth
 */
export function enhanceOutboundMessage(message: string, options: OutboundSsmlOptions = {}): string {
  const {
    personaId = 'ferni',
    callType = 'introduction',
    relationshipStage = 'new',
    addOpeningWarmth = true,
  } = options;

  if (!message?.trim()) {
    return message;
  }

  // Get canonical emotion profile for this persona
  const emotionProfile = getEmotionProfile(personaId);

  let enhanced = message;

  // 1. Add opening emotion based on persona's canonical profile
  //    (with context overrides for support/celebration)
  if (addOpeningWarmth) {
    const baseEmotion = emotionProfile.defaultEmotion;
    const contextEmotion = CALL_TYPE_EMOTION_OVERRIDES[callType] || baseEmotion;
    enhanced = `${emotionTag(contextEmotion)}${enhanced}`;
  }

  // 2. Add natural pauses after sentences
  enhanced = enhanced.replace(/([.!?])(\s+)(?=[A-Z])/g, (match, punct, space) => {
    // Longer pause after questions (thinking time)
    const pauseMs = punct === '?' ? 400 : punct === '!' ? 300 : 350;
    return `${punct}${breakTag(`${pauseMs}ms`)} `;
  });

  // 3. Add breath pauses after names (first mention)
  // "Hey Sarah!" → "Hey Sarah!<break time='200ms'/>"
  enhanced = enhanced.replace(
    /^(Hey|Hi|Hello)\s+([A-Z][a-z]+)([!,])/i,
    (match, greeting, name, punct) => {
      return `${greeting} ${name}${punct}${breakTag('200ms')}`;
    }
  );

  // 4. Add thoughtful pauses before important phrases
  const thoughtfulPhrases = [
    'I just wanted',
    'I wanted you to know',
    'they wanted me',
    'they asked me',
    'no pressure',
    'take care',
    'thinking of you',
    "I'd love to",
    'I care about',
  ];

  for (const phrase of thoughtfulPhrases) {
    const regex = new RegExp(`(${phrase})`, 'gi');
    enhanced = enhanced.replace(regex, (match) => {
      return `${breakTag('150ms')}${match}`;
    });
  }

  // 5. Slow down for meaningful closings (using persona's natural speed as base)
  //    Meaningful phrases get slightly slower than persona's default
  const meaningfulClosings = [
    'Take care',
    'thinking of you',
    'Hope to chat',
    'I care about you',
    "you're not alone",
  ];

  // Calculate slowdown speed: 95% of persona's default speed (subtle but noticeable)
  const slowdownSpeed = Math.max(0.6, emotionProfile.defaultSpeed * 0.95);

  for (const closing of meaningfulClosings) {
    if (enhanced.toLowerCase().includes(closing.toLowerCase())) {
      enhanced = enhanced.replace(
        new RegExp(`(${closing}[^.!?]*)([.!?])`, 'gi'),
        (match, text, punct) => `${speedTag(slowdownSpeed)}${text}${punct}`
      );
    }
  }

  // 6. Add warmth shift for supportive phrases
  const supportivePhrases = [
    "you're not alone",
    "I'm here",
    "someone's in your corner",
    'cares about you',
  ];

  for (const phrase of supportivePhrases) {
    if (enhanced.toLowerCase().includes(phrase.toLowerCase())) {
      enhanced = enhanced.replace(
        new RegExp(phrase, 'gi'),
        (match) => `${emotionTag('sympathetic')}${match}`
      );
    }
  }

  // 7. Add slight pause before the sign-off
  enhanced = enhanced.replace(/(Take care[^.!?]*[.!?])$/i, (match) => {
    return `${breakTag('300ms')}${match}`;
  });

  log.debug(
    {
      personaId,
      callType,
      defaultEmotion: emotionProfile.defaultEmotion,
      defaultSpeed: emotionProfile.defaultSpeed,
      originalLength: message.length,
      enhancedLength: enhanced.length,
    },
    'Enhanced outbound message with SSML (using canonical persona profile)'
  );

  return enhanced;
}

/**
 * Create a warm introduction opening with SSML
 * Uses canonical persona emotion profiles and display names
 */
export function createWarmOpening(
  personaId: string,
  recipientName: string,
  referrerName?: string
): string {
  const profile = getEmotionProfile(personaId);
  const emotion = profile.defaultEmotion;
  const displayName = getPersonaDisplayName(personaId);

  if (referrerName) {
    // Friend referral
    return `${emotionTag(emotion)}Hey ${recipientName}!${breakTag('200ms')} This is ${displayName}${breakTag('150ms')} - a friend of ${referrerName}'s.${breakTag('350ms')}`;
  } else {
    // Direct check-in
    return `${emotionTag(emotion)}Hey ${recipientName}!${breakTag('200ms')} It's ${displayName}.${breakTag('300ms')}`;
  }
}

/**
 * Create a thoughtful closing with SSML
 */
export function createWarmClosing(recipientName: string, occasion?: string): string {
  if (occasion) {
    return `${breakTag('300ms')}${speedTag(0.9)}${emotionTag('affectionate')}${occasion === 'Christmas' ? 'Merry Christmas' : `Happy ${occasion}`}, ${recipientName}!${breakTag('200ms')} Take care of yourself.`;
  }

  return `${breakTag('300ms')}${speedTag(0.9)}${emotionTag('affectionate')}Take care, ${recipientName}!`;
}

// ============================================================================
// QUICK HELPERS
// ============================================================================

/**
 * Add a thoughtful pause (for transitions, important points)
 */
export function thoughtfulPause(ms = 200): string {
  return breakTag(`${ms}ms`);
}

/**
 * Wrap text in warm emotion
 */
export function warmWrap(text: string): string {
  return `${emotionTag('affectionate')}${text}`;
}

/**
 * Wrap text in curious/interested emotion
 */
export function curiousWrap(text: string): string {
  return `${emotionTag('curious')}${text}`;
}

/**
 * Slow down important text
 * @param text - Text to slow down
 * @param speed - Speed ratio (0.6-1.5), or leave undefined to use 0.85
 * @param personaId - Optional persona ID to calculate relative slowdown
 */
export function emphasize(text: string, speed?: number, personaId?: string): string {
  let effectiveSpeed = speed ?? 0.85;

  // If persona provided, calculate relative slowdown
  if (personaId && speed === undefined) {
    const profile = getEmotionProfile(personaId);
    effectiveSpeed = Math.max(0.6, profile.defaultSpeed * 0.9);
  }

  return `${speedTag(effectiveSpeed)}${text}`;
}
