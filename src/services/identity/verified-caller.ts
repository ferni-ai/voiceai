/**
 * Whether the server verified who a caller is, as a positive signal tools can
 * gate on (`userData.verifiedCaller`).
 *
 * Tools used to infer it from the user id's shape (a denylist of anon:,
 * device:, phone: and placeholder ids). A denylist fails open: any new kind of
 * minted or caller-supplied id counts as a person until someone adds it. This
 * is the allowlist instead. A caller is verified only when identifyFromMetadata
 * took a Priority 1 or 2 branch:
 * - a user_id in a dispatch our server signed (signedClaim), or
 * - a firebase_uid from /token, which verified the Firebase ID token, and only
 *   for a signed-in account. /token marks it `firebase_account: true`; an
 *   anonymous Firebase user is excluded, because any client can mint a fresh
 *   one and so reset anything keyed on it. No marker means not verified.
 *
 * A phone caller is never verified here, even one CALLER_RECOGNITION knows
 * (a later step-up can widen that).
 *
 * @module services/identity/verified-caller
 */

import { flagOn } from '../../config/env-flag.js';
import { isUnverifiedUserId } from './unverified-user-id.js';

/** VERIFIED_CALLER_ALLOWANCE=on: per-person allowances follow verifiedAllowanceKey (default off). */
export function verifiedCallerAllowanceOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return flagOn('VERIFIED_CALLER_ALLOWANCE', env);
}

/**
 * For /token: a verified Firebase token from a real sign-in. Any client can mint
 * a fresh anonymous Firebase user, so 'anonymous' (or no provider) never counts.
 */
export function isSignedInAccount(signInProvider: string | undefined): boolean {
  return signInProvider !== undefined && signInProvider !== 'anonymous';
}

interface VerifiableSource {
  type: string;
  verified?: boolean;
}

/** True only for a Priority 1/2 identification of a real (not anonymous Firebase) account */
export function isVerifiedIdentification(
  source: VerifiableSource,
  metadata: Readonly<Record<string, unknown>>
): boolean {
  if (source.verified !== true) return false;
  return source.type !== 'firebase' || metadata.firebase_account === true;
}

interface CallerView {
  userId?: unknown;
  verifiedCaller?: unknown;
}

/**
 * The call's caller when the server verified them on this call: `verifiedCaller`
 * is true (only voice-agent-entry sets it, from identification) and the id is
 * not one anybody can mint or spoof (isUnverifiedUserId: anon:, device:, phone:,
 * placeholders). Null for anyone else, and for a session that never set it.
 */
export function verifiedCallerId(userData: unknown): string | null {
  const view = (userData ?? {}) as CallerView;
  if (view.verifiedCaller !== true || typeof view.userId !== 'string') return null;
  const id = view.userId.trim();
  return isUnverifiedUserId(id) ? null : id;
}

/**
 * The key a per-person allowance is charged to: `user:<id>` for a verified
 * caller, or null to share the strangers' bucket. Only when a session never set
 * `verifiedCaller` (an older or test session) does `isUnverified` decide.
 */
export function verifiedAllowanceKey(
  userData: unknown,
  isUnverified: (userId: string) => boolean
): string | null {
  const view = (userData ?? {}) as CallerView;
  const userId = typeof view.userId === 'string' && view.userId ? view.userId : null;
  if (!userId) return null;
  if (view.verifiedCaller === true) return `user:${userId}`;
  if (view.verifiedCaller === false) return null;
  return isUnverified(userId) ? null : `user:${userId}`;
}
