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
 */
function getBackchannelInstructions(context: BackchannelContext): string {
  const { type, recentUserSpeech, emotionalTone, silenceDurationMs } = context;

  // Get relevant snippet (last 100 chars for context)
  const snippet = recentUserSpeech.slice(-100).trim();
  const hasContent = snippet.length > 10;

  switch (type) {
    case 'acknowledgment':
      return `The user is still speaking. Give a VERY brief listening sound (1-3 words max) that shows you're following along.

What they just said: "${snippet}"

Guidelines:
- Ultra brief: "Mm-hmm" "Yeah" "Mm" "Right" - pick ONE
- Don't ask questions
- Don't give advice
- Don't say "I see" or "I understand" (AI tells)
- Just show presence, then stop

Respond with ONLY the brief sound, nothing else.`;

    case 'empathy':
      return `The user is sharing something difficult. Give a VERY brief empathetic acknowledgment (1-4 words max).

What they shared: "${snippet}"
Emotional tone: ${emotionalTone || 'heavy'}

Guidelines:
- Brief and warm: "That's hard" "I hear you" "Yeah..." "Of course"
- Match their energy (quiet for quiet, don't be bright)
- Physical metaphors work: "That landed" "I felt that"
- DON'T say "I understand" or "I'm sorry" (too generic)
- Just acknowledge, don't try to fix

Respond with ONLY the brief acknowledgment, nothing else.`;

    case 'encouragement':
      return `The user seems to need gentle encouragement to continue. Give a VERY brief supportive sound (1-3 words max).

Guidelines:
- Presence sounds: "I'm here" "Take your time" "No rush" "Mm-hmm"
- NOT commands: Don't say "Tell me more" or "Go on" (those feel pushy)
- Just hold space

Respond with ONLY the brief sound, nothing else.`;

    case 'excitement':
      return `The user shared something positive! Give a VERY brief excited reaction (1-4 words max).

What they shared: "${snippet}"

Guidelines:
- Match their energy: "Oh!" "Yes!" "Nice!" "Ha!" "Wait, really?!"
- Can be slightly longer: "That's huge!" "Love that"
- Be genuine, not performative
- Don't overshadow their moment

Respond with ONLY the brief reaction, nothing else.`;

    case 'curiosity':
      return `The user said something interesting. Give a VERY brief intrigued sound (1-2 words max).

What they said: "${snippet}"

Guidelines:
- Soft curiosity: "Huh" "Hmm" "Oh?" "Interesting"
- NOT "Really?" or "Is that so?" (those sound fake)
- Just a sound that shows you noticed

Respond with ONLY the brief sound, nothing else.`;

    case 'silence_presence':
      if (!silenceDurationMs || silenceDurationMs < 5000) {
        // Short silence - often best to say nothing
        return `The user has been quiet for a moment. Decide if you should acknowledge the silence or stay quiet yourself.

Silence duration: ${Math.round((silenceDurationMs || 0) / 1000)} seconds

Guidelines:
- Often silence IS the right response (respond with just "...")
- If you do speak, keep it to 1-3 words: "I'm here" "Take your time" "Mm"
- Don't fill silence just to fill it
- Heavy moments deserve space

Respond with either "..." (for intentional silence) or a very brief presence sound.`;
      } else {
        // Longer silence - gentle check-in
        return `The user has been quiet for a while. Give a gentle presence acknowledgment.

Silence duration: ${Math.round((silenceDurationMs || 0) / 1000)} seconds

Guidelines:
- Warm but brief: "I'm here" "Still with you" "No rush"
- DON'T ask "Are you okay?" or "What's on your mind?" (too intrusive)
- Just show you're present, not demanding they speak

Respond with ONLY the brief acknowledgment (3-5 words max).`;
      }

    default:
      return `Give a very brief listening acknowledgment (1-3 words): "Mm-hmm" "Yeah" "Mm"

Respond with ONLY the brief sound.`;
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
