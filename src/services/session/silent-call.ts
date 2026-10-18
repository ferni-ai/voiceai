/**
 * A call where the caller never spoke is not a conversation.
 *
 * saveProfile() counted every session: a first-time caller who heard the
 * greeting and left 6 s later without a word (prod AJ_HQ5ShVbCN3CY,
 * 2026-10-18) got totalConversations 0 -> 1 and the summary "Had a 1-minute
 * conversation", because the safeguard counts Ferni's greeting as a turn. On
 * the next call they are treated as returning and told "Last time you talked
 * about: Had a 1-minute conversation".
 *
 * SILENT_CALL_SKIP_PROFILE=on skips the end-of-call profile update when no
 * caller turn was recorded. Off by default; read on every call.
 *
 * @module services/session/silent-call
 */

export function silentCallSkipProfileEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SILENT_CALL_SKIP_PROFILE === 'on';
}

/** True when the flag is on and none of the turns came from the caller. */
export function shouldSkipProfileForSilentCall(
  turns: ReadonlyArray<{ readonly role: string }>,
  env: Record<string, string | undefined> = process.env
): boolean {
  return silentCallSkipProfileEnabled(env) && !turns.some((t) => t.role === 'user');
}
