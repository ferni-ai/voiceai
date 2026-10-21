/**
 * One way for Ferni to text a member, with every guard in one place.
 *
 * About 15 places in the codebase send texts and only one honoured a STOP
 * (register, 2026-10-12). This is that one's guards, lifted out of the
 * after-call check-in so reminders and follow-ups use the same path:
 *
 * - only a number known to be theirs (sponsor-confirmed, verified on the
 *   account, or Firebase Auth's), never an unverified profile phone;
 * - never when they turned texts off in settings or sent STOP;
 * - never twice within `minGapMs` of the same kind of text, per person and
 *   per phone (two accounts can share a number);
 * - the number is stored only as a salted hash plus its last four digits,
 *   and Twilio errors are logged with numbers redacted.
 *
 * Every send is written to feature_checkins with its kind and the thing it
 * was about (`refId`), so a reply can be matched back to it.
 *
 * @module services/outreach/guarded-text
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import {
  last4,
  phoneHash,
  phoneHashKey,
  toE164,
  type CheckinRecord,
  type Env,
  type ReplyStore,
  type StoredCheckin,
  type TextKind,
} from './checkin-replies.js';
import type { SMSDeliveryResult, SMSMessage } from './delivery/sms-delivery.js';
import { firestoreTextStore, sendSms } from './guarded-text-store.js';
import { resolveVerifiedPhone } from './user-reach.js';
import { userTimeZone } from '../../utils/caller-time-zone.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { QUIET_END_HOUR, QUIET_START_HOUR } from '../follow-through/right-moment.js';
import { flagOn } from '../../config/env-flag.js';
import {
  hoursWindow,
  isQuietAt,
  quietEndsAt,
  quietZones,
  quietZonesOf,
  type QuietHoursUser,
} from './quiet-hours.js';
import { timezoneFromPhone } from './area-code-timezones.js';
import { reportText } from './outreach-bq.js';
import {
  consentBlocks,
  defaultConsentDeps,
  type ConsentBlock,
  type ConsentDeps,
} from '../messaging/consent.js';

const log = createLogger({ module: 'guarded-text' });

export interface TextStore extends Pick<ReplyStore, 'forPhoneHash' | 'isOptedOut'> {
  forUser: (userId: string) => Promise<StoredCheckin[]>;
  add: (record: CheckinRecord) => Promise<string>;
  /** Takes lock `id`, stamped `at`, only if nobody holds it (atomic); false if someone does. */
  lock: (id: string, at: string) => Promise<boolean>;
  /** When lock `id` was taken, if it is held. */
  lockedAt: (id: string) => Promise<string | undefined>;
  unlock: (id: string) => Promise<void>;
  sponsoredPhone: (userId: string) => Promise<string | undefined>;
  userDoc: (userId: string) => Promise<Record<string, unknown> | undefined>;
  /** outreach_profiles/{userId}.state.allowedChannels, where the webhook's global STOP lands. */
  legacySmsChannels: (userId: string) => Promise<unknown>;
}

export interface TextDeps {
  env: Env;
  store: TextStore;
  /** The Firebase Auth phoneNumber, which only phone verification sets. */
  authPhone: (uid: string) => Promise<string | undefined>;
  send: (message: SMSMessage) => Promise<SMSDeliveryResult>;
  now: () => Date;
  /** consent/{phoneHash} (MESSAGING_PIPELINE); by default Firestore, under `env`. */
  consent?: ConsentDeps;
}

const consentOf = (deps: TextDeps): ConsentDeps =>
  deps.consent ?? { ...defaultConsentDeps(), env: deps.env };

export interface GuardedText {
  readonly userId: string;
  readonly body: string;
  readonly kind: TextKind;
  /** What it is about (a session id, a follow-up id), stored with the record. */
  readonly refId: string;
  /** No second text of this kind to this person or phone within this many ms. */
  readonly minGapMs: number;
}

export type TextSkip =
  | 'no-hash-secret'
  | 'no-verified-phone'
  | 'recently-sent'
  | 'sms-off'
  | 'opted-out'
  | 'send-failed';
export type TextOutcome = { sent: true } | { sent: false; reason: TextSkip };

/** The most recent text of `kind` actually sent, if any. Records from before kinds existed are check-ins. */
export function lastSentAt(
  records: readonly CheckinRecord[],
  kind: TextKind = 'checkin'
): Date | null {
  let latest: number | null = null;
  for (const r of records) {
    const t = Date.parse(r.sentAt);
    if ((r.kind ?? 'checkin') !== kind || r.status !== 'sent' || Number.isNaN(t)) continue;
    if (latest === null || t > latest) latest = t;
  }
  return latest === null ? null : new Date(latest);
}

const sentWithin = (at: Date | null, now: Date, gapMs: number): boolean =>
  at !== null && now.getTime() - at.getTime() < gapMs;

/**
 * A number known to be the member's, as E.164 (toE164, the same normalizer the reply side
 * hashes with): the one their sponsor confirmed, the verified phone on the account
 * (user-reach), else Firebase Auth's. Never profile.contactInfo.phone, which can be
 * overwritten without verification.
 */
export async function resolveCheckinPhone(
  userId: string,
  userDoc: Record<string, unknown> | undefined,
  deps: Pick<TextDeps, 'store' | 'authPhone'>
): Promise<string | undefined> {
  return resolveVerifiedPhone(userId, userDoc, {
    sponsoredPhone: async (id) => deps.store.sponsoredPhone(id),
    authPhone: deps.authPhone,
  });
}

/** True when `phone` is the member's own verified number, so a text or call to it is to them. */
export async function isOwnVerifiedPhone(
  userId: string,
  phone: string,
  deps: Pick<TextDeps, 'store' | 'authPhone'> = defaultTextDeps()
): Promise<boolean> {
  const doc = userId.startsWith('sponsored_') ? undefined : await deps.store.userDoc(userId);
  const own = await resolveCheckinPhone(userId, doc, deps);
  return own !== undefined && own === toE164(phone);
}

/** The member explicitly turned texts off, in outreach settings or by a STOP to the webhook. */
export function smsTurnedOff(
  userDoc: Record<string, unknown> | undefined,
  legacyChannels: unknown
): boolean {
  const prefs = (userDoc?.outreachPreferences ?? {}) as { enabled?: unknown; channels?: unknown };
  const withoutSms = (c: unknown): boolean => Array.isArray(c) && !c.includes('sms');
  return prefs.enabled === false || withoutSms(prefs.channels) || withoutSms(legacyChannels);
}

/** Twilio errors can quote the number (21211: "The 'To' number +1555... is not valid"). */
export const redactNumbers = (text?: string): string | undefined =>
  text?.replace(/\+?\d[\d ().-]{5,}\d/g, '[number]');

/**
 * The userId to store, query by and hand to SMS delivery. A `phone:` id is the caller's
 * number, so it is replaced by its hash (sms-delivery logs userId). Null for a `phone:` id
 * that isn't a usable number, so malformed ids never share one record bucket.
 */
export function recordUserId(userId: string, env: Env = process.env): string | null {
  if (!userId.startsWith('phone:')) return userId;
  const hash = phoneHash(userId.slice('phone:'.length), env);
  return hash ? `phone#${hash}` : null;
}

/**
 * Lock, send, record. Two runs at once (the job overlapping itself, a retry, a
 * tool firing with the job) could both pass the gap checks. Each run locks its
 * gap window and the one before (by kind and number), so two runs less than a
 * gap apart share a lock and one loses; a window-before lock from more than a
 * gap ago doesn't count. Locks stay; a failed send drops them for a retry.
 */
async function lockedSend(
  deps: TextDeps,
  gapMs: number,
  record: CheckinRecord,
  message: SMSMessage
): Promise<SMSDeliveryResult | 'locked'> {
  const at = Date.parse(record.sentAt);
  const window = Math.floor(at / Math.max(gapMs, 1));
  const [mine, before] = [window, window - 1].map((w) => `${record.kind}:${record.phoneHash}:${w}`);
  if (!(await deps.store.lock(mine, record.sentAt))) return 'locked';
  const held = [mine];
  if (await deps.store.lock(before, record.sentAt)) held.push(before);
  else if (at - Date.parse((await deps.store.lockedAt(before)) ?? '') < gapMs) {
    await deps.store.unlock(mine);
    return 'locked';
  }
  const unlock = () => Promise.all(held.map((id) => deps.store.unlock(id)));
  let result: SMSDeliveryResult;
  try {
    result = await deps.send(message);
  } catch (error) {
    await unlock();
    throw error;
  }
  if (!result.success) await unlock();
  // A text that went is sent: a failed write must not make anyone send it again.
  await deps.store
    .add({ ...record, status: result.success ? 'sent' : 'failed' })
    .catch((error: unknown) => {
      log.warn({ kind: record.kind, refId: record.refId, error: String(error) }, 'Not recorded');
    });
  return result;
}

/** Sends `t` if every guard allows it, and records the attempt. Never throws for a skip. */
export async function sendGuardedText(
  t: GuardedText,
  deps: TextDeps = defaultTextDeps()
): Promise<TextOutcome> {
  const logCtx = { kind: t.kind, refId: t.refId };
  const skip = (reason: TextSkip): TextOutcome => {
    log.info({ ...logCtx, reason }, 'Text skipped');
    return reportText(t.userId, t.kind, { sent: false, reason });
  };
  if (!phoneHashKey(deps.env)) return skip('no-hash-secret');
  const storedId = recordUserId(t.userId, deps.env);
  if (!storedId) return skip('no-verified-phone');

  const sponsored = t.userId.startsWith('sponsored_');
  const [records, userDoc, legacyChannels] = await Promise.all([
    deps.store.forUser(storedId),
    sponsored ? undefined : deps.store.userDoc(t.userId),
    deps.store.legacySmsChannels(t.userId),
  ]);
  const now = deps.now();
  if (sentWithin(lastSentAt(records, t.kind), now, t.minGapMs)) return skip('recently-sent');
  const phone = await resolveCheckinPhone(t.userId, userDoc, deps);
  if (!phone) return skip('no-verified-phone');
  if (smsTurnedOff(userDoc, legacyChannels)) return skip('sms-off');

  const hash = phoneHash(phone, deps.env);
  if (!hash) return skip('no-verified-phone');
  const [optedOut, toPhone] = await Promise.all([
    deps.store.isOptedOut(hash),
    deps.store.forPhoneHash(hash),
  ]);
  if (optedOut) return skip('opted-out');
  // The member's own verified number: unknown consent is fine, an opt-out is not.
  const consent = await consentBlocks(phone, 'sms', true, consentOf(deps));
  if (consent) return skip(consent === 'opted-out' ? 'opted-out' : 'send-failed');
  // Per phone too: two accounts can share a number.
  if (sentWithin(lastSentAt(toPhone, t.kind), now, t.minGapMs)) return skip('recently-sent');

  const phoneLast4 = last4(phone);
  const record: CheckinRecord = {
    userId: storedId,
    sessionId: t.refId,
    sentAt: now.toISOString(),
    question: t.body,
    status: 'sent',
    phoneLast4,
    phoneHash: hash,
    kind: t.kind,
    refId: t.refId,
  };
  const result = await lockedSend(deps, t.minGapMs, record, {
    to: phone,
    body: t.body,
    personaId: 'ferni',
    userId: storedId,
    outreachId: `${t.kind}_${t.refId}`,
  });
  if (result === 'locked') return skip('recently-sent');
  if (!result.success) {
    log.warn({ ...logCtx, phoneLast4, error: redactNumbers(result.error) }, 'Text not sent');
    return reportText(t.userId, t.kind, { sent: false, reason: 'send-failed' });
  }
  log.info({ ...logCtx, phoneLast4 }, 'Text sent');
  return reportText(t.userId, t.kind, { sent: true });
}

// ---------------------------------------------------------------------------
// Texts a member asks Ferni to send to someone else
// ---------------------------------------------------------------------------

/**
 * The guards are safety, not a feature, so they run unless ops turn them off:
 * ON_BEHALF_TEXT_GUARD=off restores the unguarded send (rollback only).
 */
export function onBehalfGuardOn(env: Env = process.env): boolean {
  return flagOn('ON_BEHALF_TEXT_GUARD', env);
}

/** No more than one text to the same person every 10 minutes: a loop can't spam them. */
export const ON_BEHALF_GAP_MS = 10 * 60 * 1000;

export interface OnBehalfText {
  /** The member it is sent for. */
  readonly senderUserId: string;
  readonly toPhone: string;
  readonly body: string;
  /** What it is about (the outreach id), stored with the record. */
  readonly refId: string;
  /** The recipient's IANA zone when known; else the member's. */
  readonly zone?: string;
  /** The persona it is sent as (SMS signature); Ferni when unset. */
  readonly personaId?: string;
}

export type OnBehalfSkip =
  | 'no-hash-secret'
  | 'bad-number'
  | 'opted-out'
  | 'needs-consent'
  | 'recently-sent'
  | 'quiet-hours'
  | 'send-failed';
export type OnBehalfOutcome =
  | { sent: true }
  | { sent: false; reason: Exclude<OnBehalfSkip, 'quiet-hours'> }
  /** `until`: when quiet hours end (08:00 in the zone used), for a sender that can wait. */
  | { sent: false; reason: 'quiet-hours'; until: Date };

const QUIET_WINDOW = hoursWindow(QUIET_START_HOUR, QUIET_END_HOUR);

/**
 * Quiet-hours zones: the recipient's (given, else their area code's), else the
 * member's (the call's, else their account's), else both US coasts.
 */
async function quietZonesFor(t: OnBehalfText, to: string, deps: TextDeps): Promise<string[]> {
  const zone = [t.zone, timezoneFromPhone(to), userTimeZone({ userId: t.senderUserId })].find(
    (z) => z !== undefined && isValidTimeZone(z)
  );
  if (zone) return [zone];
  const doc = await deps.store.userDoc(t.senderUserId).catch(() => undefined);
  return doc ? quietZonesOf(doc as QuietHoursUser) : quietZones(undefined);
}

/**
 * Sends a text to someone else for a member (the caller has already said yes,
 * outreach-confirm.ts): only to a valid number, never after that number sent
 * STOP (any STOP to our number is recorded, checkin-replies.ts), not twice in
 * ten minutes, not in their quiet hours (follow-through's 21:00 to 08:00).
 */
export async function sendOnBehalfText(
  t: OnBehalfText,
  deps: TextDeps = defaultTextDeps()
): Promise<OnBehalfOutcome> {
  const skip = (reason: Exclude<OnBehalfSkip, 'quiet-hours'>): OnBehalfOutcome => {
    log.info({ kind: 'on-behalf', refId: t.refId, reason }, 'Text skipped');
    return reportText(t.senderUserId, 'on-behalf', { sent: false, reason });
  };
  if (!phoneHashKey(deps.env)) return skip('no-hash-secret');
  const to = toE164(t.toPhone);
  const hash = to ? phoneHash(to, deps.env) : null;
  if (!to || !hash) return skip('bad-number');
  const now = deps.now();
  const zones = await quietZonesFor(t, to, deps);
  if (isQuietAt(now, QUIET_WINDOW, zones)) {
    const until = quietEndsAt(now, QUIET_WINDOW, zones);
    log.info({ kind: 'on-behalf', refId: t.refId, reason: 'quiet-hours' }, 'Text skipped');
    return reportText(t.senderUserId, 'on-behalf', { sent: false, reason: 'quiet-hours', until });
  }
  const [optedOut, toPhone] = await Promise.all([
    deps.store.isOptedOut(hash),
    deps.store.forPhoneHash(hash),
  ]);
  if (optedOut) return skip('opted-out');
  const consent = await onBehalfConsent(t, deps);
  if (consent) return skip(consent);
  if (sentWithin(lastSentAt(toPhone, 'on-behalf'), now, ON_BEHALF_GAP_MS))
    return skip('recently-sent');

  const storedId = recordUserId(t.senderUserId, deps.env) ?? 'unknown';
  const record: CheckinRecord = {
    userId: storedId,
    sessionId: t.refId,
    sentAt: now.toISOString(),
    question: t.body,
    status: 'sent',
    phoneLast4: last4(to),
    phoneHash: hash,
    kind: 'on-behalf',
    refId: t.refId,
  };
  const result = await lockedSend(deps, ON_BEHALF_GAP_MS, record, {
    to,
    body: t.body,
    personaId: t.personaId ?? 'ferni',
    userId: storedId,
    outreachId: t.refId,
  });
  if (result === 'locked') return skip('recently-sent');
  if (!result.success) {
    log.warn(
      { kind: 'on-behalf', refId: t.refId, error: redactNumbers(result.error) },
      'Text not sent'
    );
    return reportText(t.senderUserId, 'on-behalf', { sent: false, reason: 'send-failed' });
  }
  return reportText(t.senderUserId, 'on-behalf', { sent: true });
}

/**
 * MESSAGING_PIPELINE: someone else must have opted in themselves (texted START);
 * the member's own number needs only no opt-out.
 */
async function onBehalfConsent(
  t: OnBehalfText,
  deps: TextDeps
): Promise<'opted-out' | 'needs-consent' | 'send-failed' | null> {
  const ownNumber = async (): Promise<boolean> =>
    isOwnVerifiedPhone(t.senderUserId, t.toPhone, deps);
  const block: ConsentBlock | null = await consentBlocks(
    t.toPhone,
    'sms',
    ownNumber,
    consentOf(deps)
  );
  return block === 'unverifiable' ? 'send-failed' : block;
}

/**
 * Every text to someone other than the member goes through here: the guards
 * above, or with ON_BEHALF_TEXT_GUARD=off the plain send it replaced.
 */
export async function textOnBehalf(
  t: OnBehalfText,
  deps: TextDeps = defaultTextDeps()
): Promise<OnBehalfOutcome> {
  if (onBehalfGuardOn(deps.env)) return sendOnBehalfText(t, deps);
  const consent = await onBehalfConsent(t, deps);
  if (consent) return { sent: false, reason: consent };
  const result = await deps.send({
    to: t.toPhone,
    body: t.body,
    personaId: t.personaId ?? 'ferni',
    userId: t.senderUserId,
    outreachId: t.refId,
  });
  return result.success ? { sent: true } : { sent: false, reason: 'send-failed' };
}

/** What a tool tells the model when a text to `name` didn't go, so Ferni says so honestly. */
export function onBehalfNotSent(name: string, reason: OnBehalfSkip): string {
  const why: Record<OnBehalfSkip, string> = {
    'opted-out': "that number replied STOP to our texts, so I can't text it",
    'needs-consent': "they haven't said yes to texts from me yet",
    'quiet-hours': "it's late where they are (9pm to 8am their time). Nothing is queued",
    'recently-sent': 'I already texted that number in the last ten minutes',
    'bad-number': "that doesn't look like a valid phone number",
    'no-hash-secret': "texting isn't set up right now",
    'send-failed': "the text didn't go through",
  };
  return `The text to ${name} was NOT sent: ${why[reason]}.`;
}

export { firestoreTextStore };

export function defaultTextDeps(): TextDeps {
  return {
    env: process.env,
    store: firestoreTextStore,
    authPhone: async (uid) => (await getFirebaseUser(uid))?.phoneNumber ?? undefined,
    send: sendSms,
    now: () => new Date(),
  };
}
