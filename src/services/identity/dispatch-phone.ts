/**
 * The phone number job metadata may identify a caller by, and only when the
 * dispatch is one our server signed.
 *
 * identifyFromMetadata resolves `caller_id` / `phone` / `from` through
 * identifyByPhone, whose `phone_mappings` link a number to an account without
 * any proof the caller holds it (caller ID is spoofable). Today no dispatch
 * puts a caller-controlled number there (the inbound SIP rules send fixed
 * metadata, 2026-10-10), but if one ever did, a spoofed caller ID would load
 * another user's account. So a number in metadata counts only on a dispatch
 * signed with the LiveKit API secret (verifyOnBehalfDispatch, over the whole
 * payload); anything else stays anonymous.
 *
 * @module services/identity/dispatch-phone
 */
import { verifyOnBehalfDispatch } from '../outreach/on-behalf-dispatch.js';

export function phoneFromSignedDispatch(
  metadata: Record<string, unknown>,
  secret: string | undefined = process.env.LIVEKIT_API_SECRET
): string | null {
  const phone = metadata.caller_id ?? metadata.phone ?? metadata.from;
  if (typeof phone !== 'string' || !phone) return null;
  return verifyOnBehalfDispatch(JSON.stringify(metadata), secret) ? phone : null;
}
