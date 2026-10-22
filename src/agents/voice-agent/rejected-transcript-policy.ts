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
 * Keeping the playing reply is not enough on the realtime path: a server-started
 * generation is queued behind it without interrupting it (agent_activity
 * onGenerationCreated), and only session.interrupt() cleared that queue. So the
 * keep branch also interrupts every reply created at or after the caller began
 * that has not started. When the tracker cannot tell, it falls back to the
 * double interrupt rather than risk keeping a garbage reply.
 *
 * @module voice-agent/rejected-transcript-policy
 */

import { voice } from '@livekit/agents';
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
 * Applies the decision: keeps Ferni's reply (cancelling replies queued since the
 * caller began), or interrupts twice 100 ms apart. Returns what it did.
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
  if (action === 'keep_speech' && keepPlayingReply(session, input, reason)) return action;
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
  return 'interrupt';
}

// ============================================================================
// SPEECH TRACKER: replies created per session, so the keep branch can cancel
// the ones queued since the caller began without touching the playing one.
// ============================================================================

/** The slice of SpeechHandle the tracker reads. */
export interface TrackedSpeech {
  readonly id: string;
  readonly interrupted: boolean;
  done: () => boolean;
  interrupt: () => unknown;
  /** SDK internal: resolves when the handle becomes the current speech. */
  _waitForAuthorization?: () => Promise<void>;
}

interface TrackedEntry {
  handle: TrackedSpeech;
  createdAt: number;
  /** undefined: the SDK gave no way to know whether it has started */
  started: boolean | undefined;
}

const MAX_TRACKED = 16;
const trackers = new WeakMap<object, TrackedEntry[]>();

/** Starts an empty tracker for this session; false when it already had one. */
export function trackSession(session: object): boolean {
  if (trackers.has(session)) return false;
  trackers.set(session, []);
  return true;
}

/** Records a reply the session created, and when it becomes the current speech. */
export function recordCreatedSpeech(
  session: object,
  handle: TrackedSpeech,
  createdAt: number = Date.now()
): void {
  const entries = trackers.get(session);
  if (!entries) return;
  const entry: TrackedEntry = { handle, createdAt, started: undefined };
  const wait = handle._waitForAuthorization;
  if (typeof wait === 'function') {
    entry.started = false;
    wait.call(handle).then(
      () => {
        entry.started = true;
      },
      (err: unknown) => {
        entry.started = undefined;
        diag.debug('⚠️ Speech authorization wait failed', { error: String(err) });
      }
    );
  }
  const live = entries.filter((e) => !e.handle.done());
  live.push(entry);
  trackers.set(session, live.slice(-MAX_TRACKED));
}

/** Tracks speech_created on this session (once per session). */
export function installSpeechTracker<U>(session: voice.AgentSession<U>): void {
  if (!trackSession(session)) return;
  session.on(voice.AgentSessionEventTypes.SpeechCreated, (ev) =>
    recordCreatedSpeech(session, ev.speechHandle)
  );
}

/**
 * Interrupts every tracked reply created at or after userAt that has not started.
 * Returns how many, or null when it cannot keep the playing reply safely: no
 * tracker, or a reply from after userAt that has started or whose state is unknown.
 */
export function cancelRepliesQueuedSince(session: object, userAt: number): number | null {
  const entries = trackers.get(session);
  if (!entries) return null;
  const late = entries.filter(
    (e) => e.createdAt >= userAt && !e.handle.done() && !e.handle.interrupted
  );
  if (late.some((e) => e.started !== false)) return null;
  late.forEach((e) => e.handle.interrupt());
  return late.length;
}

/** The keep branch: true when Ferni's reply is kept, false to fall back to the double interrupt. */
function keepPlayingReply(
  session: Interruptible | undefined,
  input: RejectedTranscriptInput,
  reason: TranscriptValidationResult['reason']
): boolean {
  if (!session || input.userSpeechStartedAt === undefined) return false;
  try {
    const cancelled = cancelRepliesQueuedSince(session, input.userSpeechStartedAt);
    if (cancelled === null) return false;
    diag.state("🛡️ Kept Ferni's reply: it began before the rejected transcript", {
      reason,
      cancelledQueued: cancelled,
    });
    return true;
  } catch (err) {
    diag.debug('⚠️ Queued-reply cancel failed, interrupting instead', { error: String(err) });
    return false;
  }
}
