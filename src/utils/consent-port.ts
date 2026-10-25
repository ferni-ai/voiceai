/**
 * The consent check (services/messaging/consent.ts, L4) as a port, so senders
 * below it (the Twilio adapter, concierge, reminders, tools) can ask it without
 * an upward import. Each process entry registers the real check at boot
 * (registerMessagingConsent); consent-port-entries.test.ts checks that every
 * entry does.
 *
 * With MESSAGING_PIPELINE on and nothing registered it fails closed, as an
 * unreadable consent store does ('unverifiable'). One exception: a number the
 * caller shows is the owner's own (allowUnknown as a function, the reminder
 * path) goes ahead with an error log, so a missed registration can't silence
 * the owner's own reminder.
 *
 * @module utils/consent-port
 */
import { flagOn, type Env } from '../config/env-flag.js';
import { createLogger } from './safe-logger.js';

export type ConsentChannel = 'sms' | 'call';
/** Why a text or call was refused: a recorded opt-out, no opt-in from a third party (needs-consent, as in M1 decide()), or no way to check. */
export type ConsentBlock = 'opted-out' | 'needs-consent' | 'unverifiable';
/** Asked only when the phone's consent is unknown: true, or "is this the owner's own number?". */
export type AllowUnknown = boolean | (() => Promise<boolean>);
export type ConsentCheck = (
  phone: string,
  channel: ConsentChannel,
  allowUnknown: AllowUnknown,
  env: Env
) => Promise<ConsentBlock | null>;

const log = createLogger({ module: 'consent-port' });
let check: ConsentCheck | undefined;

export function registerConsentCheck(next: ConsentCheck | undefined): void {
  check = next;
}

export const consentCheckRegistered = (): boolean => check !== undefined;

/** Null when `channel` to `phone` is allowed, else why not (consent.ts consentBlocks). */
export async function consentBlocks(
  phone: string,
  channel: ConsentChannel,
  allowUnknown: AllowUnknown,
  env: Env = process.env
): Promise<ConsentBlock | null> {
  if (check) return check(phone, channel, allowUnknown, env);
  if (!flagOn('MESSAGING_PIPELINE', env)) return null;
  if (typeof allowUnknown === 'function' && (await allowUnknown())) {
    log.error({ channel }, 'Consent check not registered in this process; owner number allowed');
    return null;
  }
  log.warn({ channel }, 'Consent check not registered in this process; not sending');
  return 'unverifiable';
}

/** The owner's own verified number? (guarded-text's isOwnVerifiedPhone.) */
export type OwnNumberCheck = (ownerUid: string, phone: string) => Promise<boolean>;
/** consent-grants.ts behind the same port: a third party's grant is for one owner. */
export interface GrantChecks {
  thirdPartyRefusal: (
    ownerUid: string,
    phone: string,
    channel: ConsentChannel,
    isOwn: OwnNumberCheck
  ) => Promise<ConsentBlock | null>;
  recordOwnerAttestation: (phone: string, channel: ConsentChannel, uid: string) => Promise<boolean>;
}
let grants: GrantChecks | undefined;

export function registerGrantChecks(next: GrantChecks | undefined): void {
  grants = next;
}

/** consent-grants.ts thirdPartyRefusal. Unregistered (pipeline on), only the owner's own number goes. */
export async function thirdPartyRefusal(
  ownerUid: string,
  phone: string,
  channel: ConsentChannel,
  isOwn: OwnNumberCheck,
  env: Env = process.env
): Promise<ConsentBlock | null> {
  if (grants) return grants.thirdPartyRefusal(ownerUid, phone, channel, isOwn);
  if (!flagOn('MESSAGING_PIPELINE', env) || (await isOwn(ownerUid, phone))) return null;
  log.warn({ channel }, 'Grant check not registered in this process; not reaching a third party');
  return 'unverifiable';
}

/** consent-grants.ts recordOwnerAttestation. Unregistered, nothing is recorded. */
export async function recordOwnerAttestation(
  phone: string,
  channel: ConsentChannel,
  ownerUid: string
): Promise<boolean> {
  return grants ? grants.recordOwnerAttestation(phone, channel, ownerUid) : false;
}
