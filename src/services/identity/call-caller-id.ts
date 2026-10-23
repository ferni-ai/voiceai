/**
 * The user id a tool call runs as, when the call itself names nobody usable.
 *
 * PRIVACY: tools key a caller's data by this id. A member, or a minted per-call
 * `anon:<id>` / `onbehalf:<id>`, is used as given. A missing id, a placeholder
 * (`anonymous`, `unknown`, `anon`, `gateway`, ...; PLACEHOLDER_IDS) or a bare
 * `anon:` is one bucket every id-less caller shares, so it is replaced by ONE
 * anon: id per session: the caller's note is there when they ask for it later
 * in the call, and no other session ever sees it.
 *
 * @module services/identity/call-caller-id
 */
import { isMemberIdentity } from './member-identity.js';
import { newAnonymousId } from './anonymous-session-id.js';
import { nonAccountPrefixOf } from '../../utils/synthetic-user.js';

/** Most string-keyed sessions remembered at once; the oldest is dropped first. */
const MAX_SESSIONS = 5000;
const bySessionId = new Map<string, string>();
const bySessionObject = new WeakMap<object, string>();

/** Whether `id` is usable as given: a member, or a minted anon:/onbehalf: id with a body. */
function usable(id: string): boolean {
  const prefix = nonAccountPrefixOf(id.toLowerCase());
  if (prefix !== undefined) return id.length > prefix.length;
  return isMemberIdentity(id);
}

/**
 * `userId` when usable; otherwise this session's anon: id, minted on first use.
 * `session` is the session id or a per-session object (a RunContext's session or
 * userData). With neither, every call gets a fresh anon: id.
 */
export function callerIdFor(userId: unknown, session?: string | object | null): string {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (usable(id)) return id;
  if (session && typeof session === 'object') {
    const existing = bySessionObject.get(session) ?? newAnonymousId();
    bySessionObject.set(session, existing);
    return existing;
  }
  if (typeof session !== 'string' || !session) return newAnonymousId();
  const existing = bySessionId.get(session);
  if (existing) return existing;
  const minted = newAnonymousId();
  bySessionId.set(session, minted);
  if (bySessionId.size > MAX_SESSIONS) bySessionId.delete(bySessionId.keys().next().value!);
  return minted;
}
