/**
 * DJ Decision Engine - Pure Functions for DJ Decision Making
 *
 * This module contains ALL decision logic for the DJ system:
 * - When to duck audio
 * - When to speak intro/outro
 * - When to interject mid-song
 * - What moments to schedule
 *
 * All functions are PURE - they take state and return decisions with no side effects.
 * This makes the logic testable and the system predictable.
 *
 * @module audio/dj-decision-engine
 */

import type { MusicTrack } from './music-player.js';
import type { DJControllerState, DJState } from './dj-controller.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Probability constants for DJ moments
 *
 * HUMANIZATION: These are intentionally LOW. When someone asks for music,
 * they usually want to LISTEN to music, not hear constant DJ commentary.
 * Less is more - save the moments for truly special occasions.
 */
export const DJ_PROBABILITIES = {
  /** Chance of "wait for it..." buildup moment (8%) */
  BUILDUP: 0.08,
  /** Chance of "drop" reaction after buildup (15%) */
  DROP_AFTER_BUILDUP: 0.15,
  /** Chance of appreciation comment (5%) */
  APPRECIATION: 0.05,
  /** Chance of intro phrase (100% for non-ambient) */
  INTRO: 1.0,
  /** Chance of outro phrase (100% for non-ambient) */
  OUTRO: 1.0,
  /** Chance of track start interjection (15%) - from music-humanization */
  TRACK_START_INTERJECTION: 0.15,
} as const;

/**
 * Timing constants for DJ moments (in milliseconds)
 */
export const DJ_TIMING = {
  /** Minimum track duration to consider mid-song moments (20s) */
  MIN_DURATION_FOR_MOMENTS: 20000,
  /** Minimum track duration for appreciation (25s) */
  MIN_DURATION_FOR_APPRECIATION: 25000,
  /** Time before track end to start outro (5s) */
  OUTRO_LEAD_TIME: 5000,
  /** Check-in interval for very long tracks (60s) */
  CHECK_IN_INTERVAL: 60000,
  /** How fast to duck when agent speaks (300ms) */
  DUCK_FOR_AGENT: 300,
  /** How fast to duck when user speaks (150ms) */
  DUCK_FOR_USER: 150,
  /** How fast to restore volume (500ms) */
  VOLUME_RESTORE: 500,
  /** Delay before track start interjection (3s) */
  INTRO_INTERJECTION_DELAY: 3000,
} as const;

/**
 * Persona-specific DJ styles affecting decision thresholds
 */
export interface PersonaDJStyle {
  /** Persona identifier */
  personaId: string;
  /** Multiplier for interjection probabilities (0.5 = half as likely) */
  interjectionMultiplier: number;
  /** Multiplier for timing (1.5 = 50% longer delays) */
  timingMultiplier: number;
  /** Whether to do countdown announcements */
  doCountdowns: boolean;
}

/**
 * Default persona styles
 */
export const PERSONA_DJ_STYLES: Record<string, PersonaDJStyle> = {
  ferni: {
    personaId: 'ferni',
    interjectionMultiplier: 1.0,
    timingMultiplier: 1.0,
    doCountdowns: true,
  },
  maya: {
    personaId: 'maya',
    interjectionMultiplier: 0.5, // Maya is more mindful, less chatty
    timingMultiplier: 1.2,
    doCountdowns: false,
  },
  jordan: {
    personaId: 'jordan',
    interjectionMultiplier: 1.5, // Jordan is more hype
    timingMultiplier: 0.8,
    doCountdowns: true,
  },
  alex: {
    personaId: 'alex',
    interjectionMultiplier: 0.7, // Alex is more professional
    timingMultiplier: 1.0,
    doCountdowns: false,
  },
  peter: {
    personaId: 'peter',
    interjectionMultiplier: 0.6, // Peter is analytical, less chatty
    timingMultiplier: 1.1,
    doCountdowns: false,
  },
  nayan: {
    personaId: 'nayan',
    interjectionMultiplier: 0.4, // Nayan is wise and measured
    timingMultiplier: 1.3,
    doCountdowns: false,
  },
};

// ============================================================================
// TYPES
// ============================================================================

/**
 * Decision result for ducking
 */
export interface DuckDecision {
  shouldDuck: boolean;
  reason?: 'agent_speaking' | 'user_speaking' | 'urgent_topic';
  duckLevel?: number; // 0-1, how much to duck
}

/**
 * Decision result for intro speech
 */
export interface IntroDecision {
  shouldSpeak: boolean;
  delay: number; // ms to wait before speaking
  isInterjection: boolean; // true if "Oh I love this one", false if just track announcement
}

/**
 * Decision result for outro speech
 */
export interface OutroDecision {
  shouldSpeak: boolean;
  includeTrackInfo: boolean;
}

/**
 * Decision result for mid-song interjection
 */
export interface InterjectionDecision {
  shouldInterject: boolean;
  type?: 'buildup' | 'drop' | 'appreciation' | 'check-in';
  delayMs?: number;
}

/**
 * Scheduled moment definition
 */
export interface ScheduledMoment {
  type: 'buildup' | 'drop' | 'appreciation' | 'check-in' | 'outro';
  triggerTimeMs: number; // ms from track start
  probability: number; // 0-1, probability this actually fires
}

/**
 * Context for making decisions
 */
export interface DecisionContext {
  /** Current controller state */
  state: DJControllerState;
  /** Current track (if any) */
  track: MusicTrack | null;
  /** Persona ID for persona-aware decisions */
  personaId: string;
  /** Is user currently vibing (engaged with music)? */
  isVibing?: boolean;
  /** Did user ask a question? */
  userAskedQuestion?: boolean;
  /** Is there an urgent topic? */
  urgentTopic?: boolean;
  /** Time elapsed in track (ms) */
  trackElapsedMs?: number;
}

// ============================================================================
// PURE DECISION FUNCTIONS
// ============================================================================

/**
 * Get persona style, defaulting to Ferni if not found
 */
export function getPersonaStyle(personaId: string): PersonaDJStyle {
  return PERSONA_DJ_STYLES[personaId] ?? PERSONA_DJ_STYLES.ferni;
}

/**
 * Decide whether to duck audio
 *
 * @param context - Decision context
 * @returns Duck decision
 */
export function shouldDuck(context: DecisionContext): DuckDecision {
  const { state } = context;
  const currentState = state.state;

  // Already ducking - no change needed
  if (currentState === 'ducking') {
    return { shouldDuck: false };
  }

  // Can only duck if music is active (playing or fading)
  if (currentState !== 'playing' && currentState !== 'fading') {
    return { shouldDuck: false };
  }

  // Agent speaking - always duck
  if (state.isAgentSpeaking) {
    return {
      shouldDuck: true,
      reason: 'agent_speaking',
      duckLevel: 0.04, // 4% volume - nearly silent so voice dominates (was 15%)
    };
  }

  // User speaking - duck slightly less
  if (state.isUserSpeaking) {
    return {
      shouldDuck: true,
      reason: 'user_speaking',
      duckLevel: 0.08, // 8% volume (was 20%)
    };
  }

  // Urgent topic detected
  if (context.urgentTopic) {
    return {
      shouldDuck: true,
      reason: 'urgent_topic',
      duckLevel: 0.02, // 2% volume for urgent (was 10%)
    };
  }

  return { shouldDuck: false };
}

/**
 * Decide whether to speak an intro when track starts
 *
 * @param context - Decision context
 * @returns Intro decision
 */
export function shouldSpeakIntro(context: DecisionContext): IntroDecision {
  const { state, track, personaId } = context;

  // No track or ambient music - no intro
  if (!track || state.isAmbient) {
    return { shouldSpeak: false, delay: 0, isInterjection: false };
  }

  // Already ducking (someone speaking) - don't interrupt
  if (state.state === 'ducking' || state.isAgentSpeaking || state.isUserSpeaking) {
    return { shouldSpeak: false, delay: 0, isInterjection: false };
  }

  const style = getPersonaStyle(personaId);

  // Decide if we do a fun interjection vs just track announcement
  const interjectionProbability =
    DJ_PROBABILITIES.TRACK_START_INTERJECTION * style.interjectionMultiplier;
  const isInterjection = Math.random() < interjectionProbability;

  return {
    shouldSpeak: true,
    delay: isInterjection ? DJ_TIMING.INTRO_INTERJECTION_DELAY : 0,
    isInterjection,
  };
}

/**
 * Decide whether to speak an outro when track is ending
 *
 * @param context - Decision context
 * @returns Outro decision
 */
export function shouldSpeakOutro(context: DecisionContext): OutroDecision {
  const { state, track } = context;

  // No track or ambient music - no outro
  if (!track || state.isAmbient) {
    return { shouldSpeak: false, includeTrackInfo: false };
  }

  // Must be in fading state
  if (state.state !== 'fading') {
    return { shouldSpeak: false, includeTrackInfo: false };
  }

  // Include track info 30% of the time for variety
  const includeTrackInfo = Math.random() < 0.3;

  return {
    shouldSpeak: true,
    includeTrackInfo,
  };
}

/**
 * Decide whether to interject mid-song
 *
 * @param context - Decision context
 * @param momentType - Type of moment to consider
 * @returns Interjection decision
 */
export function shouldInterject(
  context: DecisionContext,
  momentType: 'buildup' | 'drop' | 'appreciation' | 'check-in'
): InterjectionDecision {
  const { state, personaId } = context;

  // Can't interject if not playing or if ducking
  if (state.state !== 'playing') {
    return { shouldInterject: false };
  }

  // Don't interject on ambient music
  if (state.isAmbient) {
    return { shouldInterject: false };
  }

  // Someone is speaking - don't interrupt
  if (state.isAgentSpeaking || state.isUserSpeaking) {
    return { shouldInterject: false };
  }

  const style = getPersonaStyle(personaId);

  // Get base probability for this moment type
  let baseProbability: number;
  switch (momentType) {
    case 'buildup':
      baseProbability = DJ_PROBABILITIES.BUILDUP;
      break;
    case 'drop':
      baseProbability = DJ_PROBABILITIES.DROP_AFTER_BUILDUP;
      break;
    case 'appreciation':
      baseProbability = DJ_PROBABILITIES.APPRECIATION;
      break;
    case 'check-in':
      baseProbability = 1.0; // Check-in always happens if scheduled
      break;
    default:
      baseProbability = 0;
  }

  // Apply persona multiplier
  const adjustedProbability = baseProbability * style.interjectionMultiplier;

  // Roll the dice
  const shouldInterject = Math.random() < adjustedProbability;

  return {
    shouldInterject,
    type: momentType,
  };
}

/**
 * Calculate what moments to schedule for a track
 *
 * @param track - The track to schedule for
 * @param personaId - Persona for style adjustments
 * @returns Array of moments to schedule
 */
export function calculateScheduledMoments(track: MusicTrack, personaId: string): ScheduledMoment[] {
  const duration = track.duration ?? 30000;
  const style = getPersonaStyle(personaId);
  const moments: ScheduledMoment[] = [];

  // 1. Buildup moment (55-70% through) - only for longer tracks
  if (duration > DJ_TIMING.MIN_DURATION_FOR_MOMENTS) {
    const buildupPercent = 0.55 + Math.random() * 0.15;
    const buildupTime = duration * buildupPercent;

    moments.push({
      type: 'buildup',
      triggerTimeMs: buildupTime,
      probability: DJ_PROBABILITIES.BUILDUP * style.interjectionMultiplier,
    });

    // 2. Drop moment (3s after buildup) - only if buildup is scheduled
    const dropTime = buildupTime + 3000;
    if (dropTime < duration - DJ_TIMING.OUTRO_LEAD_TIME) {
      moments.push({
        type: 'drop',
        triggerTimeMs: dropTime,
        probability: DJ_PROBABILITIES.DROP_AFTER_BUILDUP * style.interjectionMultiplier,
      });
    }
  }

  // 3. Appreciation (15-25s in) - for longer tracks
  if (duration > DJ_TIMING.MIN_DURATION_FOR_APPRECIATION) {
    const appreciationTime = 15000 + Math.random() * 10000;
    if (appreciationTime < duration - DJ_TIMING.OUTRO_LEAD_TIME) {
      moments.push({
        type: 'appreciation',
        triggerTimeMs: appreciationTime,
        probability: DJ_PROBABILITIES.APPRECIATION * style.interjectionMultiplier,
      });
    }
  }

  // 4. Check-in for very long tracks (60s+)
  if (duration > DJ_TIMING.CHECK_IN_INTERVAL) {
    moments.push({
      type: 'check-in',
      triggerTimeMs: DJ_TIMING.CHECK_IN_INTERVAL,
      probability: 1.0, // Always check in on long tracks
    });
  }

  // NOTE: Outro is NOT scheduled here!
  // The DJ Controller handles outro via 'should_speak_outro' event when track enters 'fading' state.
  // Previously we had duplicate outro triggers causing overlapping speech.

  return moments;
}

/**
 * Decide whether to interrupt music based on user activity
 *
 * @param params - Context about user activity
 * @returns Decision about interrupting
 */
export function shouldInterruptMusic(params: {
  isVibing: boolean;
  userStartedTalking: boolean;
  userAskedQuestion: boolean;
  urgentTopic: boolean;
}): { shouldInterrupt: boolean; action: 'duck' | 'stop' | 'none' } {
  const { isVibing, userStartedTalking, userAskedQuestion, urgentTopic } = params;

  // Urgent topic always interrupts (stop music)
  if (urgentTopic) {
    return { shouldInterrupt: true, action: 'stop' };
  }

  // User asked a question - duck but don't stop
  if (userAskedQuestion) {
    return { shouldInterrupt: true, action: 'duck' };
  }

  // User started extended talking - duck
  if (userStartedTalking && !isVibing) {
    return { shouldInterrupt: true, action: 'duck' };
  }

  // User is vibing - don't interrupt at all
  if (isVibing) {
    return { shouldInterrupt: false, action: 'none' };
  }

  return { shouldInterrupt: false, action: 'none' };
}

/**
 * Check if dead air detection should be active
 *
 * When music is playing, we should NOT trigger dead air responses.
 *
 * @param state - Current DJ controller state
 * @returns True if dead air detection should be active
 */
export function isDeadAirDetectionActive(state: DJControllerState): boolean {
  // Dead air detection is INACTIVE when music is active
  const musicActive =
    state.state === 'playing' ||
    state.state === 'ducking' ||
    state.state === 'fading' ||
    state.state === 'changing';

  return !musicActive;
}

/**
 * Calculate duck timing based on who is speaking
 *
 * @param reason - Why we're ducking
 * @returns Timing in ms
 */
export function getDuckTiming(reason: 'agent_speaking' | 'user_speaking' | 'external'): {
  duckMs: number;
  restoreMs: number;
} {
  switch (reason) {
    case 'agent_speaking':
      return { duckMs: DJ_TIMING.DUCK_FOR_AGENT, restoreMs: DJ_TIMING.VOLUME_RESTORE };
    case 'user_speaking':
      return { duckMs: DJ_TIMING.DUCK_FOR_USER, restoreMs: DJ_TIMING.VOLUME_RESTORE };
    case 'external':
    default:
      return { duckMs: DJ_TIMING.DUCK_FOR_AGENT, restoreMs: DJ_TIMING.VOLUME_RESTORE };
  }
}

/**
 * Determine if we should skip thinking music
 *
 * Don't play thinking music if:
 * - Regular music was explicitly stopped recently (user doesn't want music)
 * - Music is already playing
 *
 * @param state - Current DJ state
 * @param thresholdMs - How recently "explicit stop" counts (default 30s)
 * @returns True if thinking music should be skipped
 */
export function shouldSkipThinkingMusic(state: DJControllerState, thresholdMs = 30000): boolean {
  // Music is already playing
  if (state.state === 'playing' || state.state === 'ducking' || state.state === 'fading') {
    return true;
  }

  // User explicitly stopped music recently
  if (state.wasExplicitlyStopped && state.explicitStopTime) {
    const timeSinceStop = Date.now() - state.explicitStopTime;
    if (timeSinceStop < thresholdMs) {
      return true;
    }
  }

  return false;
}
