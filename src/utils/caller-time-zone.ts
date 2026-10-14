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
/** Stored for a call with no zone of its own: its ids read as none, never another call's. */
const NONE = '';
/** Users with an open call that has no zone, and those calls' sessions. */
const zonelessCalls = new Map<string, Set<string>>();

function set(id: unknown, zone: string): void {
  if (typeof id !== 'string' || !id) return;
  zones.delete(id);
  zones.set(id, zone);
  while (zones.size > MAX_ENTRIES) zones.delete(zones.keys().next().value as string);
}

/** Records the zone under each id a reader may key the call by. */
export function rememberCallerTimeZone(timeZone: unknown, ...ids: unknown[]): void {
  if (!isValidTimeZone(timeZone)) return;
  for (const id of ids) set(id, timeZone);
}

/**
 * A call with no zone of its own (yet). Its own ids read as none. While it is
 * open, its user id gives no zone either: a lookup by user id alone can't tell
 * this call from another of theirs (the owner's app call, say). The user id's
 * entry stays for the user's calls that look up by session. Returns the release.
 */
export function markZonelessCall(
  sessionId: string,
  userId: unknown,
  ...ids: unknown[]
): () => void {
  for (const id of [sessionId, ...ids]) set(id, NONE);
  if (typeof userId !== 'string' || !userId) return () => undefined;
  const open = zonelessCalls.get(userId) ?? new Set<string>();
  zonelessCalls.set(userId, open.add(sessionId));
  return () => {
    open.delete(sessionId);
    if (open.size === 0 && zonelessCalls.get(userId) === open) zonelessCalls.delete(userId);
  };
}

/** Forgets these ids' zones (tests, and a fresh start for an id). */
export function forgetCallerTimeZone(...ids: unknown[]): void {
  for (const id of ids) if (typeof id === 'string') zones.delete(id);
}

export function callerTimeZoneFor(id: string): string | undefined {
  return zones.get(id) || undefined;
}

/** By user id alone: none while one of their calls has no zone of its own. */
function byUser(userId: unknown): string | undefined {
  if (typeof userId !== 'string' || zonelessCalls.has(userId)) return undefined;
  return zones.get(userId) || undefined;
}

/** The zone of the user's current call: its own session's, else (no entry) by user id. */
export function userTimeZone(ids: { sessionId?: string; userId?: string }): string | undefined {
  if (ids.sessionId && zones.has(ids.sessionId)) return zones.get(ids.sessionId) || undefined;
  return byUser(ids.userId);
}

type RunData = { userId?: unknown; callerTimezone?: unknown; services?: { sessionId?: unknown } };

/**
 * The zone for a tool given LiveKit's run context (`execute(args, { ctx })`),
 * whose userData carries the call's own zone, its session and the user id.
 * The call's own entries come first.
 */
export function runContextTimeZone(ctx: unknown): string | undefined {
  const data = (ctx as { userData?: RunData } | undefined)?.userData;
  if (isValidTimeZone(data?.callerTimezone)) return data.callerTimezone;
  const sessionId = data?.services?.sessionId;
  if (typeof sessionId === 'string' && zones.has(sessionId))
    return zones.get(sessionId) || undefined;
  return byUser(data?.userId);
}
