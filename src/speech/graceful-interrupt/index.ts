/**
 * Graceful Interrupt System
 *
 * Makes conversation interrupts feel natural rather than sharp/abrupt.
 *
 * PROBLEM: When users interrupt, the agent's speech just... stops.
 * Like a robot powering down mid-sentence. Jarring.
 *
 * SOLUTION: Multiple layers of smoothing:
 *
 * 1. CUSHIONING - Add micro-pauses throughout speech so any cut lands softly
 * 2. PRE-EMPTIVE TRAILING - When we sense interrupt coming, start fading BEFORE cut
 * 3. INTERRUPT RECOVERY - Start the next response softer, more human
 * 4. NATURAL PAUSE POINTS - Chunk responses so cuts land on pauses
 *
 * Human interruption example:
 * ```
 * Agent: "So what I think is— " [user starts "actually"]
 * Agent: "...you know... " ← trailing off (subliminal)
 * [hard cut from LiveKit]
 * Agent: "[soft breath] ...yeah?" ← recovery
 * ```
 *
 * @module speech/graceful-interrupt
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';

const log = createLogger({ module: 'GracefulInterrupt' });

// =============================================================================
// TYPES
// =============================================================================

export type InterruptPhase = 'normal' | 'sensing' | 'trailing' | 'recovering';

export interface InterruptState {
  /** Current phase in interrupt handling */
  phase: InterruptPhase;
  /** When we started sensing an interrupt */
  sensingStartedAt?: number;
  /** What triggered the sensing */
  sensingTrigger?: string;
  /** Whether we've injected trailing already */
  hasTrailed: boolean;
  /** The last sentence fragment before interrupt */
  lastFragment?: string;
  /** User's emotional state during interrupt */
  userEmotion?: string;
}

export interface CushionedResponse {
  /** SSML with cushioning micro-pauses */
  ssml: string;
  /** Natural break points (character positions) */
  breakPoints: number[];
  /** Recommended chunk boundaries */
  chunks: string[];
}

export interface RecoveryOptions {
  /** Was this a hard interrupt (wait/stop) or soft (just started talking)? */
  interruptType: 'hard' | 'soft';
  /** User's emotional state */
  userEmotion?: string;
  /** What we were saying when interrupted */
  wasAboutToSay?: string;
  /** The persona speaking */
  personaId: string;
}

export interface RecoverySsml {
  /** SSML prefix for recovery (soft breath, softer start) */
  prefix: string;
  /** Speed ratio to start at */
  initialSpeed: number;
  /** Volume ratio to start at */
  initialVolume: number;
  /** Optional verbal acknowledgment of interrupt */
  acknowledgment?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Micro-pause durations for cushioning
 *
 * These are subtle but make cuts land softer. When speech is interrupted,
 * having a micro-pause nearby means the cut happens in a natural gap
 * rather than mid-syllable.
 *
 * Slightly longer than typical reading pauses - optimized for
 * voice AI where cuts can happen at any moment.
 */
export const CUSHION_TIMING = {
  /** Pause after commas (subtle breath) */
  comma: 80,
  /** Pause after periods (natural break) */
  period: 120,
  /** Pause after emotional words (processing moment) */
  emotional: 100,
  /** Pause at clause boundaries (thinking beat) */
  clause: 90,
};

/**
 * How long to wait before considering user speech an interrupt signal
 */
const SENSING_THRESHOLD_MS = 150;

/**
 * Patterns that trigger immediate trailing (user wants to speak)
 */
export const TRAILING_TRIGGERS = [
  /^(wait|hold|actually|but|um|uh|no|well|so)/i,
  /^(i have|can i|let me|what about|how about)/i,
  /^(that's not|that isn't|no that|nope)/i,
];

/**
 * Recovery prefixes based on interrupt type
 *
 * Design philosophy: Softer is better. When someone interrupts,
 * they want to feel heard. A gentle, unhurried recovery shows we're
 * truly listening, not just pausing to let them speak.
 *
 * Timing guidelines:
 * - Hard interrupt: 350-450ms pause, 0.70-0.78 volume, 0.82-0.88 speed
 * - Soft interrupt: 200-280ms pause, 0.78-0.85 volume, 0.88-0.92 speed
 */
const RECOVERY_PREFIXES = {
  // Hard interrupt - user said "wait", "stop", "hold on"
  // Longer pause, lower volume, slower pace = "I hear you, take your time"
  hard: [
    '<break time="380ms"/><speed ratio="0.85"/><volume ratio="0.72"/>',
    '<break time="350ms"/><speed ratio="0.88"/><volume ratio="0.75"/>',
    '<break time="420ms"/><speed ratio="0.82"/><volume ratio="0.70"/>',
  ],
  // Soft interrupt - user just started talking (no explicit stop words)
  // Shorter pause but still soft = "Oh, go ahead"
  soft: [
    '<break time="250ms"/><speed ratio="0.90"/><volume ratio="0.80"/>',
    '<break time="220ms"/><speed ratio="0.92"/><volume ratio="0.82"/>',
    '<break time="280ms"/><speed ratio="0.88"/><volume ratio="0.78"/>',
  ],
};

/**
 * Verbal acknowledgments (optional, used sparingly)
 *
 * Design: These should feel like a friend yielding the floor,
 * not a customer service agent saying "please continue."
 * Most of the time, NO verbal ack is best - just the soft prosody.
 */
const INTERRUPT_ACKNOWLEDGMENTS = {
  hard: [
    '<emotion value="calm"/>Mm-hmm.<break time="120ms"/>',
    '<emotion value="warm"/>Yeah.<break time="100ms"/>',
    '', // No verbal ack - just soft prosody (most natural)
    '',
    '',
    '',
    '',
  ],
  soft: [
    '<break time="60ms"/>',
    '', // No verbal ack - just soft prosody
    '',
    '',
    '',
  ],
};

/**
 * Trailing-off patterns (injected when we sense interrupt)
 *
 * These create the natural "trailing off" effect that humans do
 * when someone starts talking over them. The effect should be:
 * - Quick fade (not dragging it out)
 * - Soft volume drop
 * - Natural punctuation (ellipsis or em-dash)
 */
const TRAILING_SSML = [
  '<speed ratio="0.75"/><volume ratio="0.60"/>...<break time="100ms"/>',
  '<speed ratio="0.70"/><volume ratio="0.55"/>—<break time="80ms"/>',
  '<speed ratio="0.78"/><volume ratio="0.62"/>...<break time="90ms"/>',
  '<speed ratio="0.72"/><volume ratio="0.58"/>—<break time="85ms"/>',
];

// =============================================================================
// SESSION STATE
// =============================================================================

const sessionStates = new Map<string, InterruptState>();

/**
 * Get or create interrupt state for a session
 */
export function getInterruptState(sessionId: string): InterruptState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      phase: 'normal',
      hasTrailed: false,
    });
  }
  return sessionStates.get(sessionId)!;
}

/**
 * Reset interrupt state (call when session ends)
 */
export function resetInterruptState(sessionId: string): void {
  sessionStates.delete(sessionId);
}

// =============================================================================
// CUSHIONING - Add micro-pauses throughout speech
// =============================================================================

/**
 * Add cushioning micro-pauses to response text.
 *
 * This makes ANY cut point softer because there's always
 * a tiny pause nearby. The pauses are imperceptible in normal
 * playback but prevent harsh mid-word cuts.
 *
 * @param text - The response text (may have SSML)
 * @returns Cushioned response with break points
 */
export function addCushioning(text: string): CushionedResponse {
  const breakPoints: number[] = [];
  const chunks: string[] = [];

  // Don't process if already heavily SSML'd
  const ssmlDensity = (text.match(/<[^>]+>/g) || []).length / text.length;
  if (ssmlDensity > 0.2) {
    return {
      ssml: text,
      breakPoints: [],
      chunks: [text],
    };
  }

  let result = text;
  const offset = 0;

  // Add micro-pause after periods (sentence boundaries)
  result = result.replace(/\.(\s+)(?=[A-Z])/g, (match, space) => {
    const pause = `.<break time="${CUSHION_TIMING.period}ms"/>${space}`;
    return pause;
  });

  // Add micro-pause after commas (clause boundaries)
  result = result.replace(/,(\s+)/g, (match, space) => {
    const pause = `,<break time="${CUSHION_TIMING.comma}ms"/>${space}`;
    return pause;
  });

  // Add micro-pause after em dashes (thought breaks)
  result = result.replace(/—(\s*)/g, (match, space) => {
    const pause = `—<break time="${CUSHION_TIMING.clause}ms"/>${space || ''}`;
    return pause;
  });

  // Track break points for chunking
  const breakRegex = /<break time="\d+ms"\/>/g;
  let breakMatch;
  while ((breakMatch = breakRegex.exec(result)) !== null) {
    breakPoints.push(breakMatch.index);
  }

  // Split into chunks at sentence boundaries
  const sentencePattern = /[.!?]+\s*(?=<break|$|[A-Z])/g;
  let lastIndex = 0;
  let sentenceMatch;
  while ((sentenceMatch = sentencePattern.exec(result)) !== null) {
    const endIndex = sentenceMatch.index + sentenceMatch[0].length;
    chunks.push(result.slice(lastIndex, endIndex));
    lastIndex = endIndex;
  }
  if (lastIndex < result.length) {
    chunks.push(result.slice(lastIndex));
  }

  log.debug(
    {
      originalLength: text.length,
      cushionedLength: result.length,
      breakPoints: breakPoints.length,
      chunks: chunks.length,
    },
    'Added cushioning micro-pauses'
  );

  return {
    ssml: result,
    breakPoints,
    chunks: chunks.filter((c) => c.trim().length > 0),
  };
}

// =============================================================================
// PRE-EMPTIVE TRAILING - Sense interrupt and fade BEFORE cut
// =============================================================================

/**
 * Check if user speech indicates an incoming interrupt.
 *
 * Called on EVERY partial transcript. If we detect interrupt signals,
 * we can inject trailing SSML into the current TTS stream.
 *
 * @param sessionId - Session ID
 * @param partialText - User's partial transcript
 * @param isAgentSpeaking - Whether agent is currently speaking
 * @returns Whether to start trailing off
 */
export function senseInterrupt(
  sessionId: string,
  partialText: string,
  isAgentSpeaking: boolean
): { shouldTrail: boolean; trigger?: string } {
  if (!isAgentSpeaking) {
    return { shouldTrail: false };
  }

  const state = getInterruptState(sessionId);
  const normalized = partialText.trim().toLowerCase();

  // Already trailing?
  if (state.phase === 'trailing') {
    return { shouldTrail: false };
  }

  // Check for immediate trailing triggers
  for (const pattern of TRAILING_TRIGGERS) {
    if (pattern.test(normalized)) {
      state.phase = 'sensing';
      state.sensingStartedAt = Date.now();
      state.sensingTrigger = normalized.split(/\s+/)[0];

      log.debug(
        {
          trigger: state.sensingTrigger,
          text: normalized.slice(0, 30),
        },
        '🎯 Interrupt sensed - recommending trail'
      );

      return {
        shouldTrail: true,
        trigger: state.sensingTrigger,
      };
    }
  }

  // User started speaking but no clear trigger
  // Still worth trailing if they've been speaking for a bit
  if (state.phase === 'normal' && normalized.length > 5) {
    state.phase = 'sensing';
    state.sensingStartedAt = Date.now();
  }

  // If sensing and enough time has passed, recommend trailing
  if (
    state.phase === 'sensing' &&
    state.sensingStartedAt &&
    Date.now() - state.sensingStartedAt > SENSING_THRESHOLD_MS
  ) {
    return {
      shouldTrail: true,
      trigger: 'sustained_speech',
    };
  }

  return { shouldTrail: false };
}

/**
 * Get trailing SSML to inject before the hard cut.
 *
 * This creates the natural "trailing off" effect that humans do
 * when someone starts talking over them.
 *
 * @returns SSML to append to current speech stream
 */
export function getTrailingSsml(sessionId: string): string {
  const state = getInterruptState(sessionId);

  if (state.hasTrailed) {
    return ''; // Already trailed this interrupt
  }

  state.phase = 'trailing';
  state.hasTrailed = true;

  // Pick a random trailing pattern
  const trailing = TRAILING_SSML[Math.floor(Math.random() * TRAILING_SSML.length)];

  log.debug({ trailing: trailing.slice(0, 30) }, 'Injecting trailing SSML');

  return trailing;
}

// =============================================================================
// INTERRUPT RECOVERY - Start next response softer
// =============================================================================

/**
 * Get recovery SSML for starting speech after an interrupt.
 *
 * Makes the agent's return feel natural - like a human pausing,
 * taking a breath, and starting again softer.
 *
 * @param sessionId - Session ID
 * @param options - Recovery configuration
 * @returns Recovery SSML and configuration
 */
export function getRecoverySsml(sessionId: string, options: RecoveryOptions): RecoverySsml {
  const state = getInterruptState(sessionId);

  // Mark that we're recovering
  state.phase = 'recovering';
  state.userEmotion = options.userEmotion;

  // Pick recovery prefix based on interrupt type
  const prefixes = RECOVERY_PREFIXES[options.interruptType];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  // Maybe add verbal acknowledgment (sparingly)
  const acks = INTERRUPT_ACKNOWLEDGMENTS[options.interruptType];
  const acknowledgment =
    Math.random() < 0.2 // Only 20% of the time
      ? acks[Math.floor(Math.random() * acks.length)]
      : '';

  // Extract speed/volume from the prefix for caller to use
  const speedMatch = prefix.match(/speed ratio="([\d.]+)"/);
  const volumeMatch = prefix.match(/volume ratio="([\d.]+)"/);

  const result: RecoverySsml = {
    prefix: prefix + (acknowledgment ? acknowledgment : ''),
    initialSpeed: speedMatch ? parseFloat(speedMatch[1]) : 0.9,
    initialVolume: volumeMatch ? parseFloat(volumeMatch[1]) : 0.85,
    acknowledgment: acknowledgment || undefined,
  };

  log.debug(
    {
      interruptType: options.interruptType,
      initialSpeed: result.initialSpeed,
      initialVolume: result.initialVolume,
      hasAck: !!acknowledgment,
    },
    'Generated recovery SSML'
  );

  return result;
}

/**
 * Mark the end of recovery phase (call after first response sentence)
 */
export function endRecovery(sessionId: string): void {
  const state = getInterruptState(sessionId);
  if (state.phase === 'recovering') {
    state.phase = 'normal';
    state.hasTrailed = false;
    state.sensingStartedAt = undefined;
    state.sensingTrigger = undefined;
  }
}

// =============================================================================
// INTEGRATION HELPER - Full interrupt-aware response wrapper
// =============================================================================

/**
 * Wrap a response with full interrupt awareness.
 *
 * This is the main integration point. Call this before sending
 * text to TTS to get:
 * - Cushioning micro-pauses
 * - Recovery softening (if coming back from interrupt)
 * - Natural chunk boundaries
 *
 * @param sessionId - Session ID
 * @param text - Response text
 * @param wasInterrupted - Whether we were just interrupted
 * @param interruptType - Type of interrupt if applicable
 * @returns Fully wrapped response ready for TTS
 */
export function wrapWithInterruptAwareness(
  sessionId: string,
  text: string,
  options: {
    wasInterrupted?: boolean;
    interruptType?: 'hard' | 'soft';
    userEmotion?: string;
    personaId: string;
  }
): { ssml: string; chunks: string[] } {
  const state = getInterruptState(sessionId);

  let result = text;

  // 1. Add recovery softening if we were interrupted
  if (options.wasInterrupted) {
    const recovery = getRecoverySsml(sessionId, {
      interruptType: options.interruptType || 'soft',
      userEmotion: options.userEmotion,
      personaId: options.personaId,
    });
    result = recovery.prefix + result;
  }

  // 2. Add cushioning micro-pauses
  const cushioned = addCushioning(result);

  log.debug(
    {
      wasInterrupted: options.wasInterrupted,
      phase: state.phase,
      chunks: cushioned.chunks.length,
    },
    'Wrapped response with interrupt awareness'
  );

  return {
    ssml: cushioned.ssml,
    chunks: cushioned.chunks,
  };
}

// =============================================================================
// RE-EXPORT SPEECH WRAPPER
// =============================================================================

export {
  wrapSpeechWithInterruptAwareness,
  createInterruptAwareTransform,
  markRecoveryComplete,
  isInRecoveryPhase,
  type InterruptContext,
  type WrappedSpeech,
} from './speech-wrapper.js';

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // State management
  getInterruptState,
  resetInterruptState,

  // Core functions
  addCushioning,
  senseInterrupt,
  getTrailingSsml,
  getRecoverySsml,
  endRecovery,

  // Main integration
  wrapWithInterruptAwareness,

  // Speech wrapper (recommended for new code)
  // wrapSpeechWithInterruptAwareness - see speech-wrapper.ts

  // Constants for external use
  CUSHION_TIMING,
  TRAILING_TRIGGERS,
};
