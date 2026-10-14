/**
 * The caller's time zone per call, recorded when the call starts: the
 * browser's zone from the dispatch metadata, else the profile's contactInfo
 * zone, only for the account's verified owner (agents/voice-agent-entry/
 * phone-parity.ts; a phone call carries no browser zone). Memory writers read it by
 * session id; tools that schedule things read it by session or user id so
 * "tomorrow at noon" means noon where the user is.
 *
 * Bounded: a worker runs a handful of calls at a time, so old entries are
 * just left over from earlier calls.
 *
 * @module utils/caller-time-zone
 */

import { isValidTimeZone } from './time-zone.js';

const MAX_ENTRIES = 200;
const zones = new Map<string, string>();

/** Records the zone under each id a reader may key the call by. */
export function rememberCallerTimeZone(timeZone: unknown, ...ids: unknown[]): void {
  if (!isValidTimeZone(timeZone)) return;
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    zones.delete(id);
    zones.set(id, timeZone);
  }
  while (zones.size > MAX_ENTRIES) zones.delete(zones.keys().next().value as string);
}

/** Forgets these ids' zones: a call with no zone of its own must not inherit an earlier call's. */
export function forgetCallerTimeZone(...ids: unknown[]): void {
  for (const id of ids) if (typeof id === 'string') zones.delete(id);
}

export function callerTimeZoneFor(id: string): string | undefined {
  return zones.get(id);
}

/** The zone of the user's current call: by session first, then by user. */
export function userTimeZone(ids: { sessionId?: string; userId?: string }): string | undefined {
  return (
    (ids.sessionId ? zones.get(ids.sessionId) : undefined) ??
    (ids.userId ? zones.get(ids.userId) : undefined)
  );
}

type RunData = { userId?: unknown; callerTimezone?: unknown; services?: { sessionId?: unknown } };

/**
 * The zone for a tool given LiveKit's run context (`execute(args, { ctx })`),
 * whose userData carries the call's own zone, its session and the user id.
 * The call's own entries come first: the user id's may have been written by
 * another call.
 */
export function runContextTimeZone(ctx: unknown): string | undefined {
  const data = (ctx as { userData?: RunData } | undefined)?.userData;
  if (isValidTimeZone(data?.callerTimezone)) return data.callerTimezone;
  const sessionId = data?.services?.sessionId;
  const own = typeof sessionId === 'string' ? zones.get(sessionId) : undefined;
  return own ?? (typeof data?.userId === 'string' ? zones.get(data.userId) : undefined);
}
