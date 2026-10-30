/**
 * Cap "you still there?" checks into a quiet caller (PRESENCE_CHECK_CAP).
 *
 * Dev call 2026-10-11 (character mode): the caller simply went quiet, and the
 * long-silence remark (session-state-handler.ts, user `away`) came out as
 * "Mm? You still there, or did the wind finally blow you away?" and, ~2.5 min
 * later, "Mm? You still there, or did the connection cut out?". The audio never
 * dropped; the caller said "I'm still here" both times. character-silence.ts
 * already told the model not to check, and it did anyway.
 *
 * With the flag on, a presence check goes out at most once per
 * PRESENCE_CHECK_MIN_GAP_MS (default 3 min), unless the caller's audio really
 * dropped (watchRemoteAudio). Inside the gap the silence request carries a note
 * against checking, and the reply itself is held until it is complete
 * (filterSilenceReply, applied in PersonaVoiceAgent.llmNode) and dropped if it
 * is a presence check anyway: the quiet caller hears nothing rather than a check.
 *
 * @module voice-agent/presence-check
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { flagOn } from '../../config/env-flag.js';
import { diag } from '../../services/diagnostic-logger.js';
import { remarkTooSoon, silenceRemarkGuardOn } from './silence-remark-guard.js';
import { contentOf, type ReplyChunk as Chunk } from '../personas/reply-chunks.js';

/** Default minimum gap between two presence checks to a caller whose audio is fine. */
export const PRESENCE_CHECK_MIN_GAP_MS = 180_000;
/** An armed silence reply that never reached the model expires after this long. */
const ARM_TTL_MS = 15_000;
/** A reconnect or poor/lost link this recent still counts as a drop. */
const RECENT_DROP_MS = 30_000;

/**
 * Word-bounded phrases that ask whether the caller is there or can hear
 * (substring-classifier-pitfalls). "Are you there yet?" asks about a place, not
 * the line, so "there" followed by yet/already/at/in/on is not a check.
 */
const PRESENCE_PATTERNS: readonly RegExp[] = [
  /\b(?:are )?you (?:still )?there\b(?!\s+(?:yet|already|at|in|on|by|for)\b)/i,
  /\b(?:you(?:'re| are) )?still (?:with me|on the line|around)\b/i,
  /(?:^|[.!?,>]\s*)still there\s*\?/i, // "Still there?" opening a sentence
  /\b(?:did|have) i lose you\b/i,
  /\b(?:i )?(?:think i )?lost you\b/i,
  /\b(?:did|has|have) (?:the|our|my|your) (?:connection|line|call|audio|signal|mic|wifi|phone)\b.{0,20}\b(?:cut|drop|die|go|fail|freeze|break)/i,
  /\b(?:did|have) (?:we|you) (?:get )?(?:cut off|disconnect|drop)/i,
  /\b(?:can|could) you (?:still )?hear me\b/i,
  /\b(?:is )?(?:any|some)(?:one|body) (?:still )?there\b/i,
  /(?:^|[\s.!,;:>\]-])(?:hello|helloo+)\s*\?/i,
];

/** True when the text asks whether the caller is still there or can hear. */
export function isPresenceCheck(text: string): boolean {
  const plain = text.replace(/<[^>]*>/g, ' ');
  return PRESENCE_PATTERNS.some((p) => p.test(plain));
}

/** Sounds and words that carry nothing on their own: "Mm?", "Yeah?", "Hey, so...". */
const FILLER =
  /\b(?:m+h?m*|h+m+|uh+(?:-?huh)?|um+|oh+|ah+|yeah|yep|yes|hey|hi|hello+|so|okay|ok|or|and|well)\b/gi;

/**
 * True when the text is nothing but a check on the caller: a presence check
 * ("You there?", "Still with me?") or a bare questioning sound ("Mm?",
 * "Yeah?"), with nothing else said. "You still there, or did the music put you
 * to sleep too?" says something more, so it is not bare (the cap still applies).
 */
export function isBarePresenceCheck(text: string): boolean {
  const plain = text.replace(/<[^>]*>|\[[^\]]*\]/g, ' ').trim();
  if (!plain || !(plain.includes('?') || isPresenceCheck(plain))) return false;
  let rest = plain;
  for (const p of PRESENCE_PATTERNS) rest = rest.replace(new RegExp(p.source, 'gi'), ' ');
  return rest.replace(FILLER, ' ').replace(/[^\p{L}\p{N}]+/gu, '') === '';
}

/** PRESENCE_CHECK_MIN_GAP_MS from the environment, or the 3-minute default. */
export function presenceCheckGapMs(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.PRESENCE_CHECK_MIN_GAP_MS);
  return Number.isFinite(n) && n >= 0 && env.PRESENCE_CHECK_MIN_GAP_MS?.trim()
    ? n
    : PRESENCE_CHECK_MIN_GAP_MS;
}

/**
 * Whether a presence check may go out now: the caller's audio dropped, or none
 * has gone out within `gapMs`.
 */
export function presenceCheckAllowed(
  lastCheckAt: number | undefined,
  now: number,
  audioDropped: boolean,
  gapMs: number = presenceCheckGapMs()
): boolean {
  return audioDropped || lastCheckAt === undefined || now - lastCheckAt >= gapMs;
}

// ---------------------------------------------------------------------------
// Per-session state, keyed by the AgentSession object (the handler's `session`
// and the agent's `this.session` are the same object).
// ---------------------------------------------------------------------------

interface PresenceState {
  lastCheckAt?: number;
  /** When the last remark into silence was asked for (SILENCE_REMARK_GUARD). */
  lastRemarkAt?: number;
  /** dropBare: drop a reply that is only "Mm?" / "You there?" (SILENCE_REMARK_GUARD). */
  armed?: { allowPresence: boolean; at: number; dropBare?: boolean };
}

const states = new WeakMap<object, PresenceState>();

function stateOf(session: object): PresenceState {
  let s = states.get(session);
  if (!s) states.set(session, (s = {}));
  return s;
}

/** When the last presence check went out to this session's caller, if ever. */
export function lastPresenceCheckAt(session: object): number | undefined {
  return states.get(session)?.lastCheckAt;
}

/** Note that a presence check went out now. */
export function recordPresenceCheck(session: object, now: number = Date.now()): void {
  stateOf(session).lastCheckAt = now;
}

/** The next reply is a silence remark: hold it for checking (filterSilenceReply). */
export function armSilenceReply(
  session: object,
  allowPresence: boolean,
  now: number = Date.now(),
  dropBare = false
): void {
  stateOf(session).armed = { allowPresence, at: now, dropBare };
}

/** The caller spoke: any armed silence reply is no longer pending. */
export function disarmSilenceReply(session: object): void {
  const s = states.get(session);
  if (s) s.armed = undefined;
}

/** Note appended to the silence request while a presence check is not allowed. */
export const NO_PRESENCE_CHECK_NOTE =
  "[The line is fine and they can hear you; you already know they're there. Don't ask if they're still there, if they can hear you, or if the call dropped. If nothing natural comes to mind, say nothing.]";

interface SilenceRequest {
  instructions?: string;
  fallback?: string;
}

/**
 * Cap one long-silence request: while a check is not allowed, add
 * NO_PRESENCE_CHECK_NOTE and drop a fallback line that is a check. A request
 * for the model arms the reply filter; a bare fallback line that is an allowed
 * check is recorded here, since it never passes the filter.
 */
export function capSilenceRequest<T extends SilenceRequest>(
  session: object,
  request: T,
  audioDropped: boolean,
  now: number = Date.now(),
  dropBare = false
): T {
  const allowPresence = presenceCheckAllowed(lastPresenceCheckAt(session), now, audioDropped);
  if (request.instructions) armSilenceReply(session, allowPresence, now, dropBare);
  else if (allowPresence && request.fallback && isPresenceCheck(request.fallback)) {
    recordPresenceCheck(session, now);
  }
  if (allowPresence) return request;
  return {
    ...request,
    instructions: request.instructions && `${request.instructions}\n${NO_PRESENCE_CHECK_NOTE}`,
    fallback: request.fallback && isPresenceCheck(request.fallback) ? '' : request.fallback,
  };
}

/** The long-silence path's handle on the cap (session-state-handler.ts). */
export interface PresenceCap {
  /** The caller spoke: a pending silence remark is no longer pending. */
  callerSpoke: () => void;
  /** SILENCE_REMARK_GUARD: a remark went out under a minute ago, even if the caller spoke since. */
  held: () => boolean;
  /** Cap one long-silence request; unchanged when both flags are off. */
  cap: <T extends SilenceRequest>(request: T) => T;
  stop: () => void;
}

/**
 * PRESENCE_CHECK_CAP=on: cap presence checks for this session.
 * SILENCE_REMARK_GUARD=on: at most one remark a minute across the caller's
 * turns, and a reply that is only a check is dropped unless the audio dropped.
 * Both off: change nothing.
 */
export function createPresenceCap(
  session: object,
  room: RoomLike | undefined,
  env: Record<string, string | undefined> = process.env
): PresenceCap {
  const capOn = flagOn('PRESENCE_CHECK_CAP', env);
  const guardOn = silenceRemarkGuardOn(env);
  if (!capOn && !guardOn) {
    return {
      callerSpoke: () => undefined,
      held: () => false,
      cap: (request) => request,
      stop: () => undefined,
    };
  }
  const audio = watchRemoteAudio(room);
  return {
    callerSpoke: () => disarmSilenceReply(session),
    held: () => {
      const held = guardOn && remarkTooSoon(states.get(session)?.lastRemarkAt, Date.now());
      if (held) diag.state('🤫 [SILENCE] Skipped - a remark went out under a minute ago');
      return held;
    },
    cap: (request) => {
      const now = Date.now();
      const dropped = audio.dropped(now);
      if (guardOn) stateOf(session).lastRemarkAt = now;
      if (capOn) return capSilenceRequest(session, request, dropped, now, guardOn && !dropped);
      if (request.instructions) armSilenceReply(session, true, now, !dropped);
      return request;
    },
    stop: () => audio.stop(),
  };
}

/**
 * When a silence reply is armed for this session, hold the whole reply (a
 * one-sentence remark into silence has no latency to protect), then drop its
 * words if it is a presence check that isn't allowed; record one that is.
 * Anything else, and every reply when nothing is armed, passes unchanged.
 */
export function filterSilenceReply<T extends Chunk>(
  session: object,
  reply: ReadableStream<T> | null,
  now: () => number = Date.now
): ReadableStream<T> | null {
  const s = states.get(session);
  const armed = s?.armed;
  if (!reply || !s || !armed) return reply;
  s.armed = undefined;
  if (now() - armed.at > ARM_TTL_MS) return reply;
  return new ReadableStream<T>({
    async start(controller) {
      try {
        const held: T[] = [];
        let text = '';
        for await (const chunk of reply as unknown as AsyncIterable<T>) {
          held.push(chunk);
          text += contentOf(chunk) ?? '';
        }
        const check = isPresenceCheck(text);
        const bare = Boolean(armed.dropBare) && isBarePresenceCheck(text);
        const drop = bare || (check && !armed.allowPresence);
        if (check && !drop) recordPresenceCheck(session, now());
        if (check || bare) diag.state('🤫 [SILENCE] Presence check', { spoken: !drop, bare });
        for (const chunk of held)
          if (!drop || contentOf(chunk) === undefined) controller.enqueue(chunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Did the caller's audio really drop? The room already knows: the caller's
// microphone publication (muted or gone), the participant leaving, the room
// reconnecting, and per-participant connection quality (poor or lost). The
// first two are read from room.remoteParticipants when asked; the others only
// arrive as room events, so they are recorded as they come.
// ---------------------------------------------------------------------------

/** The parts of an rtc-node Room this reads. */
export interface RoomLike {
  remoteParticipants?: Map<string, unknown>;
  // Method syntax: Room.on is generic over its event names, and only a method's
  // parameters are compared bivariantly, so the real Room fits.
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  on?(event: string, listener: (...args: unknown[]) => void): unknown;
  // eslint-disable-next-line @typescript-eslint/method-signature-style
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

interface PublicationLike {
  kind?: number;
  muted?: boolean;
}

const KIND_AUDIO = 1; // TrackKind.KIND_AUDIO
const QUALITY_POOR = 0; // ConnectionQuality.QUALITY_POOR
const QUALITY_LOST = 3; // ConnectionQuality.QUALITY_LOST

/** True when some remote participant has an unmuted audio publication. */
function remoteAudioLive(room: RoomLike): boolean {
  for (const p of room.remoteParticipants?.values() ?? []) {
    const pubs = (p as { trackPublications?: Map<string, PublicationLike> }).trackPublications;
    for (const pub of pubs?.values() ?? []) if (pub.kind === KIND_AUDIO && !pub.muted) return true;
  }
  return false;
}

export interface AudioDropWatch {
  /** True when the caller's audio dropped (now, or within the last 30 s). */
  dropped: (now?: number) => boolean;
  stop: () => void;
}

/**
 * Watch a room for evidence that the caller's audio dropped. Without a room
 * there is no evidence, and nothing counts as a drop.
 */
export function watchRemoteAudio(room: RoomLike | undefined): AudioDropWatch {
  if (!room) return { dropped: () => false, stop: () => undefined };
  let reconnecting = false;
  let lastDropAt = -Infinity;
  const badQuality = new Set<string>();
  const remote = (p: unknown): string | undefined => {
    const id = (p as { identity?: string } | undefined)?.identity;
    return id !== undefined && room.remoteParticipants?.has(id) ? id : undefined;
  };
  const listeners: Record<string, (...args: unknown[]) => void> = {
    reconnecting: () => {
      reconnecting = true;
      lastDropAt = Date.now();
    },
    reconnected: () => {
      reconnecting = false;
      lastDropAt = Date.now();
    },
    participantDisconnected: () => {
      lastDropAt = Date.now();
    },
    connectionQualityChanged: ((quality: number, participant: unknown) => {
      const id = remote(participant);
      if (id === undefined) return;
      if (quality === QUALITY_POOR || quality === QUALITY_LOST) {
        badQuality.add(id);
        lastDropAt = Date.now();
      } else badQuality.delete(id);
    }) as (...args: unknown[]) => void,
  };
  for (const [event, fn] of Object.entries(listeners)) room.on?.(event, fn);
  return {
    dropped: (now = Date.now()) =>
      reconnecting ||
      badQuality.size > 0 ||
      now - lastDropAt < RECENT_DROP_MS ||
      !remoteAudioLive(room),
    stop: () => {
      for (const [event, fn] of Object.entries(listeners)) room.off?.(event, fn);
    },
  };
}
