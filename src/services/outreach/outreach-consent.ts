/**
 * Outreach consent: what a user has agreed to hear from us, stored where the
 * daily scheduler reads it (bogle_users/{uid}.outreachPreferences).
 *
 * Everyone gets in-app check-ins unless they switch outreach off. Texts, email
 * and calls go out only on channels the user turned on themselves: an unset
 * channel list means in-app only, never "everything".
 *
 * @module OutreachConsent
 */

import { FieldValue } from 'firebase-admin/firestore';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import type { DeliveryChannel } from './unified-delivery.js';

const log = createLogger({ module: 'OutreachConsent' });

/** Channel names the settings screen uses. */
export type SettingsChannel = 'sms' | 'email' | 'call';

export interface OutreachConsent {
  enabled: boolean;
  /** Channels the user opted into, besides in-app (always allowed while enabled). */
  channels: DeliveryChannel[];
}

/** Settings only the proactive check-ins read (proactive-channels/channel-policy.ts). */
export interface ProactiveSettings {
  proactiveFrequency?: 'normal' | 'gentle' | 'light' | 'off';
  /** Local "HH:MM" times, the user's own time zone. */
  quietHours?: { start: string; end: string };
}

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** Accepts an hour (21) or "HH:MM"; anything else is dropped. */
function toHhmm(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24) {
    return `${String(v).padStart(2, '0')}:00`;
  }
  return typeof v === 'string' && HHMM.test(v) ? v : undefined;
}

/** Validate proactive settings from a request body; unknown values are dropped. */
export function proactiveSettingsFrom(body: unknown): ProactiveSettings {
  const b = (body ?? {}) as { proactiveFrequency?: unknown; quietHours?: unknown };
  const out: ProactiveSettings = {};
  const f = b.proactiveFrequency;
  if (f === 'normal' || f === 'gentle' || f === 'light' || f === 'off') out.proactiveFrequency = f;
  const q = (b.quietHours ?? {}) as { start?: unknown; end?: unknown };
  const start = toHhmm(q.start);
  const end = toHhmm(q.end);
  if (start && end && start !== end) out.quietHours = { start, end };
  return out;
}

const FROM_SETTINGS: Record<SettingsChannel, DeliveryChannel> = {
  sms: 'sms',
  email: 'email',
  call: 'voice_call',
};

const OPT_IN_CHANNELS: readonly DeliveryChannel[] = ['sms', 'email', 'voice_call', 'push'];

/** Read consent from a stored outreachPreferences value (any shape, possibly missing). */
export function consentFromPrefs(prefs: unknown): OutreachConsent {
  const p = (prefs ?? {}) as { enabled?: unknown; channels?: unknown };
  const channels = Array.isArray(p.channels)
    ? OPT_IN_CHANNELS.filter((c) => (p.channels as unknown[]).includes(c))
    : [];
  return { enabled: p.enabled !== false, channels };
}

/** Channels the scheduler may use: in-app plus whatever the user opted into. */
export function allowedDeliveryChannels(prefs: unknown): DeliveryChannel[] {
  return [...consentFromPrefs(prefs).channels, 'in_app'];
}

export function channelsFromSettings(settings: unknown): DeliveryChannel[] {
  if (!Array.isArray(settings)) return [];
  const out = new Set<DeliveryChannel>();
  for (const s of settings) {
    const c = FROM_SETTINGS[s as SettingsChannel];
    if (c) out.add(c);
  }
  return [...out];
}

export function settingsFromChannels(channels: DeliveryChannel[]): SettingsChannel[] {
  return (Object.keys(FROM_SETTINGS) as SettingsChannel[]).filter((s) =>
    channels.includes(FROM_SETTINGS[s])
  );
}

/** What a settings body (POST /api/outreach/preferences) asks to save. */
export function consentPatchFrom(body: unknown): Partial<OutreachConsent> & ProactiveSettings {
  const b = (body ?? {}) as { enabled?: unknown; allowedChannels?: unknown };
  return {
    ...(typeof b.enabled === 'boolean' && { enabled: b.enabled }),
    ...(Array.isArray(b.allowedChannels) && { channels: channelsFromSettings(b.allowedChannels) }),
    ...proactiveSettingsFrom(body),
  };
}

/**
 * The texts disclosure the settings screen shows next to the Texts box
 * (apps/web contact-settings-phone.ts). Bump both together whenever that text changes.
 * Not named *_VERSION: the Cartesia pin test reads `X_VERSION = '<date>'` as an API version.
 */
export const CURRENT_SMS_DISCLOSURE = '2026-10-18';

/** How a channel change was made, for the consent record. */
export interface ConsentContext {
  /** The disclosure version the client sent with the toggle (anything but a string is recorded as null). */
  disclosureVersion?: unknown;
  /** Where the user made the change, e.g. 'web-settings'. */
  source?: string;
}

/** A change made in the web app's settings, with the disclosure version it sent. */
export const webConsent = (disclosureVersion: unknown): ConsentContext => ({
  disclosureVersion,
  source: 'web-settings',
});

const PROOFS = [
  ['sms', 'sms', 'smsConsent'],
  ['voice_call', 'call', 'callConsent'],
] as const;

/**
 * Proof of what the user agreed to and when, for each phone channel this change
 * turns on (a fresh record, clearing any old revokedAt) or off (revokedAt only;
 * the merge keeps the original grant). `active`: channels with an unrevoked record
 * outside the list (consent given on a call), which a save without them revokes too.
 * Carriers and the TCPA ask for this record.
 */
export function consentProofs(
  before: DeliveryChannel[],
  after: DeliveryChannel[],
  how: ConsentContext,
  now: Date = new Date(),
  active: DeliveryChannel[] = []
): Record<string, unknown> {
  const at = now.toISOString();
  const out: Record<string, unknown> = {};
  for (const [delivery, channel, field] of PROOFS) {
    const was = before.includes(delivery);
    const is = after.includes(delivery);
    if (!was && is) {
      out[field] = {
        grantedAt: at,
        disclosureVersion: typeof how.disclosureVersion === 'string' ? how.disclosureVersion : null,
        source: how.source ?? 'unspecified',
        channel,
        scope: 'all',
        revokedAt: null,
      };
    } else if ((was || active.includes(delivery)) && !is) {
      out[field] = { revokedAt: at };
    }
  }
  return out;
}

/**
 * Why turning texts on is refused, or null: the request has to carry the
 * disclosure version the user was shown, so nothing can opt someone in to
 * texts without the disclosure on screen. Keeping or dropping texts is never refused.
 */
export function smsDisclosureRefusal(
  current: DeliveryChannel[],
  requested: DeliveryChannel[] | undefined,
  disclosureVersion: unknown
): string | null {
  if (!requested?.includes('sms') || current.includes('sms')) return null;
  if (disclosureVersion === CURRENT_SMS_DISCLOSURE) return null;
  return "I've updated what texts from me include. Refresh the page to see it, then turn texts on again.";
}

/** What Ferni says on a call before the first text a user asks for (no consent on record yet). */
export const VOICE_SMS_DISCLOSURE =
  "Sure. Just so you know, I'll text this number, msg and data rates may apply, and you can reply STOP anytime.";
export const CURRENT_VOICE_DISCLOSURE = '2026-10-18';

/** True when texts may go to this user: texts on in settings, or an unrevoked consent record. */
export function hasSmsConsent(prefs: unknown): boolean {
  const c = (prefs as { smsConsent?: { grantedAt?: unknown; revokedAt?: unknown } } | undefined)
    ?.smsConsent;
  const recorded = typeof c?.grantedAt === 'string' && !c.revokedAt;
  return recorded || consentFromPrefs(prefs).channels.includes('sms');
}

/** Whether `userId` has consented to texts (hasSmsConsent on their stored preferences). */
export async function readSmsConsent(userId: string): Promise<boolean> {
  const doc = await getFirestoreDb()?.collection('bogle_users').doc(userId).get();
  return hasSmsConsent(doc?.exists ? doc.data()?.outreachPreferences : undefined);
}

/**
 * Consent given on a call after VOICE_SMS_DISCLOSURE. It covers only texts the user
 * asks for (scope 'requested'); check-ins and follow-ups still need texts on in settings.
 */
export async function recordVoiceSmsConsent(
  userId: string,
  proof: { sessionId: string; nonce: string },
  now = new Date()
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const smsConsent = {
    grantedAt: now.toISOString(),
    disclosureVersion: CURRENT_VOICE_DISCLOSURE,
    source: 'voice',
    channel: 'sms',
    scope: 'requested',
    revokedAt: null,
    ...proof,
  };
  const smsConsentHistory = appendHistory(smsConsent);
  await db
    .collection('bogle_users')
    .doc(userId)
    .set({ outreachPreferences: { smsConsent, smsConsentHistory } }, { merge: true });
  log.info({ userId }, 'Voice SMS consent recorded');
}

/** Consent history only grows: each grant or revocation is appended, never rewritten. */
const appendHistory = (entry: object): unknown => FieldValue.arrayUnion(entry);

/** Channels whose stored consent record is granted and not revoked. */
function activeRecords(prefs: unknown): DeliveryChannel[] {
  const p = (prefs ?? {}) as Record<
    string,
    { grantedAt?: unknown; revokedAt?: unknown } | undefined
  >;
  const live = (r?: { grantedAt?: unknown; revokedAt?: unknown }) => !!r?.grantedAt && !r.revokedAt;
  return PROOFS.filter(([, , field]) => live(p[field])).map(([delivery]) => delivery);
}

export async function readOutreachConsent(userId: string): Promise<OutreachConsent> {
  const db = getFirestoreDb();
  if (!db) return consentFromPrefs(undefined);
  const doc = await db.collection('bogle_users').doc(userId).get();
  return consentFromPrefs(doc.exists ? doc.data()?.outreachPreferences : undefined);
}

/**
 * Save what the user chose. Throws when it can't be saved: an opt-out that
 * silently didn't stick is worse than an error the settings screen can show.
 */
export async function writeOutreachConsent(
  userId: string,
  patch: Partial<OutreachConsent> & ProactiveSettings,
  how: ConsentContext = {}
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const ref = db.collection('bogle_users').doc(userId);
  const outreachPreferences: Record<string, unknown> = {};
  if (typeof patch.enabled === 'boolean') outreachPreferences.enabled = patch.enabled;
  const chosen = patch.channels;
  if (chosen) {
    const channels = OPT_IN_CHANNELS.filter((c) => chosen.includes(c));
    const doc = await ref.get();
    const prior = doc.exists ? doc.data()?.outreachPreferences : undefined;
    const before = consentFromPrefs(prior);
    outreachPreferences.channels = channels;
    const proofs = consentProofs(before.channels, channels, how, new Date(), activeRecords(prior));
    for (const [field, proof] of Object.entries(proofs)) {
      outreachPreferences[field] = proof;
      outreachPreferences[`${field}History`] = appendHistory({
        ...(proof as object),
        source: how.source ?? 'unspecified',
      });
    }
  }
  if (patch.proactiveFrequency) outreachPreferences.proactiveFrequency = patch.proactiveFrequency;
  if (patch.quietHours) outreachPreferences.quietHours = { enabled: true, ...patch.quietHours };
  if (Object.keys(outreachPreferences).length === 0) return;
  await ref.set(
    { outreachPreferences, outreachPreferencesUpdatedAt: new Date().toISOString() },
    { merge: true }
  );
  log.info({ userId, ...outreachPreferences }, 'Outreach consent saved');
  const granted = (outreachPreferences.smsConsent as { grantedAt?: string } | undefined)?.grantedAt;
  if (granted && how.source === 'web-settings' && flagOn('SMS_OPT_IN_CONFIRM')) {
    await confirmOptIn(userId, granted);
  }
}

/** SMS_OPT_IN_CONFIRM on: texts going on in settings get one confirmation text; never fails the save. */
async function confirmOptIn(userId: string, grantedAt: string): Promise<void> {
  try {
    const { confirmSmsOptIn } = await import('./opt-in-text.js');
    log.info({ userId, outcome: await confirmSmsOptIn(userId, grantedAt) }, 'Opt-in confirmation');
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Opt-in confirmation not sent');
  }
}
