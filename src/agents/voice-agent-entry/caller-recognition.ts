/**
 * "Ferni knows it's you when you call": map a phone caller's number to their
 * account. CALLER_RECOGNITION=on (default off).
 *
 * The number comes from the SIP participant (`sip.phoneNumber`), normalised to
 * E.164, and counts only against a VERIFIED owner: the Firebase account whose
 * sign-in phone is that number (Firebase sets one only through phone
 * verification, and no two accounts share it). Caller ID can be spoofed, so
 * the match is trusted only with STIR/SHAKEN attestation A (sip-caller.ts):
 *
 * - known: verified owner + attestation A. The session runs as that user
 *   (name, memory), but sensitive account tools stay locked (sensitive-tools.ts)
 *   until a step-up the phone alone can't give.
 * - maybe: verified owner, attestation B/C/none. No account is loaded; Ferni
 *   asks whether it's them and checks something only they would know.
 * - stranger: no number, or nobody verified it.
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
  attestation: SipAttestation;
  /** The verified owner's account; set only when status is 'known'. */
  userId?: string;
  /** The owner's first name ('known' and 'maybe'). */
  name?: string;
  /** 'maybe' only: something from the owner's last call, for Ferni to check against. Never spoken first. */
  checkDetail?: string;
}

export interface PhoneOwner {
  userId: string;
  name?: string;
}

export interface RecognitionDeps {
  /** The verified owner of an E.164 number, or null. */
  ownerOf: (e164: string) => Promise<PhoneOwner | null>;
  /** What the owner and Ferni last talked about, for the 'maybe' check. */
  lastTopicOf: (userId: string) => Promise<string | undefined>;
}

type Env = Record<string, string | undefined>;

export function callerRecognitionEnabled(env: Env = process.env): boolean {
  return env.CALLER_RECOGNITION === 'on';
}

/** Only attestation A (the carrier vouches for the caller's right to the number) is a match. */
export function classifyCaller(
  owner: PhoneOwner | null,
  attestation: SipAttestation
): CallerStatus {
  if (!owner) return 'stranger';
  return attestation === 'A' ? 'known' : 'maybe';
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
  options: { updates?: AttributeUpdates; waitMs?: number } = {}
): Promise<CallerRecognition | null> {
  const reading = await readSipCaller(participant, options);
  if (!reading.isSip) return null;
  const e164 = toE164(participant.attributes?.['sip.phoneNumber']);
  const owner = e164 ? await deps.ownerOf(e164).catch(() => null) : null;
  const status = classifyCaller(owner, reading.attestation);
  const recognition: CallerRecognition = { status, attestation: reading.attestation };
  if (owner && status === 'known') recognition.userId = owner.userId;
  if (owner) recognition.name = firstName(owner.name);
  if (owner && status === 'maybe') {
    recognition.checkDetail = await deps.lastTopicOf(owner.userId).catch(() => undefined);
  }
  return recognition;
}

/** Production lookups: Firebase Auth for the owner, their profile for the last topic. */
export const productionRecognitionDeps: RecognitionDeps = {
  async ownerOf(e164) {
    const { getFirebaseUserByPhone } = await import('../../services/identity/firebase-auth.js');
    const user = await getFirebaseUserByPhone(e164);
    return user ? { userId: user.uid, name: user.displayName } : null;
  },
  async lastTopicOf(userId) {
    const { getProfileWithCache } = await import('../../services/data-layer/profile-cache.js');
    const { getGlobalServices } = await import('../../services/global-services.js');
    const { store } = await getGlobalServices();
    const profile = await getProfileWithCache(userId, (uid) => store.getProfile(uid));
    return profile?.lastConversationSummary?.trim().slice(0, 160) || undefined;
  },
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
    { sessionId, status: r.status, attestation: r.attestation, hasCheck: !!r.checkDetail },
    'CALLER_RECOGNITION'
  );
}

export function callerRecognitionFor(sessionId: string | undefined): CallerRecognition | undefined {
  return sessionId ? bySession.get(sessionId) : undefined;
}

/** A session known only by its phone number: sensitive account tools stay locked. */
export function phoneOnlyIdentity(sessionId: string | undefined): boolean {
  return callerRecognitionFor(sessionId)?.status === 'known';
}

/** The greeting for a caller who might be someone Ferni knows. */
export function maybeCallerGreeting(r: CallerRecognition | undefined): {
  direction: string;
  facts: Record<string, string>;
} | null {
  if (r?.status !== 'maybe' || !r.name) return null;
  return {
    direction: `You don't know for sure who is calling. Greet them warmly without using a name, and ask lightly whether it's ${r.name}. Do not mention anything you know about ${r.name}.`,
    facts: { 'who it might be': r.name },
  };
}

/** Each turn while a 'maybe' caller is unconfirmed: how to check it's them. */
export function maybeCallerNote(r: CallerRecognition | undefined): string {
  if (r?.status !== 'maybe' || !r.name) return '';
  const check = r.checkDetail
    ? ` If they say they are, ask them to remind you what you two talked about last time; it should match "${r.checkDetail}". Never say that yourself or hint at it.`
    : '';
  return `This caller might be ${r.name}; you have not confirmed it.${check} Until they've confirmed, don't bring up anything you know about ${r.name}.`;
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
  const r = await recognizeCaller(participant, deps, { updates: room, waitMs: VERSTAT_WAIT_MS });
  if (!r) return null;
  rememberCallerRecognition(sessionId, r);
  return r.status === 'known' ? { userId: r.userId, userName: r.name } : {};
}

/** How long to wait for the caller to join, and then for the carrier's attestation header. */
const PARTICIPANT_WAIT_MS = 3000;
const VERSTAT_WAIT_MS = 1000;
