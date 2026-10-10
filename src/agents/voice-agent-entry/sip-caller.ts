/**
 * Who is calling on the phone, read from the SIP participant — in shadow only.
 *
 * Phone callers join as SIP participants. LiveKit puts the caller number in
 * `sip.phoneNumber` and, on a trunk that maps all headers, each SIP header in
 * `sip.h.<name>`. Twilio sends `X-Twilio-VerStat` with the STIR/SHAKEN
 * attestation of that number. The header can be forged while our trunks accept
 * any source, so nothing here is trusted: PHONE_VERIFY=shadow logs what a call
 * would have shown, and nothing else changes.
 *
 * Header attributes sometimes land in a later attributes update rather than at
 * join, so the reader waits for updates instead of reading once.
 */
import { ParticipantKind } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';

export type SipAttestation = 'A' | 'B' | 'C' | 'failed' | 'none';

export interface SipCallerReading {
  isSip: boolean;
  /** Caller number with all but the last two digits hidden, or null. */
  phoneNumberMasked: string | null;
  attestation: SipAttestation;
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

function findVerStat(attributes: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(attributes)) {
    if (VERSTAT_KEYS.has(key.toLowerCase())) return value;
  }
  return undefined;
}

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

function reading(
  participant: SipParticipantLike,
  attributes: Record<string, string>,
  waitedMs: number
): SipCallerReading {
  return {
    isSip: participant.kind === ParticipantKind.SIP || hasSipAttributes(attributes),
    phoneNumberMasked: maskPhoneNumber(attributes['sip.phoneNumber']),
    attestation: parseVerStat(findVerStat(attributes)),
    attributeKeys: Object.keys(attributes).sort(),
    waitedMs,
  };
}

/**
 * Read the caller's SIP identity, waiting up to `waitMs` for the VerStat header
 * to arrive in an attributes update. A participant that is not SIP returns at
 * once; a SIP caller without the header returns after `waitMs`.
 */
export async function readSipCaller(
  participant: SipParticipantLike,
  options: { updates?: AttributeUpdates; waitMs?: number } = {}
): Promise<SipCallerReading> {
  const { updates, waitMs = 1500 } = options;
  const startedAt = Date.now();
  const attributes: Record<string, string> = { ...(participant.attributes ?? {}) };
  const isSipNow = participant.kind === ParticipantKind.SIP || hasSipAttributes(attributes);

  if (!isSipNow || findVerStat(attributes) !== undefined || !updates || waitMs <= 0) {
    return reading(participant, attributes, 0);
  }

  return new Promise<SipCallerReading>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      updates.off('participantAttributesChanged', onChanged);
      resolve(reading(participant, attributes, Date.now() - startedAt));
    };
    const onChanged = (changed: Record<string, string>, who: SipParticipantLike): void => {
      const same =
        who === participant ||
        (who?.identity !== undefined && who.identity === participant.identity);
      if (!same) return;
      Object.assign(attributes, participant.attributes ?? {}, changed);
      if (findVerStat(attributes) !== undefined) finish();
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
    const result = await readSipCaller(input.participant, { updates: input.room });
    getLogger().info({ sessionId: input.sessionId, ...result }, 'SIP_CALLER');
    return result;
  } catch (err: unknown) {
    getLogger().warn({ sessionId: input.sessionId, error: String(err) }, 'SIP_CALLER read failed');
    return null;
  }
}
