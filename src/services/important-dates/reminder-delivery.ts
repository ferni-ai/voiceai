/**
 * Delivering one date reminder: pick channels the user opted into, in order
 * of preference, and fall back down the list when one can't be used.
 *
 *   conversation → handled at session start (session-reminders.ts); if the
 *                  reminder was already surfaced there, the job never sends it.
 *   push         → existing FCM path (unified-delivery), only with a
 *                  registered device and push left on in reminder settings.
 *   sms / email  → existing Twilio/SendGrid path, only after the user turned
 *                  that channel on in reminder settings, with a valid address,
 *                  at most MAX_EXTERNAL_PER_DAY per user per local day.
 *   in-app       → the app's message panel, when every channel above is
 *                  unavailable or failed and conversation reminders are on.
 *
 * Nothing goes out when the user switched outreach off entirely.
 *
 * @module services/important-dates/reminder-delivery
 */

import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import type { ImportantDateRecord, ReminderChannel, ReminderSettings } from './types.js';

const log = createLogger({ module: 'important-dates:delivery' });

/** Texts/emails a user can get from date reminders per local day. */
export const MAX_EXTERNAL_PER_DAY = 3;

export type SendChannel = 'push' | 'sms' | 'email' | 'in_app';

export interface ChannelAttempt {
  channel: SendChannel;
  ok: boolean;
  error?: string;
}

export interface DeliveryOutcome {
  delivered: boolean;
  channel?: SendChannel;
  attempts: ChannelAttempt[];
}

/** What we know about how to reach the user. */
export interface UserReach {
  phone?: string;
  email?: string;
  hasPushDevice: boolean;
  /** False when the user switched proactive outreach off entirely. */
  outreachEnabled: boolean;
}

export interface ServerChannels {
  push: boolean;
  sms: boolean;
  email: boolean;
}

/** One attempt at sending; the default implementation uses unified-delivery. */
export type ChannelSender = (
  channel: SendChannel,
  args: { userId: string; text: string; personaId: string; reach: UserReach; triggerId: string }
) => Promise<{ ok: boolean; error?: string; channelUsed?: SendChannel }>;

const isPhone = (v?: string): boolean =>
  !!v &&
  (/^\+[1-9]\d{7,14}$/.test(v.replace(/[^\d+]/g, '')) || /^1?\d{10}$/.test(v.replace(/\D/g, '')));
const isEmail = (v?: string): boolean => !!v && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Channels the date may use: its own override, else the user's settings. */
export function enabledChannels(
  record: Pick<ImportantDateRecord, 'channels'>,
  settings: ReminderSettings
): ReminderChannel[] {
  const fromSettings = (['conversation', 'push', 'sms', 'email'] as const).filter(
    (c) => settings.channels[c]
  );
  if (!record.channels) return fromSettings;
  // A per-date override can narrow the list, and can pick push or
  // conversation, but texts/email still need the user's global opt-in.
  return record.channels.filter((c) =>
    c === 'sms' || c === 'email' ? settings.channels[c] : true
  );
}

/**
 * The ordered list of channels to try for a reminder (pure). `externalToday`
 * is how many texts/emails this user already got from reminders today.
 */
export function channelPlan(
  record: Pick<ImportantDateRecord, 'channels'>,
  settings: ReminderSettings,
  reach: UserReach,
  server: ServerChannels,
  externalToday: number
): SendChannel[] {
  if (!reach.outreachEnabled) return [];
  const enabled = enabledChannels(record, settings);
  const plan: SendChannel[] = [];
  if (enabled.includes('push') && server.push && reach.hasPushDevice) plan.push('push');
  const externalOk = externalToday < MAX_EXTERNAL_PER_DAY;
  if (externalOk && enabled.includes('sms') && server.sms && isPhone(reach.phone)) plan.push('sms');
  if (externalOk && enabled.includes('email') && server.email && isEmail(reach.email)) {
    plan.push('email');
  }
  if (enabled.includes('conversation')) plan.push('in_app');
  return plan;
}

/** Try each channel in order until one works. */
export async function sendWithFallback(
  plan: readonly SendChannel[],
  send: ChannelSender,
  args: { userId: string; text: string; personaId: string; reach: UserReach; triggerId: string }
): Promise<DeliveryOutcome> {
  const attempts: ChannelAttempt[] = [];
  for (const channel of plan) {
    try {
      const r = await send(channel, args);
      const used = r.channelUsed ?? channel;
      attempts.push({ channel, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
      if (r.ok) {
        // unified-delivery may itself degrade to in-app; record what was used.
        if (used !== channel) attempts.push({ channel: used, ok: true });
        return { delivered: true, channel: used, attempts };
      }
    } catch (error) {
      attempts.push({ channel, ok: false, error: String(error) });
    }
  }
  return { delivered: false, attempts };
}

/** Default sender over the existing outreach infrastructure. */
export const unifiedDeliverySender: ChannelSender = async (channel, args) => {
  const { deliver } = await import('../outreach/unified-delivery.js');
  const result = await deliver({
    userId: args.userId,
    channel,
    content: {
      text: args.text,
      ssml: args.text,
      subject: 'A little reminder',
      personaId: args.personaId,
      reason: 'Important date reminder',
      confidence: 1,
    },
    phone: args.reach.phone,
    email: args.reach.email,
    outreachType: 'life_event_followup',
    triggerId: args.triggerId,
  });
  const used = (result.fallbackUsed ?? result.channel) as SendChannel;
  return {
    ok: result.success,
    ...(result.error ? { error: result.error } : {}),
    channelUsed: used,
  };
};

/** Which channels this server has credentials for. */
export async function serverChannels(): Promise<ServerChannels> {
  try {
    const { getChannelStatus } = await import('../outreach/unified-delivery.js');
    const s = await getChannelStatus();
    return { push: s.push.available, sms: s.sms.available, email: s.email.available };
  } catch (error) {
    log.warn({ error: String(error) }, 'Channel status unavailable');
    return { push: false, sms: false, email: false };
  }
}

/** Contact details, push devices and outreach consent from the user doc. */
export async function loadUserReach(db: Firestore, userId: string): Promise<UserReach> {
  const snap = await db.collection('bogle_users').doc(userId).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  const contact = (data.contactInfo ?? {}) as { phone?: unknown; email?: unknown };
  const prefs = (data.outreachPreferences ?? {}) as { enabled?: unknown };
  const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  return {
    ...(typeof contact.phone === 'string' ? { phone: contact.phone } : {}),
    ...(typeof contact.email === 'string' ? { email: contact.email } : {}),
    hasPushDevice: tokens.length > 0,
    outreachEnabled: prefs.enabled !== false,
  };
}
