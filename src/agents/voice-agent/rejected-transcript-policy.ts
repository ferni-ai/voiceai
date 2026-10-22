/**
 * Rejected Transcript Policy
 *
 * When the transcript validator rejects a final transcript (noise, foreign
 * characters, echo, a one-word backchannel while Ferni speaks), the handler
 * double-interrupts the session: the SDK may already have started an
 * auto-response from that audio, and the interrupt kills it before Ferni says
 * it. That interrupt also cut off a reply Ferni was already speaking, so a
 * caller's "Right." or Ferni's own echo stopped him mid-sentence.
 *
 * With REJECTED_TRANSCRIPT_KEEPS_SPEECH on, a reply whose audio began before
 * this caller utterance began is kept: the rejected audio cannot have started
 * it. A reply that began after the caller started speaking, or one still in
 * thinking/pre-audio, is still interrupted (the original Feb 2026 protection).
 * When either timestamp is missing the order is unknown, so it interrupts.
 *
 * @module voice-agent/rejected-transcript-policy
 */

import { diag } from '../../services/diagnostic-logger.js';
import type { TranscriptValidationResult } from './transcript-validator.js';

export type RejectedTranscriptAction = 'interrupt' | 'keep_speech';

export interface RejectedTranscriptInput {
  /** REJECTED_TRANSCRIPT_KEEPS_SPEECH, read by the caller with flagOn */
  keepsSpeechFlag: boolean;
  /** Ferni's audio is playing right now (conversationManager.isAgentSpeaking) */
  isAgentSpeaking: boolean;
  /** When Ferni's current reply started speaking (userData.lastAgentSpeechStartTime) */
  agentSpeechStartedAt?: number;
  /** When this caller utterance started (userData.userSpeakingStartTime) */
  userSpeechStartedAt?: number;
}

/** Whether a rejected transcript should interrupt the session or leave Ferni's reply playing. */
export function decideRejectedTranscriptAction(
  input: RejectedTranscriptInput
): RejectedTranscriptAction {
  if (!input.keepsSpeechFlag) return 'interrupt';
  if (!input.isAgentSpeaking) return 'interrupt';
  const { agentSpeechStartedAt: agentAt, userSpeechStartedAt: userAt } = input;
  if (agentAt === undefined || userAt === undefined) return 'interrupt';
  return agentAt < userAt ? 'keep_speech' : 'interrupt';
}

/** The slice of AgentSession this needs. */
export interface Interruptible {
  interrupt: () => unknown;
}

/**
 * Applies the decision: keeps Ferni's reply, or interrupts twice 100 ms apart.
 * Single interrupt is often too late: the SDK's VAD starts generation before the
 * transcript handler runs, so TTS may already have queued frames; the second
 * interrupt catches chunks that were in flight during the first.
 */
export function handleRejectedTranscript(
  session: Interruptible | undefined,
  reason: TranscriptValidationResult['reason'],
  input: RejectedTranscriptInput
): RejectedTranscriptAction {
  const action = decideRejectedTranscriptAction(input);
  if (action === 'keep_speech') {
    diag.state("🛡️ Kept Ferni's reply: it began before the rejected transcript", { reason });
    return action;
  }
  if (session) {
    try {
      session.interrupt();
      diag.state('🛡️ Interrupted pending LLM response for rejected transcript', {
        reason,
      });

      setTimeout(() => {
        try {
          session.interrupt();
          diag.debug('🛡️ Follow-up interrupt for rejected transcript');
        } catch {
          // Non-critical - first interrupt likely handled it
        }
      }, 100);
    } catch (interruptErr) {
      diag.debug('⚠️ Interrupt failed for rejected transcript', {
        error: String(interruptErr),
      });
    }
  }
  return action;
}
