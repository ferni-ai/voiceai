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
