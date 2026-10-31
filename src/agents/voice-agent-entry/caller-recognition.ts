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
import {
  bindSessionPhone,
  holdSession,
  setOnPhoneBound,
  setVerifiedOwnerCheck,
} from '../../utils/minor-care.js';
import { phoneHoldId } from '../../services/outreach/checkin-replies.js';
import { sharedHeldStrict } from '../../services/outreach/minor-care-shared-hold.js';
import {
  beginReturningCaller,
  returningCallerEnabled,
} from '../../services/identity/returning-caller.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  readSignedAttestation,
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
   * this number, or null when there is none. Never a raw header. `updates`
   * lets it wait for a token that lands after the caller joins.
   */
  signedAttestation: (
    participant: SipParticipantLike,
    e164: string,
    updates?: AttributeUpdates
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
  deps: RecognitionDeps,
  updates?: AttributeUpdates
): Promise<CallerRecognition | null> {
  // isSip only: the reading's attestation comes from a raw, forgeable header.
  const reading = await readSipCaller(participant, { waitMs: 0 });
  if (!reading.isSip) return null;
  const e164 = toE164(participant.attributes?.['sip.phoneNumber']);
  // Both run, in parallel, whatever the owner lookup finds: reading the token
  // only for a number with an account would let a caller time the call's
  // start and learn whether that number has a Ferni account.
  const [owner, signed] = e164
    ? await Promise.all([
        deps.ownerOf(e164).catch(() => null),
        deps.signedAttestation(participant, e164, updates).catch(() => null),
      ])
    : [null, null];
  const status = classifyCaller(owner, signed);
  const recognition: CallerRecognition = { status, attestation: signed ?? 'none' };
  if (owner && status === 'known') {
    recognition.userId = owner.userId;
    recognition.name = firstName(owner.name);
  }
  return recognition;
}

/**
 * Production lookups. The attestation is our webhook's signed token (#605,
 * `ferni.attest`) verified against PHONE_ATTEST_SECRET for this participant
 * and this number (readSignedAttestation); anything else is null.
 */
export const productionRecognitionDeps: RecognitionDeps = {
  async ownerOf(e164) {
    const { getFirebaseUserByPhone } = await import('../../services/identity/firebase-auth.js');
    const user = await getFirebaseUserByPhone(e164);
    return user ? { userId: user.uid, name: user.displayName } : null;
  },
  signedAttestation: (participant, e164, updates) =>
    readSignedAttestation(participant, e164, { updates }),
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

/**
 * Remember a phone caller's number from the participants already in the room (no waiting), so a
 * held call also holds texts from and to that number (minor-care-purge.ts).
 */
export function rememberCallerPhone(
  sessionId: string,
  room: { remoteParticipants?: Map<string, SipParticipantLike> }
): boolean {
  for (const participant of room.remoteParticipants?.values() ?? []) {
    if (bindParticipantPhone(sessionId, participant)) return true;
  }
  return false;
}

function bindParticipantPhone(sessionId: string, p: SipParticipantLike | undefined): boolean {
  const e164 = toE164(p?.attributes?.['sip.phoneNumber']);
  if (e164) bindSessionPhone(sessionId, e164);
  return !!e164;
}

/**
 * MINOR_CARE_SHARED_HOLD: a call from a number with a live hold (minor_care_holds/phone#<hash>, the
 * key minor-care-purge's shareHold writes) is held from when the number is bound here, at the start
 * or by a late SIP join, whether or not the caller says their age again: every phone call gets a
 * fresh anon: id, so only the number links it to the held call (dev soak 2026-10-27: 89 docs).
 * Fail closed (sharedHeldStrict): a record not read within STRICT_READ_MS holds the call. What was
 * written before is dropped by the end-of-call purge. Flag off: no read. Registered here, where
 * every number is bound, so no load order can skip it.
 */
async function holdIfNumberHeld(sessionId: string, e164: string): Promise<void> {
  const phoneId = phoneHoldId(e164); // undefined without LOG_HASH_SECRET: no record can exist
  if (phoneId && (await sharedHeldStrict(phoneId))) holdSession(sessionId);
}
setOnPhoneBound((sessionId, e164) => void holdIfNumberHeld(sessionId, e164));

/** How long a call keeps listening for its SIP caller's number after identification. */
export const PHONE_WATCH_MS = 30_000;

/**
 * rememberCallerPhone, and if no number is in the room yet, keep listening (never awaited) until
 * the SIP caller joins or their attributes land, for up to `waitMs`. Identification often ends
 * before the SIP participant is in the room (dev soak 2026-10-26), so a single read bound nothing.
 */
export function watchCallerPhone(
  sessionId: string,
  room: Partial<RoomLike> & { remoteParticipants?: Map<string, SipParticipantLike> },
  waitMs = PHONE_WATCH_MS
): void {
  if (rememberCallerPhone(sessionId, room) || !room.on || !room.off) return;
  const events = room as RoomLike;
  const joined = (p: SipParticipantLike): void =>
    void (bindParticipantPhone(sessionId, p) && stop());
  const changed = (_: Record<string, string>, p: SipParticipantLike): void => joined(p);
  const stop = (): void => {
    clearTimeout(timer);
    events.off('participantConnected', joined);
    events.off('participantAttributesChanged', changed);
  };
  const timer = setTimeout(stop, waitMs);
  timer.unref?.();
  events.on('participantConnected', joined);
  events.on('participantAttributesChanged', changed);
}

export function callerRecognitionFor(sessionId: string | undefined): CallerRecognition | undefined {
  return sessionId ? bySession.get(sessionId) : undefined;
}

/** Sessions whose account came from an authenticated dispatch (accountNamedByDispatch). */
const namedByDispatch = new Set<string>();

export function rememberDispatchIdentity(sessionId: string, source: string, meta?: string): void {
  if (!accountNamedByDispatch(source, meta)) return;
  namedByDispatch.add(sessionId);
  if (namedByDispatch.size > MAX_SESSIONS)
    namedByDispatch.delete(namedByDispatch.values().next().value as string);
}

/** Proven account owner: recognition 'known', or an authenticated dispatch (never a number lookup). */
export function sessionIsVerifiedOwner(sessionId: string): boolean {
  return callerRecognitionFor(sessionId)?.status === 'known' || namedByDispatch.has(sessionId);
}
// MINOR_CARE (minor-care.ts, a lower layer) asks this before holding a session's memory.
setVerifiedOwnerCheck(sessionIsVerifiedOwner);

/**
 * The person on the line is proven to be the account owner, for anything that
 * brings the account's private history into the call (CALL_KNOWS_RECENT_TEXTS).
 * A phone session counts only when recognition says 'known': a call Ferni
 * placed to their number can be answered by anyone, and a dispatch that names
 * the account says nothing about who picked up. Any other session counts only
 * with an authenticated dispatch (a signed-in app user).
 */
export function ownerProvenOnLine(sessionId: string, phoneCall: boolean): boolean {
  const recognition = callerRecognitionFor(sessionId);
  if (phoneCall || recognition) return recognition?.status === 'known';
  return namedByDispatch.has(sessionId);
}

/** A session known only by its phone number: only conversational tools are open. */
export function phoneOnlyIdentity(sessionId: string | undefined): boolean {
  return callerRecognitionFor(sessionId)?.status === 'known';
}

/** Both checks, for lower layers that are handed them (data-channel-handler.ts). */
export const callerChecks = { verifiedOwner: sessionIsVerifiedOwner, phoneOnly: phoneOnlyIdentity };

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
  const r = await recognizeCaller(participant, deps, room);
  if (!r) return null;
  rememberCallerPhone(sessionId, { remoteParticipants: new Map([['caller', participant]]) });
  rememberCallerRecognition(sessionId, r);
  return r.status === 'known' ? { userId: r.userId, userName: r.name } : {};
}

/** How long to wait for the caller to join. */
const PARTICIPANT_WAIT_MS = 3000;

/**
 * RETURNING_CALLER=on: an unverified phone caller (an `anon:` session on a
 * SIP call, never an account or a proven owner) gets what they told Ferni
 * before, looked up by their hashed number (returning-caller.ts). Caller ID
 * can be spoofed, so only a call with a signed attestation A (the signal
 * 'known' needs) reads or writes a record; anything else gets neither.
 */
export async function startReturningCaller(
  room: RoomLike,
  sessionId: string,
  userId: string | undefined,
  deps: Pick<RecognitionDeps, 'signedAttestation'> = productionRecognitionDeps,
  begin: typeof beginReturningCaller = beginReturningCaller
): Promise<void> {
  if (!returningCallerEnabled() || !userId?.startsWith('anon:')) return;
  if (sessionIsVerifiedOwner(sessionId)) return;
  const participant = await firstParticipant(room, PARTICIPANT_WAIT_MS);
  if (!participant || !(await readSipCaller(participant, { waitMs: 0 })).isSip) return;
  const e164 = toE164(participant.attributes?.['sip.phoneNumber']);
  if (!e164) return;
  const signed = await deps.signedAttestation(participant, e164).catch(() => null);
  if (signed !== 'A') {
    getLogger().info({ sessionId, attestation: signed ?? 'none' }, 'RETURNING_CALLER skipped');
    return;
  }
  await begin(sessionId, e164);
}
