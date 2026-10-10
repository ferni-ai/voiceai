/**
 * A signed note from our Twilio webhook to the voice agent: "Twilio told us
 * this call is from <from>, with STIR/SHAKEN result <verstat>".
 *
 * The X-Twilio-VerStat SIP header can't be trusted on its own while our
 * LiveKit trunks accept INVITEs from any source — anyone can send it. The
 * webhook, though, only runs on a request Twilio signed, so it mints this
 * token (HMAC-SHA256 with PHONE_ATTEST_SECRET) and the agent checks it.
 *
 * Token: base64url(JSON claims) + "." + base64url(HMAC over the first part).
 * It lives at most MAX_TTL_SECONDS and only counts for the number it names.
 *
 * Pure: no env, no I/O. Callers pass the secret and the clock.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** SIP header the webhook puts on the dial. */
export const PHONE_ATTEST_HEADER = 'X-Ferni-Attest';
/** Participant attribute the LiveKit trunk maps that header to. */
export const PHONE_ATTEST_ATTRIBUTE = 'ferni.attest';
export const MAX_TTL_SECONDS = 120;
const DEFAULT_TTL_SECONDS = 60;

export interface PhoneAttestationClaims {
  callSid: string;
  from: string;
  to: string;
  /** Twilio's StirVerstat as received ('' when Twilio sent none). */
  verstat: string;
  /** Expiry, unix seconds. */
  exp: number;
}

export type PhoneAttestationResult =
  | { status: 'signed'; claims: PhoneAttestationClaims }
  | { status: 'unsigned' }
  | {
      status: 'invalid';
      reason: 'no-secret' | 'malformed' | 'bad-signature' | 'expired' | 'number-mismatch';
    };

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** Mint a token for one call. Throws without a secret: never mint an unsigned token. */
export function mintPhoneAttestation(
  input: { callSid: string; from: string; to: string; verstat?: string },
  secret: string,
  options: { nowMs?: number; ttlSeconds?: number } = {}
): string {
  if (!secret) throw new Error('mintPhoneAttestation: secret is required');
  const ttl = Math.min(Math.max(options.ttlSeconds ?? DEFAULT_TTL_SECONDS, 1), MAX_TTL_SECONDS);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const claims: PhoneAttestationClaims = {
    callSid: input.callSid,
    from: input.from,
    to: input.to,
    verstat: input.verstat ?? '',
    exp: nowSeconds + ttl,
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(secret, body).toString('base64url')}`;
}

/** Same number when the digits match: "+1 (555) 123-4567" == "+15551234567". */
function sameNumber(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '');
  return da.length > 0 && da === b.replace(/\D/g, '');
}

function parseClaims(body: string): PhoneAttestationClaims | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    const strings = ['callSid', 'from', 'to', 'verstat'] as const;
    if (strings.some((k) => typeof c[k] !== 'string')) return null;
    if (typeof c.exp !== 'number' || !Number.isFinite(c.exp)) return null;
    return c as unknown as PhoneAttestationClaims;
  } catch {
    return null;
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Check a token against the caller number the SIP participant carries.
 * 'signed' only when the HMAC matches (constant-time), it has not expired, it
 * was not minted for longer than MAX_TTL_SECONDS, and `phoneNumber` is the
 * number it names. No token is 'unsigned'; anything else is 'invalid'.
 */
export function verifyPhoneAttestation(
  token: string | undefined,
  options: { secret?: string; phoneNumber?: string; nowMs?: number }
): PhoneAttestationResult {
  if (!token) return { status: 'unsigned' };
  if (!options.secret) return { status: 'invalid', reason: 'no-secret' };

  const parts = token.trim().split('.');
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1])) {
    return { status: 'invalid', reason: 'malformed' };
  }
  const [body, signature] = parts;
  const expected = sign(options.secret, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { status: 'invalid', reason: 'bad-signature' };
  }

  const claims = parseClaims(body);
  if (!claims) return { status: 'invalid', reason: 'malformed' };

  const nowSeconds = (options.nowMs ?? Date.now()) / 1000;
  if (nowSeconds >= claims.exp || claims.exp - nowSeconds > MAX_TTL_SECONDS) {
    return { status: 'invalid', reason: 'expired' };
  }
  if (!sameNumber(claims.from, options.phoneNumber ?? '')) {
    return { status: 'invalid', reason: 'number-mismatch' };
  }
  return { status: 'signed', claims };
}
