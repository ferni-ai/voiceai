/**
 * Proof, kept on the server, that a caller agreed to texts on a call. The
 * model's word never creates consent: a text they asked for waits until this
 * session got the disclosure, Ferni's committed turn actually spoke it (the
 * words the caller heard, agent-turn-recorder.ts), and the caller's next turn
 * said yes. Single use, per session, in memory: a restart asks again.
 *
 * @module services/outreach/voice-consent-ledger
 */
import { randomUUID } from 'node:crypto';

/** A disclosure not answered within this long is asked again. */
export const DISCLOSURE_TTL_MS = 10 * 60 * 1000;

interface Pending {
  nonce: string;
  issuedAt: number;
  spokeAt?: number;
  agreed?: boolean;
}

const pending = new Map<string, Pending>();

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

/** A disclosure for `sessionId`, or the one still waiting there; returns its nonce. */
export function requestDisclosure(sessionId: string, now = Date.now()): string {
  const open = pending.get(sessionId);
  if (open && now - open.issuedAt < DISCLOSURE_TTL_MS) return open.nonce;
  const nonce = randomUUID();
  pending.set(sessionId, { nonce, issuedAt: now });
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

/** The nonce of a disclosure this session spoke and the caller agreed to, used up; else null. */
export function takeAgreedDisclosure(sessionId: string, now = Date.now()): string | null {
  const p = pending.get(sessionId);
  if (!p || now - p.issuedAt >= DISCLOSURE_TTL_MS || p.agreed === undefined) return null;
  pending.delete(sessionId);
  return p.agreed ? p.nonce : null;
}
