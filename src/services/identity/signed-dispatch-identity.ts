/**
 * Which identity claims in job metadata identifyFromMetadata may act on.
 *
 * Every dispatch is created server-side, but not every field in it is ours:
 * the web /token route copies `device_id` straight from its query string. So
 * a claim that names an account outright (`user_id`, `auth_token`) or moves
 * data between accounts (device auto-migration) counts only on a dispatch
 * signed with the LiveKit API secret (verifyOnBehalfDispatch, over the whole
 * payload). The same rule dispatch-phone.ts applies to phone numbers.
 *
 * `firebase_uid` is not gated here: /token writes it from the verified
 * Firebase ID token, never from the request (servers/api/routes/token.ts).
 *
 * @module services/identity/signed-dispatch-identity
 */
import { verifyOnBehalfDispatch } from '../outreach/on-behalf-dispatch.js';

/** True when this metadata, as dispatched, carries our server's signature. */
export function isSignedDispatch(
  metadata: Record<string, unknown>,
  secret: string | undefined = process.env.LIVEKIT_API_SECRET
): boolean {
  return verifyOnBehalfDispatch(JSON.stringify(metadata), secret);
}

/** A string claim from metadata, or null when absent or the dispatch is unsigned. */
export function signedClaim(
  metadata: Record<string, unknown>,
  keys: readonly string[],
  secret: string | undefined = process.env.LIVEKIT_API_SECRET
): string | null {
  const value = keys.map((k) => metadata[k]).find((v) => typeof v === 'string' && v !== '');
  if (typeof value !== 'string') return null;
  return isSignedDispatch(metadata, secret) ? value : null;
}
