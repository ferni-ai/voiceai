/**
 * The consent guard for scripts that read one person's private data
 * (their calls, memories, profile). Only uids listed in
 * MEMORY_EVAL_ALLOWED_UIDS (comma-separated, set outside the repo) may be
 * read. A refusal never echoes the uid, so a typo'd or unlisted id doesn't
 * end up in a terminal log. Plain .mjs so the node-run voice-eval scripts
 * can use it too; types in allowed-uid.d.mts.
 */
export const ALLOWLIST_ENV = 'MEMORY_EVAL_ALLOWED_UIDS';
export const REFUSED = 'uid not in allowlist';

/** The uids that have agreed to their data being read by these scripts. */
export function allowedUids(env = process.env) {
  return new Set(
    (env[ALLOWLIST_ENV] ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );
}

export function isAllowedUid(uid, env = process.env) {
  return !!uid && allowedUids(env).has(uid);
}

/** Returns the uid if it is listed; otherwise throws REFUSED, without the uid. */
export function assertAllowedUid(uid, env = process.env) {
  if (!uid || !allowedUids(env).has(uid)) throw new Error(REFUSED);
  return uid;
}
