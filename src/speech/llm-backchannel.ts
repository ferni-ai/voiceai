/**
 * LLM-Based Backchannel Generation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Instead of hardcoded phrase pools that repeat, let the LLM generate
 * contextually appropriate backchannels based on what the user actually said.
 *
 * Philosophy:
 * - Humans don't pick from a list - they respond to what was said
 * - The LLM has context (what user said, emotional tone, conversation history)
 * - Natural variety comes from natural generation, not random selection
 *
 * @module speech/llm-backchannel
 */

import { createLogger } from '../utils/safe-logger.js';
import { canAddFeedback, recordFeedback } from './feedback-coordinator.js';

const log = createLogger({ module: 'LLMBackchannel' });

// ============================================================================
// TYPES
// ============================================================================

export type BackchannelType =
  | 'acknowledgment' // User is sharing, show you're listening
  | 'empathy' // User is sharing something hard
  | 'encouragement' // User needs support to continue
  | 'excitement' // User shared something positive
  | 'curiosity' // User said something interesting
  | 'silence_presence'; // User has been quiet, show you're still here

export interface BackchannelContext {
  /** What the user just said (last 1-2 sentences) */
  recentUserSpeech: string;
  /** Detected emotional tone */
  emotionalTone?: 'neutral' | 'heavy' | 'excited' | 'anxious' | 'sad' | 'happy';
  /** Type of backchannel needed */
  type: BackchannelType;
  /** Current turn number */
  turnNumber: number;
  /** How long user has been speaking (ms) */
  speakingDurationMs?: number;
  /** How long user has been silent (ms) - for silence_presence type */
  silenceDurationMs?: number;
  /** Persona ID for voice consistency */
  personaId: string;
}

export interface BackchannelInstructions {
  /** The prompt to send to generateReply */
  instructions: string;
  /** Whether to allow interruptions */
  allowInterruptions: boolean;
  /** Whether we should actually trigger this */
  shouldTrigger: boolean;
  /** Reason if not triggering */
  skipReason?: string;
}

// ============================================================================
// INSTRUCTION TEMPLATES
// ============================================================================

/**
 * Generate instructions for the LLM to produce a natural backchannel.
 *
 * These instructions tell the LLM exactly what kind of response to give,
 * ensuring it stays brief and contextual.
 *
 * Uses speak pseudo-tool pattern to prevent echoing of meta-instructions.
 * The LLM outputs JSON, which gets caught by tool-call-sanitizer and spoken via session.say().
 */
function getBackchannelInstructions(context: BackchannelContext): string {
  const { type, recentUserSpeech, emotionalTone, silenceDurationMs } = context;

  // Get relevant snippet (last 100 chars for context)
  const snippet = recentUserSpeech.slice(-100).trim();

  // JSON output format (prevents echoing of instructions)
  const jsonFormat = `OUTPUT ONLY this JSON format (nothing else):
{"fn":"speak","args":{"text":"your brief response here"}}`;

  switch (type) {
    case 'acknowledgment':
      return `User is speaking: "${snippet}"

Generate a brief listening sound (1-3 words). Examples: "Mm-hmm" "Yeah" "Right"

${jsonFormat}`;

    case 'empathy':
      return `User shared something difficult: "${snippet}"
Tone: ${emotionalTone || 'heavy'}

Generate a brief empathetic sound (1-4 words). Examples: "That's hard" "I hear you" "Yeah..."

${jsonFormat}`;

    case 'encouragement':
      return `User needs gentle encouragement to continue.

Generate a presence sound (1-3 words). Examples: "I'm here" "Take your time" "No rush"

${jsonFormat}`;

    case 'excitement':
      return `User shared good news: "${snippet}"

Generate a brief excited reaction (1-4 words). Examples: "Oh!" "Yes!" "That's huge!"

${jsonFormat}`;

    case 'curiosity':
      return `User said something interesting: "${snippet}"

Generate a brief curious sound (1-2 words). Examples: "Huh" "Hmm" "Oh?"

${jsonFormat}`;

    case 'silence_presence':
      if (!silenceDurationMs || silenceDurationMs < 5000) {
        return `User has been quiet for ${Math.round((silenceDurationMs || 0) / 1000)} seconds.

Generate "..." for intentional silence, or a brief presence sound (1-3 words): "I'm here"

${jsonFormat}`;
      } else {
        return `User has been quiet for ${Math.round((silenceDurationMs || 0) / 1000)} seconds.

Generate a gentle presence acknowledgment (3-5 words). Examples: "I'm here" "Still with you"

${jsonFormat}`;
      }

    default:
      return `Generate a brief listening sound (1-3 words): "Mm-hmm" "Yeah" "Mm"

${jsonFormat}`;
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate LLM-based backchannel instructions.
 *
 * Call this when timing logic determines a backchannel is appropriate,
 * then pass the instructions to session.generateReply().
 *
 * @example
 * ```typescript
 * const result = generateBackchannelInstructions(sessionId, context);
 * if (result.shouldTrigger) {
 *   session.generateReply({
 *     instructions: result.instructions,
 *     allowInterruptions: result.allowInterruptions,
 *   });
 * }
 * ```
 */
export function generateBackchannelInstructions(
  sessionId: string,
  context: BackchannelContext
): BackchannelInstructions {
  const { type, turnNumber, emotionalTone, silenceDurationMs } = context;

  // Check feedback coordinator budget
  if (!canAddFeedback(sessionId, 'backchannel', turnNumber)) {
    return {
      instructions: '',
      allowInterruptions: true,
      shouldTrigger: false,
      skipReason: 'feedback_budget_exceeded',
    };
  }

  // For silence_presence with heavy emotional content, often silence IS right
  if (type === 'silence_presence' && emotionalTone === 'heavy' && (silenceDurationMs || 0) < 8000) {
    // 60% chance to stay silent for heavy emotional moments
    if (Math.random() < 0.6) {
      return {
        instructions: '',
        allowInterruptions: true,
        shouldTrigger: false,
        skipReason: 'respecting_emotional_silence',
      };
    }
  }

  // For early turns, be more conservative
  if (turnNumber < 3 && type === 'acknowledgment') {
    // 50% chance to skip early backchannels
    if (Math.random() < 0.5) {
      return {
        instructions: '',
        allowInterruptions: true,
        shouldTrigger: false,
        skipReason: 'early_conversation_restraint',
      };
    }
  }

  // Generate the instructions
  const instructions = getBackchannelInstructions(context);

  // Record that we're triggering a backchannel
  recordFeedback(sessionId, 'backchannel');

  log.debug(
    {
      sessionId,
      type,
      turnNumber,
      recentSpeech: context.recentUserSpeech.slice(-50),
    },
    'Generated LLM backchannel instructions'
  );

  return {
    instructions,
    allowInterruptions: true,
    shouldTrigger: true,
  };
}

// ============================================================================
// SILENCE HANDLING
// ============================================================================

/**
 * Determine if we should respond to silence and generate appropriate instructions.
 */
export function generateSilenceInstructions(
  sessionId: string,
  context: {
    silenceDurationMs: number;
    turnNumber: number;
    emotionalTone?: 'neutral' | 'heavy' | 'excited';
    lastUserMessage?: string;
    personaId: string;
  }
): BackchannelInstructions {
  const { silenceDurationMs, turnNumber, emotionalTone, lastUserMessage, personaId } = context;

  // Check feedback budget
  if (!canAddFeedback(sessionId, 'backchannel', turnNumber)) {
    return {
      instructions: '',
      allowInterruptions: true,
      shouldTrigger: false,
      skipReason: 'feedback_budget_exceeded',
    };
  }

  // Very short silence (< 3s) - usually don't respond
  if (silenceDurationMs < 3000) {
    return {
      instructions: '',
      allowInterruptions: true,
      shouldTrigger: false,
      skipReason: 'silence_too_brief',
    };
  }

  // After heavy content, give more space
  if (emotionalTone === 'heavy' && silenceDurationMs < 8000) {
    // 70% chance to stay silent
    if (Math.random() < 0.7) {
      return {
        instructions: '',
        allowInterruptions: true,
        shouldTrigger: false,
        skipReason: 'respecting_emotional_space',
      };
    }
  }

  // Medium silence (3-8s) - maybe respond
  if (silenceDurationMs < 8000) {
    // 40% chance to stay silent
    if (Math.random() < 0.4) {
      return {
        instructions: '',
        allowInterruptions: true,
        shouldTrigger: false,
        skipReason: 'natural_silence_variation',
      };
    }
  }

  // Generate the instructions
  return generateBackchannelInstructions(sessionId, {
    type: 'silence_presence',
    recentUserSpeech: lastUserMessage || '',
    emotionalTone: emotionalTone || 'neutral',
    turnNumber,
    silenceDurationMs,
    personaId,
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateBackchannelInstructions,
  generateSilenceInstructions,
};
