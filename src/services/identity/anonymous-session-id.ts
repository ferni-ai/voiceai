/**
 * One anonymous id per session, collision-safe.
 *
 * A caller nobody recognises (an inbound phone call with fixed SIP metadata,
 * say) used to get `anon:${Date.now()}` from every identifyFromMetadata call.
 * One session makes several of those calls on the same parsed dispatch
 * metadata (the voice agent's identifyUser, then the identity session, then
 * natural auth), so it minted two or three ids milliseconds apart. Memory
 * written under one was never read back under another: on 2026-10-13 Ferni told
 * a caller "our very first time talking" four minutes after their last call
 * ended. Two sessions starting in the same millisecond also shared an id.
 *
 * The id is minted once per metadata object, which is the session's parsed
 * dispatch, and reused for every later call on it. It is keyed by the object,
 * never by its contents: inbound SIP dispatches carry identical fixed metadata,
 * so a content key would merge different strangers into one id.
 *
 * @module services/identity/anonymous-session-id
 */
import { randomUUID } from 'crypto';
import { nonAccountPrefixOf } from '../../utils/synthetic-user.js';

const minted = new WeakMap<object, string>();

/** A fresh, collision-safe anonymous id */
export function newAnonymousId(): string {
  return `anon:${randomUUID()}`;
}

/** The anonymous id for this session's dispatch metadata: minted on first use, then reused */
export function anonymousIdFor(metadata: object): string {
  const existing = minted.get(metadata);
  if (existing) return existing;
  const id = newAnonymousId();
  minted.set(metadata, id);
  return id;
}

/**
 * The anonymous id for a caller nobody recognised. A `session_id` the dispatch
 * carries is kept, but this is the last-resort ANONYMOUS fallback, so it can
 * never name a real account: without a non-account prefix it gets `anon:`.
 * With no `session_id`, the session's minted id (anonymousIdFor).
 */
export function anonymousSessionId(metadata: Record<string, unknown>): string {
  const given = metadata.session_id;
  if (typeof given !== 'string' || !given) return anonymousIdFor(metadata);
  // An id that already names no account (anon:, onbehalf:) is kept as the dispatch gave it.
  return nonAccountPrefixOf(given) ? given : `anon:${given}`;
}
