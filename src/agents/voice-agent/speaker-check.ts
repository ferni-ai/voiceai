/**
 * "Is someone new?" — the agent half of the speaker check.
 *
 * When the session's SpeakerChangeDetector hears a different voice, the agent may
 * ask the web to show its "Someone new?" prompt (a `speaker_changed` data
 * message). The user's tap comes back as `speaker_check_reply` and is applied to
 * what the agent already tracks about who is speaking:
 *
 * - the SpeakerChangeDetector (`setCurrentSpeaker`): the voice now speaking
 *   becomes the reference voice, tagged as the primary user or as a guest, so the
 *   detector stops treating it as a change;
 * - the household session (`updateSessionSpeaker`): `currentUserId` becomes the
 *   primary user's id or GUEST_SPEAKER_ID, and the change is recorded.
 *
 * Asking is rate-limited per call: never in the first 30 s, at most once per
 * 10 minutes, and only when the detector's change confidence is above its own
 * `changeConfidenceThreshold`.
 */

import type { Room } from '@livekit/rtc-node';
import { diag } from '../../services/diagnostic-logger.js';
import { updateSessionSpeaker } from '../../services/voice/voice-household.js';
import {
  getSpeakerChangeDetector,
  type SpeakerChangeEvent,
} from '../../services/voice/voice-speaker-change.js';

/** Data message type the web sends when the user answers the prompt. */
export const SPEAKER_CHECK_REPLY_TYPE = 'speaker_check_reply';
export const SPEAKER_CHECK_ANSWERS = ['still_me', 'someone_new'] as const;
export type SpeakerCheckAnswer = (typeof SPEAKER_CHECK_ANSWERS)[number];

/** Speaker tag for a voice the user said is someone new. */
export const GUEST_SPEAKER_ID = 'guest';
/** Speaker tag for the primary speaker when the caller has no user id. */
export const PRIMARY_SPEAKER_ID = 'primary';

/** Never ask in the opening seconds of a call. */
export const SPEAKER_CHECK_QUIET_START_MS = 30_000;
/** Ask at most once per this interval. */
export const SPEAKER_CHECK_MIN_INTERVAL_MS = 10 * 60_000;

export interface SpeakerCheckGate {
  /** True when this speaker change should prompt the user (and records the ask). */
  shouldAsk(confidence: number, now?: number): boolean;
}

/** Per-call gate for the "Someone new?" prompt. */
export function createSpeakerCheckGate(callStartedAt: number, threshold: number): SpeakerCheckGate {
  let lastAskedAt: number | null = null;
  return {
    shouldAsk(confidence, now = Date.now()) {
      if (!(confidence > threshold)) return false;
      if (now - callStartedAt < SPEAKER_CHECK_QUIET_START_MS) return false;
      if (lastAskedAt !== null && now - lastAskedAt < SPEAKER_CHECK_MIN_INTERVAL_MS) return false;
      lastAskedAt = now;
      return true;
    },
  };
}

/** The `speaker_changed` data message the web's prompt reads. */
export function buildSpeakerChangedMessage(event: SpeakerChangeEvent): Record<string, unknown> {
  return {
    type: 'speaker_changed',
    previousSpeakerId: event.previousSpeakerId,
    currentSpeakerId: event.currentSpeakerId,
    confidence: event.confidence,
    isNewSpeaker: event.isNewSpeaker,
    timestamp: Date.now(),
  };
}

/**
 * Returns the detector's `speaker_changed` listener: it publishes the prompt to
 * the web when the gate allows, and reports whether it did.
 */
export function createSpeakerChangePrompter(
  room: Room,
  callStartedAt: number,
  threshold: number
): (event: SpeakerChangeEvent, now?: number) => boolean {
  const gate = createSpeakerCheckGate(callStartedAt, threshold);
  return (event, now) => {
    const participant = room.localParticipant;
    if (!participant) return false;
    if (!gate.shouldAsk(event.confidence, now)) {
      diag.debug('Speaker change not prompted (gate)', { confidence: event.confidence, threshold });
      return false;
    }
    participant
      .publishData(new TextEncoder().encode(JSON.stringify(buildSpeakerChangedMessage(event))), {
        reliable: true,
      })
      .catch((e: unknown) => {
        diag.warn('Speaker change prompt publish failed', { error: String(e) });
      });
    return true;
  };
}

/** The answer in a `speaker_check_reply` message, or null for anything else. */
export function parseSpeakerCheckReply(message: unknown): SpeakerCheckAnswer | null {
  if (typeof message !== 'object' || message === null) return null;
  const { type, answer } = message as Record<string, unknown>;
  if (type !== SPEAKER_CHECK_REPLY_TYPE) return null;
  return SPEAKER_CHECK_ANSWERS.find((a) => a === answer) ?? null;
}

/** Tag the current speaker as the primary user or a guest. Returns the tag. */
export async function applySpeakerCheckReply(
  sessionId: string,
  primaryUserId: string | undefined,
  answer: SpeakerCheckAnswer
): Promise<string> {
  const speakerId =
    answer === 'still_me' ? (primaryUserId ?? PRIMARY_SPEAKER_ID) : GUEST_SPEAKER_ID;
  getSpeakerChangeDetector(sessionId).setCurrentSpeaker(speakerId);
  await updateSessionSpeaker(sessionId, speakerId, 1);
  diag.session('👥 Speaker check answered', {
    answer,
    speaker: answer === 'still_me' ? 'primary' : 'guest',
  });
  return speakerId;
}

/** Handle `speaker_check_reply` messages from the user. Returns the unsubscribe. */
export function listenForSpeakerCheckReplies(
  room: Room,
  sessionId: string,
  primaryUserId: string | undefined
): () => void {
  const onData = (payload: Uint8Array, participant?: { identity: string }): void => {
    if (!participant || participant.identity === room.localParticipant?.identity) return;
    let message: unknown;
    try {
      message = JSON.parse(new TextDecoder().decode(payload));
    } catch {
      // The data channel also carries non-JSON payloads; they are not replies.
      return;
    }
    const answer = parseSpeakerCheckReply(message);
    if (!answer) return;
    applySpeakerCheckReply(sessionId, primaryUserId, answer).catch((error: unknown) => {
      diag.warn('Speaker check reply failed', { error: String(error) });
    });
  };
  room.on('dataReceived', onData);
  return () => {
    room.off('dataReceived', onData);
  };
}
