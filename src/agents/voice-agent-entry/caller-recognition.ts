/**
 * "Ferni knows it's you when you call": map a phone caller's number to their
 * account. CALLER_RECOGNITION=on (default off). Fails closed.
 *
 * The number comes from the SIP participant (`sip.phoneNumber`), normalised to
 * E.164, and counts only against a VERIFIED owner: the Firebase account whose
 * sign-in phone is that number (Firebase sets one only through phone
 * verification, and no two accounts share it).
 *
 * Caller ID can be spoofed, and so can every SIP header and attribute while
 * our trunks accept INVITEs from any source: a raw X-Twilio-VerStat says
 * nothing. Only a SIGNED attestation counts, minted by our Twilio webhook for
 * this call and this number (#605's token); anything else, a missing value
 * included, is unverified.
 *
 * - known: verified owner + signed attestation A. The session runs as that
 *   user (name, memory), but only conversational tools are open
 *   (phone-safe-tools.ts) until a step-up the phone alone can't give.
 * - maybe / stranger: everyone else. No account loads, and Ferni greets them
 *   the same way ("hey, who's this?"): nothing tells the caller whose number
 *   it is, and nothing from anyone's account is used to check them.
 *
 * Phone numbers never reach the logs, only the outcome and attestation.
 *
 * @module agents/voice-agent-entry/caller-recognition
 */
import { getLogger } from '../../utils/safe-logger.js';
import {
  readSipCaller,
  type AttributeUpdates,
  type SipAttestation,
  type SipParticipantLike,
} from './sip-caller.js';

export type CallerStatus = 'known' | 'maybe' | 'stranger';

export interface CallerRecognition {
  status: CallerStatus;
  /** The signed attestation, or 'none' when there was no valid signed token. */
  attestation: SipAttestation;
  /** The verified owner's account and first name; set only when status is 'known'. */
  userId?: string;
  name?: string;
}

export interface PhoneOwner {
  userId: string;
  name?: string;
}

export interface RecognitionDeps {
  /** The verified owner of an E.164 number, or null. */
  ownerOf: (e164: string) => Promise<PhoneOwner | null>;
  /**
   * The attestation level from a signed token verified for this caller and
   * this number, or null when there is none. Never a raw header.
   */
  signedAttestation: (
    participant: SipParticipantLike,
    e164: string
  ) => Promise<SipAttestation | null>;
}

type Env = Record<string, string | undefined>;

export function callerRecognitionEnabled(env: Env = process.env): boolean {
  return env.CALLER_RECOGNITION === 'on';
}

/** Only a signed attestation A (the carrier vouches for the caller's right to the number) is a match. */
export function classifyCaller(
  owner: PhoneOwner | null,
  signed: SipAttestation | null
): CallerStatus {
  if (!owner) return 'stranger';
  return signed === 'A' ? 'known' : 'maybe';
}

/** E.164 for a SIP caller's number, or null when it isn't a phone number. */
export function toE164(raw: string | undefined): string | null {
  if (!raw) return null;
  let digits = raw
    .replace(/^tel:|^sip:/i, '')
    .split('@')[0]
    .replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) {
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    digits = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  }
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

const firstName = (name: string | undefined): string | undefined =>
  name?.trim().split(/\s+/)[0] || undefined;

/** Recognise a phone caller. Null for a participant that isn't a SIP caller. */
export async function recognizeCaller(
  participant: SipParticipantLike,
  deps: RecognitionDeps
): Promise<CallerRecognition | null> {
  // isSip only: the reading's attestation comes from a raw, forgeable header.
  const reading = await readSipCaller(participant, { waitMs: 0 });
  if (!reading.isSip) return null;
  const e164 = toE164(participant.attributes?.['sip.phoneNumber']);
  const owner = e164 ? await deps.ownerOf(e164).catch(() => null) : null;
  const signed =
    owner && e164 ? await deps.signedAttestation(participant, e164).catch(() => null) : null;
  const status = classifyCaller(owner, signed);
  const recognition: CallerRecognition = { status, attestation: signed ?? 'none' };
  if (owner && status === 'known') {
    recognition.userId = owner.userId;
    recognition.name = firstName(owner.name);
  }
  return recognition;
}

/**
 * Production lookups. The signed attestation arrives with #605 (webhook
 * token, `ferni.attest`); until it is wired here there is none, so no caller
 * is 'known': recognition fails closed rather than trusting a header.
 */
export const productionRecognitionDeps: RecognitionDeps = {
  async ownerOf(e164) {
    const { getFirebaseUserByPhone } = await import('../../services/identity/firebase-auth.js');
    const user = await getFirebaseUserByPhone(e164);
    return user ? { userId: user.uid, name: user.displayName } : null;
  },
  signedAttestation: async () => null,
};

/** The room's first remote participant, waiting up to `waitMs` for one to join. */
export function firstParticipant<P extends SipParticipantLike>(
  room: {
    remoteParticipants: Map<string, P>;
    on(event: 'participantConnected', fn: (p: P) => void): unknown;
    off(event: 'participantConnected', fn: (p: P) => void): unknown;
  },
  waitMs: number
): Promise<P | null> {
  const present = room.remoteParticipants.values().next();
  if (!present.done) return Promise.resolve(present.value);
  return new Promise((resolve) => {
    const done = (p: P | null): void => {
      clearTimeout(timer);
      room.off('participantConnected', done);
      resolve(p);
    };
    const timer = setTimeout(() => done(null), waitMs);
    room.on('participantConnected', done);
  });
}

// ---------------------------------------------------------------- per session

const bySession = new Map<string, CallerRecognition>();
/** Sessions end without telling this module; the oldest entries go first. */
const MAX_SESSIONS = 500;

export function rememberCallerRecognition(sessionId: string, r: CallerRecognition): void {
  bySession.set(sessionId, r);
  if (bySession.size > MAX_SESSIONS) bySession.delete(bySession.keys().next().value as string);
  getLogger().info(
    { sessionId, status: r.status, attestation: r.attestation },
    'CALLER_RECOGNITION'
  );
}

export function callerRecognitionFor(sessionId: string | undefined): CallerRecognition | undefined {
  return sessionId ? bySession.get(sessionId) : undefined;
}

/** A session known only by its phone number: only conversational tools are open. */
export function phoneOnlyIdentity(sessionId: string | undefined): boolean {
  return callerRecognitionFor(sessionId)?.status === 'known';
}

/**
 * The hello for a phone caller Ferni hasn't recognised (maybe or stranger,
 * greeted alike so the greeting can't tell a caller whose number it is).
 */
export const UNRECOGNISED_CALLER_DIRECTION =
  "You don't know who is calling. Greet them warmly and ask who it is, the way you'd answer an unknown number (\"hey, who's this?\"). Don't guess or say any name.";

export function unrecognisedCallerGreeting(r: CallerRecognition | undefined): string | null {
  return r && r.status !== 'known' ? UNRECOGNISED_CALLER_DIRECTION : null;
}

/**
 * Whether the dispatch already named the account: the app (signed-in user)
 * and calls Ferni placed for a user do; a phone caller's number, an
 * anonymous id, or the inbound webhook's unverified number lookup do not.
 */
export function accountNamedByDispatch(source: string, jobMetadata: string | undefined): boolean {
  let inbound = false;
  try {
    inbound = (JSON.parse(jobMetadata ?? '{}') as { type?: unknown }).type === 'inbound_call';
  } catch {
    // Unparseable metadata names nobody.
  }
  return !inbound && ['web_auth', 'firebase', 'sponsored'].includes(source);
}

type RoomLike = Parameters<typeof firstParticipant>[0] & AttributeUpdates;

/**
 * The identity a phone call should run as, or null when this isn't a phone
 * call. A 'known' caller runs as their account; anyone else runs anonymous
 * (an unverified number never loads someone's memory).
 */
export async function recognizePhoneSession(
  room: RoomLike,
  sessionId: string,
  deps: RecognitionDeps = productionRecognitionDeps
): Promise<{ userId?: string; userName?: string } | null> {
  const participant = await firstParticipant(room, PARTICIPANT_WAIT_MS);
  if (!participant) return null;
  const r = await recognizeCaller(participant, deps);
  if (!r) return null;
  rememberCallerRecognition(sessionId, r);
  return r.status === 'known' ? { userId: r.userId, userName: r.name } : {};
}

/** How long to wait for the caller to join. */
const PARTICIPANT_WAIT_MS = 3000;
