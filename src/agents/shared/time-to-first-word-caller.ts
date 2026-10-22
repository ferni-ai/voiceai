/**
 * Where the entry tells a call's TTFW watch (time-to-first-word.ts) who the
 * caller is. Kept apart from the watch so the entry's caller path does not
 * load the TTS gateway: this module imports nothing at run time.
 *
 * @module agents/shared/time-to-first-word-caller
 */
import type { ParticipantLike } from './time-to-first-word-record.js';

export interface CallerBinding {
  bindCaller: (sessionId: string, participant: ParticipantLike) => void;
}

/** One watch per room, present only while TTFW_METRIC is on and the call is measured. */
const bindings = new WeakMap<object, CallerBinding>();

export function registerTtfwRoom(room: object, binding: CallerBinding): void {
  bindings.set(room, binding);
}

export function unregisterTtfwRoom(room: object): void {
  bindings.delete(room);
}

/** The entry noted the caller: bind this room's watch to the session (no-op when not watching). */
export function noteTtfwCaller(
  room: object,
  sessionId: string,
  participant: ParticipantLike
): void {
  bindings.get(room)?.bindCaller(sessionId, participant);
}
