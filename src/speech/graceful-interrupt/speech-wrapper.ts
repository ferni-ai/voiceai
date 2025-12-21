/**
 * Interrupt-Aware Speech Wrapper
 *
 * Wraps agent speech output with graceful interrupt handling:
 * - Recovery softening after being interrupted
 * - Cushioning micro-pauses throughout for softer cuts
 * - Natural trailing when sensing incoming interrupts
 *
 * This module bridges the graceful-interrupt system to actual speech output.
 *
 * @module speech/graceful-interrupt/speech-wrapper
 */

import { createLogger } from '../../utils/safe-logger.js';
import { addCushioning, getRecoverySsml, endRecovery, getInterruptState } from './index.js';

const log = createLogger({ module: 'InterruptSpeechWrapper' });

// =============================================================================
// TYPES
// =============================================================================

export interface InterruptContext {
  /** Was the agent interrupted on the previous turn? */
  wasInterrupted?: boolean;
  /** Type of interrupt: 'hard' (explicit stop words) or 'soft' (just started talking) */
  interruptType?: 'hard' | 'soft';
  /** User's emotional state */
  userEmotion?: string;
  /** Current persona ID */
  personaId: string;
  /** Session ID for state tracking */
  sessionId: string;
}

export interface WrappedSpeech {
  /** SSML-enhanced text ready for TTS */
  text: string;
  /** Whether recovery was applied */
  recoveryApplied: boolean;
  /** Whether cushioning was applied */
  cushioningApplied: boolean;
}

// =============================================================================
// RECOVERY SSML - Persona-Specific
// =============================================================================

/**
 * Soft recovery openings that acknowledge the interrupt without drawing attention to it.
 * These feel human - like someone pausing to listen, then continuing warmly.
 *
 * Design philosophy:
 * - Hard interrupts: User explicitly said "wait" or "stop" - give them LOTS of space
 *   Long pause (400-500ms), very soft volume (0.68-0.75), slow speed (0.82-0.88)
 *
 * - Soft interrupts: User just started talking - shorter but still gentle
 *   Medium pause (250-320ms), soft volume (0.75-0.82), normal-slow speed (0.88-0.92)
 *
 * Each persona has slightly different timing that matches their character:
 * - Ferni: Warm and present, medium timing
 * - Peter: Thoughtful, deliberate pauses
 * - Maya: Gentle and patient, longer pauses
 * - Nayan: Wise and unhurried, longest pauses
 * - Alex: Direct but kind, shorter pauses
 * - Jordan: Energetic but respectful, shortest pauses
 */
const PERSONA_RECOVERY_OPENINGS: Record<string, { hard: string[]; soft: string[] }> = {
  ferni: {
    hard: [
      '<break time="420ms"/><volume ratio="0.72"/><speed ratio="0.85"/>',
      '<break time="450ms"/><volume ratio="0.70"/><speed ratio="0.82"/>',
      '<break time="380ms"/><volume ratio="0.75"/><speed ratio="0.88"/>',
    ],
    soft: [
      '<break time="280ms"/><volume ratio="0.78"/><speed ratio="0.90"/>',
      '<break time="250ms"/><volume ratio="0.80"/><speed ratio="0.92"/>',
      '<break time="300ms"/><volume ratio="0.76"/><speed ratio="0.88"/>',
    ],
  },
  'peter-john': {
    hard: [
      '<break time="400ms"/><volume ratio="0.72"/><speed ratio="0.86"/>',
      '<break time="450ms"/><volume ratio="0.70"/><speed ratio="0.84"/>',
    ],
    soft: [
      '<break time="280ms"/><volume ratio="0.78"/><speed ratio="0.90"/>',
      '<break time="260ms"/><volume ratio="0.80"/><speed ratio="0.92"/>',
    ],
  },
  'maya-santos': {
    hard: [
      '<break time="480ms"/><volume ratio="0.68"/><speed ratio="0.82"/>',
      '<break time="450ms"/><volume ratio="0.70"/><speed ratio="0.84"/>',
    ],
    soft: [
      '<break time="320ms"/><volume ratio="0.76"/><speed ratio="0.88"/>',
      '<break time="300ms"/><volume ratio="0.78"/><speed ratio="0.90"/>',
    ],
  },
  'nayan-patel': {
    hard: [
      '<break time="520ms"/><volume ratio="0.65"/><speed ratio="0.80"/>',
      '<break time="480ms"/><volume ratio="0.68"/><speed ratio="0.82"/>',
    ],
    soft: [
      '<break time="350ms"/><volume ratio="0.74"/><speed ratio="0.86"/>',
      '<break time="320ms"/><volume ratio="0.76"/><speed ratio="0.88"/>',
    ],
  },
  'alex-chen': {
    hard: [
      '<break time="350ms"/><volume ratio="0.75"/><speed ratio="0.88"/>',
      '<break time="380ms"/><volume ratio="0.72"/><speed ratio="0.86"/>',
    ],
    soft: [
      '<break time="240ms"/><volume ratio="0.82"/><speed ratio="0.92"/>',
      '<break time="260ms"/><volume ratio="0.80"/><speed ratio="0.90"/>',
    ],
  },
  'jordan-taylor': {
    hard: [
      '<break time="320ms"/><volume ratio="0.76"/><speed ratio="0.90"/>',
      '<break time="350ms"/><volume ratio="0.74"/><speed ratio="0.88"/>',
    ],
    soft: [
      '<break time="220ms"/><volume ratio="0.84"/><speed ratio="0.94"/>',
      '<break time="240ms"/><volume ratio="0.82"/><speed ratio="0.92"/>',
    ],
  },
};

/**
 * Get persona-specific recovery opening SSML
 */
function getPersonaRecoveryOpening(personaId: string, interruptType: 'hard' | 'soft'): string {
  const personaOpenings = PERSONA_RECOVERY_OPENINGS[personaId] || PERSONA_RECOVERY_OPENINGS.ferni;
  const options = personaOpenings[interruptType];
  return options[Math.floor(Math.random() * options.length)];
}

// =============================================================================
// MAIN WRAPPER FUNCTION
// =============================================================================

/**
 * Wrap speech text with interrupt awareness.
 *
 * Call this before sending text to TTS to:
 * 1. Add recovery softening if we were just interrupted
 * 2. Add cushioning micro-pauses for softer potential cuts
 *
 * @param text - The text to speak
 * @param context - Interrupt context (wasInterrupted, interruptType, etc.)
 * @returns Wrapped speech with SSML enhancements
 *
 * @example
 * ```typescript
 * const wrapped = wrapSpeechWithInterruptAwareness(
 *   "Let me think about that...",
 *   {
 *     wasInterrupted: userData.wasInterrupted,
 *     interruptType: userData.interruptType,
 *     personaId: persona.id,
 *     sessionId: sessionId,
 *   }
 * );
 * session.say(wrapped.text, { allowInterruptions: true });
 *
 * // Clear the interrupt flag after using it
 * if (wrapped.recoveryApplied) {
 *   userData.wasInterrupted = false;
 * }
 * ```
 */
export function wrapSpeechWithInterruptAwareness(
  text: string,
  context: InterruptContext
): WrappedSpeech {
  const { wasInterrupted, interruptType, personaId, sessionId } = context;

  let result = text;
  let recoveryApplied = false;
  let cushioningApplied = false;

  // 1. Apply recovery softening if we were interrupted
  if (wasInterrupted) {
    const type = interruptType || 'soft';
    const recoveryOpening = getPersonaRecoveryOpening(personaId, type);

    result = recoveryOpening + result;
    recoveryApplied = true;

    log.debug(
      {
        personaId,
        interruptType: type,
        textPreview: text.slice(0, 40),
      },
      '🎭 Applied interrupt recovery softening'
    );

    // Mark recovery phase in state (for potential trailing coordination)
    const state = getInterruptState(sessionId);
    state.phase = 'recovering';
  }

  // 2. Add cushioning micro-pauses for softer potential cuts
  // Skip if text is very short (likely a backchannel) or already has heavy SSML
  const ssmlDensity = (text.match(/<[^>]+>/g) || []).length / Math.max(text.length, 1);
  if (text.length > 20 && ssmlDensity < 0.15) {
    const cushioned = addCushioning(result);
    if (cushioned.ssml !== result) {
      result = cushioned.ssml;
      cushioningApplied = true;
    }
  }

  return {
    text: result,
    recoveryApplied,
    cushioningApplied,
  };
}

/**
 * Mark that recovery has been used (call after the first sentence is spoken)
 */
export function markRecoveryComplete(sessionId: string): void {
  endRecovery(sessionId);
}

/**
 * Check if we're currently in recovery phase
 */
export function isInRecoveryPhase(sessionId: string): boolean {
  const state = getInterruptState(sessionId);
  return state.phase === 'recovering';
}

// =============================================================================
// STREAMING TRANSFORM FOR TTS PIPELINE
// =============================================================================

/**
 * Create a transform stream that adds interrupt awareness to streaming text.
 *
 * This is designed to be used in the TTS pipeline:
 * LLM output → sanitizer → interruptAwareness → TTS
 *
 * @param context - Interrupt context
 * @returns A TransformStream that adds cushioning to streamed text
 */
export function createInterruptAwareTransform(
  context: InterruptContext
): TransformStream<string, string> {
  let isFirstChunk = true;
  let buffer = '';

  const { wasInterrupted, interruptType, personaId, sessionId } = context;

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      // Apply recovery opening to the very first chunk
      if (isFirstChunk && wasInterrupted) {
        const type = interruptType || 'soft';
        const recoveryOpening = getPersonaRecoveryOpening(personaId, type);

        log.debug(
          {
            personaId,
            interruptType: type,
          },
          '🎭 Applied streaming recovery opening'
        );

        controller.enqueue(recoveryOpening);
        isFirstChunk = false;
      } else {
        isFirstChunk = false;
      }

      // Buffer chunks and add micro-pauses at sentence boundaries
      buffer += chunk;

      // Look for natural pause points in the buffer
      const pauseMatch = buffer.match(/([.!?])\s+/);
      if (pauseMatch && pauseMatch.index !== undefined) {
        // Emit up to and including the pause point, with a micro-break
        const pauseIndex = pauseMatch.index + pauseMatch[0].length;
        const toEmit = buffer.slice(0, pauseIndex);
        buffer = buffer.slice(pauseIndex);

        // Add a subtle micro-pause after sentence-ending punctuation
        const withPause = toEmit.replace(/([.!?])\s*$/, '$1<break time="80ms"/> ');
        controller.enqueue(withPause);
      }
    },
    flush(controller) {
      // Emit any remaining buffered content
      if (buffer.length > 0) {
        controller.enqueue(buffer);
      }

      // Mark recovery complete at end of utterance
      if (wasInterrupted) {
        endRecovery(sessionId);
      }
    },
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  wrapSpeechWithInterruptAwareness,
  createInterruptAwareTransform,
  markRecoveryComplete,
  isInRecoveryPhase,
};
