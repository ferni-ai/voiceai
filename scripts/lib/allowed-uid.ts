/**
 * The consent guard for scripts that read one person's private data
 * (their calls, memories, profile). Only uids listed in
 * MEMORY_EVAL_ALLOWED_UIDS (comma-separated, set outside the repo) may be
 * read. A refusal never echoes the uid, so a typo'd or unlisted id doesn't
 * end up in a terminal log.
 */
export const ALLOWLIST_ENV = 'MEMORY_EVAL_ALLOWED_UIDS';
export const REFUSED = 'uid not in allowlist';

type Env = Record<string, string | undefined>;

/** The uids that have agreed to their data being read by these scripts. */
export function allowedUids(env: Env = process.env): ReadonlySet<string> {
  return new Set(
    (env[ALLOWLIST_ENV] ?? '')
      .split(',')
      .map((uid) => uid.trim())
      .filter(Boolean)
  );
}

export function isAllowedUid(uid: string | undefined, env: Env = process.env): boolean {
  return !!uid && allowedUids(env).has(uid);
}

/** Returns the uid if it is listed; otherwise throws REFUSED, without the uid. */
export function assertAllowedUid(uid: string | undefined, env: Env = process.env): string {
  if (!uid || !allowedUids(env).has(uid)) throw new Error(REFUSED);
  return uid;
}
