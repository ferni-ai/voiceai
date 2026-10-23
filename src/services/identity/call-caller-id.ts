/**
 * The user id a tool call runs as, when the call itself names nobody usable.
 *
 * PRIVACY: tools key a caller's data by this id. A member, or a minted per-call
 * `anon:<id>` / `onbehalf:<id>`, is used as given. A missing id, a placeholder
 * (`anonymous`, `unknown`, `anon`, `gateway`, ...; PLACEHOLDER_IDS) or a bare
 * `anon:` is one bucket every id-less caller shares, so it is replaced by an
 * anon: id of this session's own: the caller's note is there when they ask for
 * it later in the call, and no other session ever sees it.
 *
 * The session key must be server-minted, or two callers share one id again:
 * - an object the server creates per session (a RunContext's AgentSession or
 *   its userData), held in a WeakMap so it goes when the session does; or
 * - a voice session id in the form voice-agent-entry mints,
 *   `session-<LiveKit job id>-<epoch ms>`. Anything else (empty, a placeholder,
 *   a fallback like `session-<ms>`, anything a client could pick) gets a fresh
 *   anon: id on every call.
 *
 * @module services/identity/call-caller-id
 */
import { isMemberIdentity } from './member-identity.js';
import { newAnonymousId } from './anonymous-session-id.js';
import { nonAccountPrefixOf } from '../../utils/synthetic-user.js';

/** `session-${ctx.job.id}-${Date.now()}` (voice-agent-entry/index.ts): server-minted only. */
const SERVER_SESSION_ID = /^session-([A-Za-z0-9_]+)-(\d{13})$/;
/** A voice session is over long before this; its entry is dropped on the next mint. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;

const bySessionId = new Map<string, string>();
const bySessionObject = new WeakMap<object, string>();

/** Whether `id` is usable as given: a member, or a minted anon:/onbehalf: id with a body. */
function usable(id: string): boolean {
  const prefix = nonAccountPrefixOf(id.toLowerCase());
  if (prefix !== undefined) return id.length > prefix.length;
  return isMemberIdentity(id);
}

/** Drop sessions older than the TTL, then the oldest beyond the cap. */
function prune(now: number): void {
  for (const key of bySessionId.keys()) {
    const started = Number(SERVER_SESSION_ID.exec(key)?.[2]);
    if (now - started > SESSION_TTL_MS || bySessionId.size > MAX_SESSIONS) bySessionId.delete(key);
    else break; // insertion order is start order, so the rest are newer
  }
}

/**
 * `userId` when usable; otherwise this session's anon: id, minted on first use.
 * `session` is a server-created per-session object or a server-minted voice
 * session id (see the module doc). Anything else: a fresh anon: id per call.
 */
export function callerIdFor(userId: unknown, session?: string | object | null): string {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (usable(id)) return id;
  if (session && typeof session === 'object') {
    const existing = bySessionObject.get(session) ?? newAnonymousId();
    bySessionObject.set(session, existing);
    return existing;
  }
  if (typeof session !== 'string' || !SERVER_SESSION_ID.test(session)) return newAnonymousId();
  const existing = bySessionId.get(session);
  if (existing) return existing;
  const minted = newAnonymousId();
  bySessionId.set(session, minted);
  prune(Date.now());
  return minted;
}
