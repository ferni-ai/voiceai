/**
 * Anticipatory Prosody System
 *
 * Inspired by Sesame AI's ability to react before the user finishes speaking.
 * This module analyzes partial transcripts to prepare emotional responses
 * in advance, creating a more natural, present feeling.
 *
 * Key capabilities:
 * - Detect emotional trajectory from partial input
 * - Prepare appropriate emotional response before user finishes
 * - Generate opening micro-reactions for immediate response
 * - Adjust prosody based on predicted content
 *
 * @module speech/sesame-inspired/anticipatory-prosody
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { AnticipatedResponse, PartialTranscript, EmotionalTrajectory } from './types.js';

const log = createLogger({ module: 'AnticipatoryProsody' });

// =============================================================================
// EMOTIONAL TRAJECTORY PATTERNS
// =============================================================================

/**
 * Patterns that indicate emotional trajectory in partial speech
 */
const TRAJECTORY_PATTERNS = {
  rising_excitement: [
    /\b(guess what|you won't believe|amazing|incredible|finally|I did it|we did it)\b/i,
    /\b(so excited|can't wait|just happened|best news)\b/i,
    /!+$/,
  ],
  rising_concern: [
    /\b(worried about|scared|nervous|anxious|I think something|not sure if)\b/i,
    /\b(I'm afraid|what if|might be|could be wrong)\b/i,
  ],
  falling_sadness: [
    /\b(I lost|they died|passed away|broke up|ended|failed|didn't work)\b/i,
    /\b(sad news|bad news|unfortunately|I'm sorry to say)\b/i,
    /\b(miss them|miss her|miss him|gone forever)\b/i,
  ],
  building_frustration: [
    /\b(so frustrated|can't believe|again and again|keeps happening)\b/i,
    /\b(sick of|tired of|fed up|had enough|this is ridiculous)\b/i,
    /\b(why does|why can't|why won't)\b/i,
  ],
  seeking_support: [
    /\b(need help|don't know what|confused about|struggling with)\b/i,
    /\b(what should I|how do I|can you help|I need)\b/i,
  ],
  sharing_vulnerability: [
    /\b(never told anyone|between us|honestly|the truth is)\b/i,
    /\b(I've been|I'm feeling|I feel like|sometimes I)\b/i,
    /\b(hard to admit|embarrassed|ashamed)\b/i,
  ],
  expressing_gratitude: [
    /\b(thank you|so grateful|means so much|appreciate)\b/i,
    /\b(you helped|because of you|couldn't have)\b/i,
  ],
  joking_playful: [
    /\b(funny thing|you know what's|hilarious|get this)\b/i,
    /\b(joking|kidding|just messing|haha|lol)\b/i,
  ],
} as const;

/**
 * Map trajectories to anticipated emotions
 */
const TRAJECTORY_TO_EMOTION: Record<keyof typeof TRAJECTORY_PATTERNS, CartesiaEmotion> = {
  rising_excitement: 'excited',
  rising_concern: 'sympathetic',
  falling_sadness: 'sympathetic',
  building_frustration: 'sympathetic',
  seeking_support: 'affectionate',
  sharing_vulnerability: 'affectionate',
  expressing_gratitude: 'affectionate',
  joking_playful: 'joking/comedic',
};

/**
 * Opening micro-reactions for each trajectory
 */
const TRAJECTORY_TO_OPENING: Record<keyof typeof TRAJECTORY_PATTERNS, string[]> = {
  rising_excitement: [
    '<emotion value="excited"/>Oh!<break time="100ms"/>',
    '<emotion value="surprised"/>Wait—<break time="100ms"/>',
    '<emotion value="curious"/>Ooh!<break time="80ms"/>',
  ],
  rising_concern: [
    '<emotion value="sympathetic"/><speed ratio="0.9"/>Oh...<break time="150ms"/>',
    '<emotion value="sympathetic"/>Mm.<break time="100ms"/>',
  ],
  falling_sadness: [
    '<emotion value="sympathetic"/><speed ratio="0.85"/><volume ratio="0.85"/>Oh...<break time="200ms"/>',
    '<emotion value="sympathetic"/><speed ratio="0.8"/>I...<break time="150ms"/>',
    '<speed ratio="0.85"/><volume ratio="0.8"/><break time="200ms"/>',
  ],
  building_frustration: [
    '<emotion value="sympathetic"/>Ugh.<break time="100ms"/>',
    '<emotion value="sympathetic"/>I hear you.<break time="100ms"/>',
  ],
  seeking_support: [
    '<emotion value="affectionate"/><speed ratio="0.95"/>Okay.<break time="100ms"/>',
    '<emotion value="calm"/>Mm-hmm.<break time="100ms"/>',
  ],
  sharing_vulnerability: [
    '<emotion value="affectionate"/><speed ratio="0.9"/><volume ratio="0.9"/><break time="200ms"/>',
    '<emotion value="sympathetic"/><speed ratio="0.85"/>Hey.<break time="150ms"/>',
  ],
  expressing_gratitude: [
    '<emotion value="affectionate"/>Aww.<break time="100ms"/>',
    '<emotion value="happy"/>Oh!<break time="80ms"/>',
  ],
  joking_playful: [
    '<emotion value="joking/comedic"/>Ha!<break time="80ms"/>',
    '<emotion value="happy"/>Oh!<break time="80ms"/>',
  ],
};

// =============================================================================
// PROSODY ADJUSTMENTS
// =============================================================================

/**
 * Speed/volume adjustments for each trajectory
 */
const TRAJECTORY_PROSODY: Record<
  keyof typeof TRAJECTORY_PATTERNS,
  { speed: number; volume: number }
> = {
  rising_excitement: { speed: 1.1, volume: 1.1 },
  rising_concern: { speed: 0.9, volume: 0.95 },
  falling_sadness: { speed: 0.8, volume: 0.8 },
  building_frustration: { speed: 0.95, volume: 1.0 },
  seeking_support: { speed: 0.95, volume: 0.95 },
  sharing_vulnerability: { speed: 0.85, volume: 0.85 },
  expressing_gratitude: { speed: 0.95, volume: 1.0 },
  joking_playful: { speed: 1.05, volume: 1.05 },
};

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Detect emotional trajectory from partial transcript
 */
export function detectTrajectory(partial: PartialTranscript): EmotionalTrajectory {
  const text = partial.text.toLowerCase();

  // Check for volatility (multiple contrasting emotions)
  let positiveCount = 0;
  let negativeCount = 0;

  for (const [key, patterns] of Object.entries(TRAJECTORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (key.includes('excitement') || key.includes('gratitude') || key.includes('playful')) {
          positiveCount++;
        } else {
          negativeCount++;
        }
      }
    }
  }

  if (positiveCount > 0 && negativeCount > 0) {
    return 'volatile';
  }

  // Check user tone if available
  if (partial.tone === 'excited') return 'rising';
  if (partial.tone === 'sad' || partial.tone === 'frustrated') return 'falling';

  // Check speech rate
  if (partial.userSpeechRate === 'fast') return 'rising';
  if (partial.userSpeechRate === 'slow') return 'falling';

  return 'stable';
}

/**
 * Get anticipated emotional trajectory type from text
 */
export function detectTrajectoryType(
  text: string
): keyof typeof TRAJECTORY_PATTERNS | null {
  const lowerText = text.toLowerCase();

  for (const [key, patterns] of Object.entries(TRAJECTORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        return key as keyof typeof TRAJECTORY_PATTERNS;
      }
    }
  }

  return null;
}

/**
 * Anticipate emotional response from partial transcript
 *
 * Call this as the user is speaking to prepare the response prosody
 * BEFORE they finish. This is what Sesame calls "voice presence".
 *
 * @param partial - Partial transcript while user is speaking
 * @returns Anticipated response parameters
 */
export function anticipateResponse(partial: PartialTranscript): AnticipatedResponse {
  const trajectoryType = detectTrajectoryType(partial.text);

  if (!trajectoryType) {
    // No strong signal - return neutral with moderate confidence
    return {
      emotion: 'calm',
      confidence: 0.3,
      speed: 1.0,
      volume: 1.0,
      reason: 'No strong emotional signal detected',
    };
  }

  const emotion = TRAJECTORY_TO_EMOTION[trajectoryType];
  const prosody = TRAJECTORY_PROSODY[trajectoryType];
  const openings = TRAJECTORY_TO_OPENING[trajectoryType];

  // Select random opening reaction
  const openingReaction = openings[Math.floor(Math.random() * openings.length)];

  // Calculate confidence based on multiple signals
  let confidence = 0.6; // Base confidence for pattern match

  // Boost confidence if user tone matches
  if (
    (partial.tone === 'excited' && trajectoryType.includes('excitement')) ||
    (partial.tone === 'sad' && trajectoryType.includes('sadness')) ||
    (partial.tone === 'frustrated' && trajectoryType.includes('frustration'))
  ) {
    confidence += 0.2;
  }

  // Boost confidence if speech rate matches
  if (
    (partial.userSpeechRate === 'fast' && trajectoryType.includes('excitement')) ||
    (partial.userSpeechRate === 'slow' &&
      (trajectoryType.includes('sadness') || trajectoryType.includes('vulnerability')))
  ) {
    confidence += 0.1;
  }

  // Check for trailing silence (they might be done)
  if (partial.silenceMs && partial.silenceMs > 500) {
    confidence += 0.1; // They're likely done speaking
  }

  log.debug(
    {
      trajectoryType,
      emotion,
      confidence: confidence.toFixed(2),
      hasOpening: !!openingReaction,
    },
    'Anticipated emotional response'
  );

  return {
    emotion,
    confidence: Math.min(confidence, 1.0),
    speed: prosody.speed,
    volume: prosody.volume,
    openingReaction,
    reason: `Detected ${trajectoryType.replace(/_/g, ' ')} pattern`,
  };
}

/**
 * Check if we should start preparing a response
 *
 * Returns true when we have enough signal to start anticipating
 */
export function shouldAnticipate(partial: PartialTranscript): boolean {
  // Need at least a few words
  if (partial.text.split(/\s+/).length < 3) {
    return false;
  }

  // Check for strong emotional signals
  const trajectoryType = detectTrajectoryType(partial.text);
  if (trajectoryType) {
    return true;
  }

  // Check if user seems to be finishing (trailing silence)
  if (partial.silenceMs && partial.silenceMs > 300) {
    return true;
  }

  return false;
}

/**
 * Generate immediate micro-reaction for user content
 *
 * Use this for very fast (<100ms) reactions to user speech
 */
export function getImmediateMicroReaction(
  text: string,
  tone?: PartialTranscript['tone']
): string | null {
  const lowerText = text.toLowerCase();

  // Immediate reactions to specific content
  if (/\b(died|passed away|gone|lost)\b/.test(lowerText)) {
    return '<emotion value="sympathetic"/><speed ratio="0.8"/><volume ratio="0.75"/>Oh...<break time="200ms"/>';
  }

  if (/\b(got the job|I did it|we won|I passed|accepted)\b/i.test(lowerText)) {
    return '<emotion value="excited"/>YES!<break time="100ms"/>';
  }

  if (/\b(pregnant|having a baby|engaged|getting married)\b/i.test(lowerText)) {
    return '<emotion value="excited"/>Oh my gosh!<break time="100ms"/>';
  }

  if (/\b(broke up|divorced|leaving|ending)\b/i.test(lowerText)) {
    return '<emotion value="sympathetic"/><speed ratio="0.85"/>Oh...<break time="150ms"/>';
  }

  if (/\b(funny|hilarious|haha|lol)\b/i.test(lowerText)) {
    return '[laughter]<break time="80ms"/>';
  }

  // Tone-based reactions
  if (tone === 'excited') {
    return '<emotion value="curious"/>Ooh!<break time="80ms"/>';
  }

  if (tone === 'sad') {
    return '<emotion value="sympathetic"/><speed ratio="0.9"/>Mm.<break time="100ms"/>';
  }

  return null;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

interface AnticipatorySession {
  lastAnticipation: AnticipatedResponse | null;
  lastPartialText: string;
  anticipationCount: number;
}

const sessions = new Map<string, AnticipatorySession>();

/**
 * Get or create session state
 */
export function getAnticipatorySession(sessionId: string): AnticipatorySession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      lastAnticipation: null,
      lastPartialText: '',
      anticipationCount: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Update session with new anticipation
 */
export function updateAnticipation(
  sessionId: string,
  partial: PartialTranscript,
  anticipation: AnticipatedResponse
): void {
  const session = getAnticipatorySession(sessionId);
  session.lastAnticipation = anticipation;
  session.lastPartialText = partial.text;
  session.anticipationCount++;
}

/**
 * Get last anticipation for a session
 */
export function getLastAnticipation(sessionId: string): AnticipatedResponse | null {
  return sessions.get(sessionId)?.lastAnticipation ?? null;
}

/**
 * Reset session state
 */
export function resetAnticipatorySession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get active session count (for monitoring)
 */
export function getActiveAnticipatorySessionCount(): number {
  return sessions.size;
}
