/**
 * Ferni's reply audio held by a soft pause (BARGE_IN_SOFT_PAUSE,
 * multi-agent/barge-in-soft-pause.ts) while LiveKit still reads him as
 * 'speaking'.
 *
 * LiveKit's own pause for the caller's voice moves its agent state to
 * 'listening'. A soft pause calls the audio output's pause() directly, and
 * that emits nothing, so the call-alert speaker (call-alerts.ts), which counts
 * playout by agent state, counted held time as heard (#2545). The soft pause
 * marks the hold here; the speaker reads it and stops its clock.
 *
 * @module agents/shared/playout-hold
 */

type Listener = () => void;

const held = new WeakSet<object>();
const listeners = new WeakMap<object, Set<Listener>>();

/** Mark this call's reply audio held (true) or playing again (false); tells the watchers. */
export function setPlayoutHeld(session: object, on: boolean): void {
  if (held.has(session) === on) return;
  if (on) held.add(session);
  else held.delete(session);
  for (const fn of [...(listeners.get(session) ?? [])]) fn();
}

export function playoutHeld(session: object): boolean {
  return held.has(session);
}

/** Call `fn` on each hold or release in this call; returns the unsubscribe. */
export function onPlayoutHeldChange(session: object, fn: Listener): () => void {
  const set = listeners.get(session) ?? new Set<Listener>();
  listeners.set(session, set.add(fn));
  return () => {
    set.delete(fn);
  };
}
