/**
 * Early Acknowledgment Context
 *
 * Builds the STRUCTURED meta-commands for the early dead-air check-in.
 * Structured commands (not conversational text) cannot be mistaken for
 * speech: conversational instructions can be echoed by Gemini.
 *
 * Extracted from session-state-handler.ts.
 *
 * @module voice-agent/early-acknowledgment-context
 */

/** What the early check-in knows when it decides to speak. */
export interface EarlyAcknowledgmentMoment {
  /** How long the caller has been quiet (ms) */
  silenceMs: number;
  /** Silence hold multiplier from silenceHold() (> 1 after something heavy) */
  hold: number;
  /** The caller's last transcript ('' when none) */
  lastTranscript: string;
  /** Turns so far in the conversation */
  turnCount: number;
}

/** Build the meta-commands that guide the early acknowledgment reply. */
export function buildEarlyAcknowledgmentContext(moment: EarlyAcknowledgmentMoment): string[] {
  const { silenceMs, hold, lastTranscript, turnCount } = moment;

  const contextParts = [
    `[SITUATION: ${Math.round(silenceMs / 1000)}s silence]`,
    hold > 1 ? '[TYPE: quiet_presence]' : '[TYPE: soft_acknowledgment]',
    hold > 1 ? '[MAX: 6 words]' : '[MAX: 8 words]',
    '[NO: questions]',
  ];
  if (hold > 1) contextParts.push('[TONE: gentle, no pressure to speak]');

  // Add context reference if available
  if (lastTranscript && lastTranscript.length > 10) {
    contextParts.push(`[CONTEXT: "${lastTranscript.slice(0, 80)}..."]`);
  }

  // Tone based on conversation stage (a heavy moment already set it)
  if (hold > 1) {
    // keep the gentle tone
  } else if (turnCount < 3) {
    contextParts.push('[TONE: welcoming]');
  } else if (turnCount > 10) {
    contextParts.push('[TONE: casual]');
  }

  return contextParts;
}
