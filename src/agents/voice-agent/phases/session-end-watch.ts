/**
 * When a multi-agent call is over: the room disconnects, the caller has left
 * (empty room for EMPTY_ROOM_GRACE_MS), nobody has spoken or sent anything for
 * IDLE_MS, or the call hits MAX_CALL_MS.
 *
 * The idle clock restarts on every sign of life: someone speaking (LiveKit
 * active speakers, which covers the caller and the agent), a data message, a
 * participant or track arriving. Before 2026-10-12 a fixed 10-minute timer that
 * nothing reset ended every multi-agent call at 10 minutes, mid-conversation
 * (prod: caller turns at 07:57:12 and 07:57:20, hung up at 07:57:23).
 *
 * A caller hanging up often ends the room before the grace runs out: LiveKit
 * deletes the room and the agent's connection closes. That is 'caller_left', not
 * the agent losing the room (prod 2026-10-17..18: 5 of 6 'room.disconnected'
 * endings came 2.5-3 s after the caller's own "Participant left").
 *
 * IDLE_END_CHECKIN (idle-checkin.ts) passes `idleCheckIn`: windowMs before the idle end Ferni
 * checks in once, and the caller then has windowMs to answer. Without it the idle end is as above.
 */

import { roomDisconnectEndReason } from '../../../services/analytics/call-end-reason.js';

export const EMPTY_ROOM_GRACE_MS = 5_000;
export const IDLE_MS = 10 * 60_000;
export const MAX_CALL_MS = 3 * 60 * 60_000;

type Listener = (...args: unknown[]) => void;

/** The slice of a LiveKit Room this needs, so tests can pass a fake. */
export interface WatchedRoom {
  isConnected: boolean;
  /** The agent's own participant: its voice is not the caller's (IDLE_END_CHECKIN). */
  localParticipant?: { identity: string };
  remoteParticipants: { size: number };
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
}

export interface SessionEndOptions {
  idleMs?: number;
  maxMs?: number;
  /** Reason the cap timer settles with (default max_duration). */
  maxReason?: string;
  emptyGraceMs?: number;
  pollMs?: number;
  idleCheckIn?: IdleCheckIn;
}

export type IdleCheckInOutcome = 'resumed' | 'ended' | 'skipped_crisis' | 'skipped_blocked';

/** One spoken check-in before the idle end (IDLE_END_CHECKIN, idle-checkin.ts). */
export interface IdleCheckIn {
  /** How long before the idle end the check-in comes, and how long the caller then has. */
  windowMs: number;
  /** The call is in a crisis state: no check-in, and it ends as it would without one. */
  crisis: () => boolean;
  /** Says the check-in, the caller quiet for callerQuietMs; false when nothing was said. */
  speak: (callerQuietMs: number) => boolean;
  onOutcome: (outcome: IdleCheckInOutcome) => void;
}

/** A hook that throws: the crisis read counts as crisis, the check-in as not said. */
function safely(read: () => boolean, onThrow: boolean): boolean {
  try {
    return read();
  } catch {
    return onThrow;
  }
}

/**
 * IDLE_END_CHECKIN over one call, asked on each poll: 'end', 'hold' (the check-in's window is
 * running) or 'pass' (the usual idle rule decides). Checks in at most once a call.
 */
function idleCheckInClock(checkIn: IdleCheckIn, idleMs: number) {
  let spent = false;
  let checkedInAt: number | null = null;
  const skip = (outcome: IdleCheckInOutcome): 'pass' => {
    checkIn.onOutcome(outcome);
    return 'pass';
  };
  return (now: number, lastActivityMs: number, lastCallerMs: number): 'end' | 'hold' | 'pass' => {
    if (checkedInAt === null) {
      if (spent || now - lastActivityMs < idleMs - checkIn.windowMs) return 'pass';
      spent = true;
      if (safely(checkIn.crisis, true)) return skip('skipped_crisis');
      if (!safely(() => checkIn.speak(now - lastCallerMs), false)) return skip('skipped_blocked');
      checkedInAt = now;
      return 'hold';
    }
    if (lastCallerMs > checkedInAt) {
      checkedInAt = null; // they answered: the usual idle clock from here, no second check-in
      return skip('resumed');
    }
    if (safely(checkIn.crisis, true)) {
      checkedInAt = null; // crisis since the check-in: the usual idle rule, never an earlier end
      return 'pass';
    }
    if (now - checkedInAt < checkIn.windowMs) return 'hold';
    checkIn.onOutcome('ended');
    return 'end';
  };
}

const ACTIVITY_EVENTS = ['dataReceived', 'participantConnected', 'trackSubscribed'] as const;

/** Resolves with why the call ended: room.disconnected or room.closed, room.!isConnected, caller_left, empty_room, idle or max_duration (or options.maxReason). */
export function waitForSessionEnd(
  room: WatchedRoom,
  options: SessionEndOptions = {}
): Promise<string> {
  const idleMs = options.idleMs ?? IDLE_MS;
  const maxMs = options.maxMs ?? MAX_CALL_MS;
  const emptyGraceMs = options.emptyGraceMs ?? EMPTY_ROOM_GRACE_MS;

  return new Promise<string>((resolve) => {
    let settled = false;
    let emptySinceMs: number | null = null;
    let lastActivityMs = Date.now();
    /** Activity that isn't the agent's own voice (IDLE_END_CHECKIN). */
    let lastCallerMs = lastActivityMs;

    const touch = (): void => {
      lastActivityMs = Date.now();
      lastCallerMs = lastActivityMs;
    };
    const agentVoice = (speaker: unknown): boolean => {
      const self = room.localParticipant?.identity;
      return self !== undefined && (speaker as { identity?: unknown } | null)?.identity === self;
    };
    const onSpeakers = (speakers: unknown): void => {
      if (!Array.isArray(speakers) || speakers.length === 0) return;
      lastActivityMs = Date.now();
      if (!speakers.every(agentVoice)) lastCallerMs = lastActivityMs;
    };
    const lost = (reason: string): string => (emptySinceMs === null ? reason : 'caller_left');
    const onDisconnected = (reason?: unknown): void =>
      finish(lost(roomDisconnectEndReason(reason)));
    const onParticipantLeft = (): void => {
      if (room.remoteParticipants.size === 0) emptySinceMs = emptySinceMs ?? Date.now();
    };

    const finish = (reason: string): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(cap);
      room.off('disconnected', onDisconnected);
      room.off('participantDisconnected', onParticipantLeft);
      room.off('activeSpeakersChanged', onSpeakers);
      for (const event of ACTIVITY_EVENTS) room.off(event, touch);
      resolve(reason);
    };

    room.on('disconnected', onDisconnected);
    room.on('participantDisconnected', onParticipantLeft);
    room.on('activeSpeakersChanged', onSpeakers);
    for (const event of ACTIVITY_EVENTS) room.on(event, touch);

    const checkIn = options.idleCheckIn && idleCheckInClock(options.idleCheckIn, idleMs);

    const poll = setInterval(() => {
      if (!room.isConnected) return finish(lost('room.!isConnected'));
      if (room.remoteParticipants.size === 0) {
        emptySinceMs = emptySinceMs ?? Date.now();
        if (Date.now() - emptySinceMs >= emptyGraceMs) return finish('empty_room');
      } else {
        emptySinceMs = null;
      }
      const step = checkIn?.(Date.now(), lastActivityMs, lastCallerMs) ?? 'pass';
      if (step === 'end') return finish('idle');
      if (step === 'pass' && Date.now() - lastActivityMs >= idleMs) finish('idle');
    }, options.pollMs ?? 1_000);

    const cap = setTimeout(() => finish(options.maxReason ?? 'max_duration'), maxMs);
  });
}
