/**
 * Which identity claims in job metadata identifyFromMetadata may act on.
 *
 * Every dispatch is created server-side, but not every field in it is ours:
 * the web /token route copies `device_id` straight from its query string. So
 * a claim that names an account outright (`user_id`, `auth_token`) or moves
 * data between accounts (device auto-migration) counts only on a dispatch
 * signed with one of dispatchVerifySecrets() (verifyOnBehalfDispatch, over the whole
 * payload). The same rule dispatch-phone.ts applies to phone numbers.
 *
 * A signed identity claim is also short-lived: it counts only while its
 * signed `signedAt` is within SIGNED_IDENTITY_MAX_AGE_MS, so metadata copied
 * out of one dispatch can't be replayed into a later job to load that account.
 *
 * `firebase_uid` is not gated here: /token writes it from the verified
 * Firebase ID token, never from the request (servers/api/routes/token.ts).
 *
 * @module services/identity/signed-dispatch-identity
 */
import { flagOn } from '../../config/env-flag.js';
import {
  dispatchVerifySecrets,
  type DispatchSecrets,
  verifyOnBehalfDispatch,
} from '../outreach/on-behalf-dispatch.js';

/** How long a signed identity claim stays usable: covers dispatch latency and a slow job start. */
export const SIGNED_IDENTITY_MAX_AGE_MS = 10 * 60_000;
/** How far ahead of our clock a `signedAt` may be (signer and agent clocks differ slightly). */
const SIGNED_AT_CLOCK_SKEW_MS = 60_000;

function isFresh(signedAt: unknown, now: number): boolean {
  if (typeof signedAt !== 'number' || !Number.isFinite(signedAt)) return false;
  const age = now - signedAt;
  return age <= SIGNED_IDENTITY_MAX_AGE_MS && age >= -SIGNED_AT_CLOCK_SKEW_MS;
}

/** True when this metadata, as dispatched, carries our server's signature and was signed recently. */
export function isSignedDispatch(
  metadata: Record<string, unknown>,
  secret: DispatchSecrets = dispatchVerifySecrets(),
  now: number = Date.now()
): boolean {
  return (
    isFresh(metadata.signedAt, now) && verifyOnBehalfDispatch(JSON.stringify(metadata), secret)
  );
}

/** A string claim from metadata, or null when absent or the dispatch is unsigned. */
export function signedClaim(
  metadata: Record<string, unknown>,
  keys: readonly string[],
  secret: DispatchSecrets = dispatchVerifySecrets(),
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const value = keys.map((k) => metadata[k]).find((v) => typeof v === 'string' && v !== '');
  if (typeof value !== 'string') return null;
  if (isSignedDispatch(metadata, secret)) return value;
  return keys.includes('user_id') && isEvalCaller(metadata, value, env) ? value : null;
}

/** Eval callers' user ids (scripts/voice-eval/eval-dispatch.ts refuses to sign any other). */
export const EVAL_USER_PREFIX = 'voice-eval-';

/**
 * A voice-eval caller's user id, signed with EVAL_DISPATCH_SECRET. That key is
 * handed to eval runners, so it is trusted for nothing else: only a
 * `voice-eval-` user id, never a real account, a phone number, a device or an
 * outbound call (those verify with dispatchVerifySecrets alone).
 */
function isEvalCaller(
  metadata: Record<string, unknown>,
  userId: string,
  env: NodeJS.ProcessEnv
): boolean {
  const key = env.EVAL_DISPATCH_SECRET;
  return Boolean(key) && userId.startsWith(EVAL_USER_PREFIX) && isSignedDispatch(metadata, key);
}

/**
 * The device id the anonymous device fallback may load a `device:<id>` profile by.
 *
 * TRUST_UNSIGNED_DEVICE_ID on (the default) keeps today's behaviour: any
 * device_id in metadata, including the one /token copies from its query
 * string. Off: only a device_id on a signed dispatch. (A request with a
 * verified firebase_uid never reaches this fallback; it is identified by the
 * uid first.)
 */
export function trustedDeviceId(metadata: Record<string, unknown>): string | null {
  if (!flagOn('TRUST_UNSIGNED_DEVICE_ID')) return signedClaim(metadata, ['device_id', 'deviceId']);
  const value = metadata.device_id || metadata.deviceId;
  return typeof value === 'string' && value ? value : null;
}
