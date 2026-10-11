/**
 * Who is calling on the phone, read from the SIP participant — in shadow only.
 *
 * Phone callers join as SIP participants. LiveKit puts the caller number in
 * `sip.phoneNumber` and, on a trunk that maps all headers, each SIP header in
 * `sip.h.<name>`. Twilio sends `X-Twilio-VerStat` with the STIR/SHAKEN
 * attestation of that number. The header can be forged while our trunks accept
 * any source, so a raw header is never trusted. The signed path: our Twilio
 * webhook mints a short-lived HMAC token (X-Ferni-Attest, mapped by the trunk
 * to `ferni.attest`), and its attestation counts only when the token verifies
 * against PHONE_ATTEST_SECRET for this caller's number. PHONE_VERIFY=shadow
 * logs what a call would have shown, and nothing else changes.
 *
 * Header attributes sometimes land in a later attributes update rather than at
 * join, so the reader waits for updates instead of reading once.
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import {
  PHONE_ATTEST_ATTRIBUTE,
  type PhoneAttestationResult,
  verifyPhoneAttestation,
} from '../../services/identity/phone-attestation.js';
import { notePhoneListener } from '../shared/performance/phone-voice-profile.js';

export type SipAttestation = 'A' | 'B' | 'C' | 'failed' | 'none';

export interface SipCallerReading {
  isSip: boolean;
  /** Caller number with all but the last two digits hidden, or null. */
  phoneNumberMasked: string | null;
  attestation: SipAttestation;
  /**
   * Where `attestation` came from: 'signed' = our webhook's verified token,
   * 'header' = the raw (forgeable) X-Twilio-VerStat, 'none' = neither.
   */
  attestationSource: 'signed' | 'header' | 'none';
  /** The signed token's check: unsigned (none sent) | signed | invalid. */
  signedStatus: PhoneAttestationResult['status'];
  /** Why the token was refused, when signedStatus is 'invalid'. */
  signedReason?: string;
  /** Attribute names only — never their values. */
  attributeKeys: string[];
  waitedMs: number;
}

export interface SipParticipantLike {
  kind?: ParticipantKind;
  identity?: string;
  attributes?: Record<string, string>;
}

type AttributesChangedListener = (
  changed: Record<string, string>,
  participant: SipParticipantLike
) => void;

/** The room's attribute-update events (a LiveKit Room satisfies this). */
export interface AttributeUpdates {
  on: (event: 'participantAttributesChanged', listener: AttributesChangedListener) => unknown;
  off: (event: 'participantAttributesChanged', listener: AttributesChangedListener) => unknown;
}

const VERSTAT_KEYS = new Set(['sip.h.x-twilio-verstat', 'x-twilio-verstat']);
const ATTEST_KEYS = new Set([PHONE_ATTEST_ATTRIBUTE, 'sip.h.x-ferni-attest']);

function findAttribute(attributes: Record<string, string>, keys: Set<string>): string | undefined {
  for (const [key, value] of Object.entries(attributes)) {
    if (keys.has(key.toLowerCase())) return value;
  }
  return undefined;
}

const findVerStat = (attributes: Record<string, string>): string | undefined =>
  findAttribute(attributes, VERSTAT_KEYS);
const findAttest = (attributes: Record<string, string>): string | undefined =>
  findAttribute(attributes, ATTEST_KEYS);

/** Twilio's VerStat value as an attestation level. Missing or unknown is 'none'. */
export function parseVerStat(value: string | undefined): SipAttestation {
  const v = (value ?? '').trim().toLowerCase();
  if (v.startsWith('tn-validation-passed-a')) return 'A';
  if (v.startsWith('tn-validation-passed-b')) return 'B';
  if (v.startsWith('tn-validation-passed-c')) return 'C';
  if (v.startsWith('tn-validation-failed')) return 'failed';
  return 'none';
}

/** `**67` for a number ending in 67; null when there is no number. */
export function maskPhoneNumber(phoneNumber: string | undefined): string | null {
  const digits = (phoneNumber ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length <= 2 ? '**' : `**${digits.slice(-2)}`;
}

function hasSipAttributes(attributes: Record<string, string>): boolean {
  return Object.keys(attributes).some((k) => k.toLowerCase().startsWith('sip.'));
}

type Env = Record<string, string | undefined>;

function reading(
  participant: SipParticipantLike,
  attributes: Record<string, string>,
  waitedMs: number,
  env: Env
): SipCallerReading {
  const signed = verifyPhoneAttestation(findAttest(attributes), {
    secret: env.PHONE_ATTEST_SECRET,
    phoneNumber: attributes['sip.phoneNumber'],
  });
  const header = findVerStat(attributes);
  return {
    isSip: participant.kind === ParticipantKind.SIP || hasSipAttributes(attributes),
    phoneNumberMasked: maskPhoneNumber(attributes['sip.phoneNumber']),
    attestation: parseVerStat(signed.status === 'signed' ? signed.claims.verstat : header),
    attestationSource:
      signed.status === 'signed' ? 'signed' : header !== undefined ? 'header' : 'none',
    signedStatus: signed.status,
    ...(signed.status === 'invalid' ? { signedReason: signed.reason } : {}),
    attributeKeys: Object.keys(attributes).sort(),
    waitedMs,
  };
}

/** Either identity header is enough to stop waiting for attribute updates. */
const hasIdentityHeader = (attributes: Record<string, string>): boolean =>
  findVerStat(attributes) !== undefined || findAttest(attributes) !== undefined;

/**
 * Read the caller's SIP identity, waiting up to `waitMs` for the VerStat header
 * to arrive in an attributes update. A participant that is not SIP returns at
 * once; a SIP caller without the header returns after `waitMs`.
 */
export async function readSipCaller(
  participant: SipParticipantLike,
  options: { updates?: AttributeUpdates; waitMs?: number; env?: Env } = {}
): Promise<SipCallerReading> {
  const { updates, waitMs = 1500, env = process.env } = options;
  const startedAt = Date.now();
  const attributes: Record<string, string> = { ...(participant.attributes ?? {}) };
  const isSipNow = participant.kind === ParticipantKind.SIP || hasSipAttributes(attributes);

  if (!isSipNow || hasIdentityHeader(attributes) || !updates || waitMs <= 0) {
    return reading(participant, attributes, 0, env);
  }

  return new Promise<SipCallerReading>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      updates.off('participantAttributesChanged', onChanged);
      resolve(reading(participant, attributes, Date.now() - startedAt, env));
    };
    const onChanged = (changed: Record<string, string>, who: SipParticipantLike): void => {
      const same =
        who === participant ||
        (who?.identity !== undefined && who.identity === participant.identity);
      if (!same) return;
      Object.assign(attributes, participant.attributes ?? {}, changed);
      if (hasIdentityHeader(attributes)) finish();
    };
    const timer = setTimeout(finish, waitMs);
    updates.on('participantAttributesChanged', onChanged);
  });
}

/** off (default) | shadow (log the caller's SIP identity, change nothing). */
export function phoneVerifyMode(
  env: Record<string, string | undefined> = process.env
): 'off' | 'shadow' {
  return env.PHONE_VERIFY === 'shadow' ? 'shadow' : 'off';
}

/** Rooms already logged, so each call logs once whichever path reaches it first. */
const loggedRooms = new WeakSet<object>();

/**
 * In shadow, log one SIP_CALLER line for this call without blocking it. Logs
 * the masked number and attestation code only — never a full number or other
 * header values.
 */
export async function logSipCallerShadow(input: {
  participant: SipParticipantLike;
  room: AttributeUpdates & object;
  sessionId: string;
  env?: Record<string, string | undefined>;
}): Promise<SipCallerReading | null> {
  if (phoneVerifyMode(input.env) !== 'shadow') return null;
  if (loggedRooms.has(input.room)) return null;
  loggedRooms.add(input.room);

  try {
    const result = await readSipCaller(input.participant, {
      updates: input.room,
      env: input.env ?? process.env,
    });
    getLogger().info({ sessionId: input.sessionId, ...result }, 'SIP_CALLER');
    return result;
  } catch (err: unknown) {
    getLogger().warn({ sessionId: input.sessionId, error: String(err) }, 'SIP_CALLER read failed');
    return null;
  }
}

/**
 * The caller joined: note whether Ferni's listener is on a phone (the
 * telephony audio profile, PHONE_VOICE_PROFILE), then the shadow log above.
 */
export async function noteCallerJoined(
  input: Parameters<typeof logSipCallerShadow>[0]
): Promise<SipCallerReading | null> {
  notePhoneListener(input.sessionId, input.participant);
  return logSipCallerShadow(input);
}
