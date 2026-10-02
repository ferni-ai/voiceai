/**
 * Ephemeral identities — keys that must never hold durable memory.
 *
 * A caller we cannot tie to any stable identity (no account, no persistent
 * device id, no phone number) gets an explicit `ephemeral:` id for the
 * session. Session code may use it for in-memory state, but durable memory
 * writers must skip it: a per-session key would just strand memories that no
 * later call can ever find.
 *
 * Also recognised (and refused) as memory keys: the legacy per-session
 * `anon:<timestamp>` ids, raw voice session ids, and shared placeholders such
 * as `anonymous` / `unknown` that would mix many people's memories together.
 *
 * @module utils/ephemeral-identity
 */

export const EPHEMERAL_PREFIX = 'ephemeral:';

/** Shared placeholder ids that are never one person. */
const PLACEHOLDER_IDS: ReadonlySet<string> = new Set([
  'anonymous',
  'anon',
  'unknown',
  'guest',
  'visitor',
  'undefined',
  'null',
  'default',
  'user',
]);

/** Per-session id shapes: legacy anonymous ids and voice session ids. */
const PER_SESSION_PATTERNS: readonly RegExp[] = [/^ephemeral:/, /^anon:/, /^session[-_:]/];

/** The explicit ephemeral id for a session with no stable identity. */
export function ephemeralUserIdFor(sessionKey: string): string {
  return `${EPHEMERAL_PREFIX}${sessionKey}`;
}

/**
 * True when `id` must not be used as a durable memory key: empty, a shared
 * placeholder, or a per-session id.
 */
export function isEphemeralUserId(id: string | null | undefined): boolean {
  if (!id) return true;
  const trimmed = id.trim();
  if (trimmed.length === 0) return true;
  if (PLACEHOLDER_IDS.has(trimmed.toLowerCase())) return true;
  return PER_SESSION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** True when `id` can safely key durable memory. */
export function isDurableUserId(id: string | null | undefined): id is string {
  return !isEphemeralUserId(id);
}
