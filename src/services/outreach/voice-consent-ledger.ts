/**
 * Proof, kept on the server, that a caller agreed to texts on a call. The
 * model's word never creates consent: a text they asked for waits until this
 * session got the disclosure, Ferni's committed turn actually spoke it (the
 * words the caller heard, agent-turn-recorder.ts), and the caller's next turn
 * said yes. Single use, per session, in memory: a restart asks again. Only
 * the member's own call counts, and only for the member it was asked for: a
 * third party saying "yes" on an on-behalf call never consents for the owner.
 *
 * @module services/outreach/voice-consent-ledger
 */
import { randomUUID } from 'node:crypto';
import { isMemberCall } from '../../utils/synthetic-user.js';

/** A disclosure not answered within this long is asked again. */
export const DISCLOSURE_TTL_MS = 10 * 60 * 1000;

interface Pending {
  /** The member the disclosure was asked for; only they can be recorded as agreeing. */
  userId: string;
  nonce: string;
  issuedAt: number;
  spokeAt?: number;
  agreed?: boolean;
}

const pending = new Map<string, Pending>();
/** Sessions that aren't the member's own call (on-behalf calls): no consent is taken in them. */
const refused = new Set<string>();

/** Marks a session as someone else's call (on), or clears that when it ends (off). */
export function setConsentRefused(sessionId: string, on: boolean): void {
  if (!on) return void refused.delete(sessionId);
  refused.add(sessionId);
  pending.delete(sessionId);
}

const words = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ');
// The three parts the disclosure must carry when spoken: whose number, the cost, the way out.
const SPOKE = [/\btext this number\b/, /\brates may apply\b/, /\breply stop\b/];
const YES =
  /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|that's fine|fine|sounds good|of course|absolutely)\b/;
const NO = /\b(no|nope|don't|do not|wait|stop|never mind|not)\b/;

/** A disclosure for `userId` on `sessionId` (or the one still waiting); null off a member's own call. */
export function requestDisclosure(
  sessionId: string,
  userId: string,
  now = Date.now()
): string | null {
  if (refused.has(sessionId) || !isMemberCall(userId)) return null;
  const open = pending.get(sessionId);
  if (open?.userId === userId && now - open.issuedAt < DISCLOSURE_TTL_MS) return open.nonce;
  const nonce = randomUUID();
  pending.set(sessionId, { userId, nonce, issuedAt: now });
  return nonce;
}

/** Every committed turn of a call passes here; only a session waiting on a disclosure keeps anything. */
export function noteConsentTurn(
  sessionId: string,
  role: 'assistant' | 'user',
  text: string,
  now = Date.now()
): void {
  const p = pending.get(sessionId);
  if (!p || p.agreed !== undefined) return;
  const said = words(text).trim();
  if (role === 'assistant' && p.spokeAt === undefined) {
    if (SPOKE.every((re) => re.test(said))) p.spokeAt = now;
  } else if (role === 'user' && p.spokeAt !== undefined) {
    p.agreed = YES.test(said) && !NO.test(said.replace(YES, ''));
  }
}

/** The nonce of a disclosure `userId` was asked, heard spoken and agreed to here, used up; else null. */
export function takeAgreedDisclosure(
  sessionId: string,
  userId: string,
  now = Date.now()
): string | null {
  const p = pending.get(sessionId);
  if (!p || p.userId !== userId) return null;
  if (now - p.issuedAt >= DISCLOSURE_TTL_MS || p.agreed === undefined) return null;
  pending.delete(sessionId);
  return p.agreed ? p.nonce : null;
}
