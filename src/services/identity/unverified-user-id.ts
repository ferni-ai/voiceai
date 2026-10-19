/**
 * Whether a user id names nobody anyone has verified.
 *
 * Some ids are minted for whoever turns up, or from something the caller
 * supplies: a per-session anon:<uuid> (anonymous-session-id.ts), a
 * device:<deviceId> the client sends, a phone:<number> from caller ID (which can
 * be spoofed), and the placeholders used when there is no id at all. Anything
 * keyed on such an id (a per-person allowance, a saved record) can be reset or
 * borrowed by changing it, so callers treat all of them as one stranger.
 *
 * voice-pattern-session.ts (isIdentifiedUser) and identity-linking.ts keep the
 * same rule inline for anon: and device:.
 *
 * @module services/identity/unverified-user-id
 */
import { PLACEHOLDER_IDS } from '../../utils/synthetic-user.js';

const UNVERIFIED_PREFIXES = ['anon:', 'device:', 'phone:'] as const;

/** True for a missing id, a placeholder, or an anon:, device: or phone: id. */
export function isUnverifiedUserId(id: string | null | undefined): boolean {
  const trimmed = id?.trim() ?? '';
  if (!trimmed || PLACEHOLDER_IDS.has(trimmed.toLowerCase())) return true;
  return UNVERIFIED_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix));
}
