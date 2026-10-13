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
 */

export const EMPTY_ROOM_GRACE_MS = 5_000;
export const IDLE_MS = 10 * 60_000;
export const MAX_CALL_MS = 3 * 60 * 60_000;

type Listener = (...args: unknown[]) => void;

/** The slice of a LiveKit Room this needs, so tests can pass a fake. */
export interface WatchedRoom {
  isConnected: boolean;
  remoteParticipants: { size: number };
  on(event: string, listener: Listener): unknown;
  off(event: string, listener: Listener): unknown;
}

export interface SessionEndOptions {
  idleMs?: number;
  maxMs?: number;
  emptyGraceMs?: number;
  pollMs?: number;
}

const ACTIVITY_EVENTS = ['dataReceived', 'participantConnected', 'trackSubscribed'] as const;

/** Resolves with why the call ended: room.disconnected, room.!isConnected, empty_room, idle or max_duration. */
export function waitForSessionEnd(room: WatchedRoom, options: SessionEndOptions = {}): Promise<string> {
  const idleMs = options.idleMs ?? IDLE_MS;
  const maxMs = options.maxMs ?? MAX_CALL_MS;
  const emptyGraceMs = options.emptyGraceMs ?? EMPTY_ROOM_GRACE_MS;

  return new Promise<string>((resolve) => {
    let settled = false;
    let emptySinceMs: number | null = null;
    let lastActivityMs = Date.now();

    const touch = (): void => {
      lastActivityMs = Date.now();
    };
    const onSpeakers = (speakers: unknown): void => {
      if (Array.isArray(speakers) && speakers.length > 0) touch();
    };
    const onDisconnected = (): void => finish('room.disconnected');
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

    const poll = setInterval(() => {
      if (!room.isConnected) return finish('room.!isConnected');
      if (room.remoteParticipants.size === 0) {
        emptySinceMs = emptySinceMs ?? Date.now();
        if (Date.now() - emptySinceMs >= emptyGraceMs) return finish('empty_room');
      } else {
        emptySinceMs = null;
      }
      if (Date.now() - lastActivityMs >= idleMs) finish('idle');
    }, options.pollMs ?? 1_000);

    const cap = setTimeout(() => finish('max_duration'), maxMs);
  });
}
