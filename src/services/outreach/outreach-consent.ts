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
  proactiveFrequency?: 'gentle' | 'normal' | 'off';
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
  if (
    b.proactiveFrequency === 'gentle' ||
    b.proactiveFrequency === 'normal' ||
    b.proactiveFrequency === 'off'
  ) {
    out.proactiveFrequency = b.proactiveFrequency;
  }
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
  patch: Partial<OutreachConsent> & ProactiveSettings
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const outreachPreferences: Record<string, unknown> = {};
  if (typeof patch.enabled === 'boolean') outreachPreferences.enabled = patch.enabled;
  const chosen = patch.channels;
  if (chosen) outreachPreferences.channels = OPT_IN_CHANNELS.filter((c) => chosen.includes(c));
  if (patch.proactiveFrequency) outreachPreferences.proactiveFrequency = patch.proactiveFrequency;
  if (patch.quietHours) outreachPreferences.quietHours = { enabled: true, ...patch.quietHours };
  if (Object.keys(outreachPreferences).length === 0) return;
  await db
    .collection('bogle_users')
    .doc(userId)
    .set(
      { outreachPreferences, outreachPreferencesUpdatedAt: new Date().toISOString() },
      { merge: true }
    );
  log.info({ userId, ...outreachPreferences }, 'Outreach consent saved');
}
