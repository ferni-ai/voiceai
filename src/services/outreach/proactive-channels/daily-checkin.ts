/**
 * The daily outreach run (automated-scheduler.ts) for users on the proactive
 * dogfood allowlist: its channel comes from the same policy as the rest of
 * their check-ins, and it goes in the same log, so one set of caps, quiet
 * hours and back-off covers everything Ferni sends them unprompted.
 *
 * A daily check-in has no specific reason behind it, so it is never worth a
 * text or a call: the policy keeps it in the app, holds it, or drops it.
 *
 * @module services/outreach/proactive-channels/daily-checkin
 */

import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import { chooseChannel, type ChannelChoice } from './channel-policy.js';
import { alreadySent, recentOutreach, writeOutreachLog } from './outreach-log.js';
import { isProactiveChannelsOn, proactiveChannelsUsers, timezoneOf } from './proactive-tick.js';

const HISTORY_MS = 3 * 24 * 60 * 60 * 1000;

const dailyId = (now: Date): string => `daily:${now.toISOString().slice(0, 10)}`;

/**
 * The channel for today's daily check-in, or undefined when this user isn't on
 * the allowlist (the daily run then picks as it always has).
 */
export async function dailyCheckInChannel(
  userId: string,
  now: Date
): Promise<ChannelChoice | undefined> {
  if (!isProactiveChannelsOn() || !proactiveChannelsUsers().includes(userId)) return undefined;
  const db = getFirestoreDb();
  if (!db) return { channel: null, why: 'Firestore not available' };
  if (await alreadySent(userId, dailyId(now))) {
    return { channel: null, why: 'already checked in today' };
  }
  const user = (await db.collection('bogle_users').doc(userId).get()).data() ?? {};
  return chooseChannel({
    trigger: { weight: 'light', timely: false },
    now,
    prefs: user.outreachPreferences,
    timezone: timezoneOf(user),
    lastTalkedAt: lastTalkedAt(user),
    recent: await recentOutreach(userId, new Date(now.getTime() - HISTORY_MS)),
    canCall: false,
  });
}

/** Log the daily check-in the run delivered on `choice.channel`. */
export async function logDailyCheckIn(
  userId: string,
  now: Date,
  choice: ChannelChoice,
  outreachType: string,
  ok: boolean
): Promise<void> {
  if (!choice.channel) return;
  await writeOutreachLog(userId, {
    sourceId: dailyId(now),
    kind: 'planned_checkin',
    channel: choice.channel,
    reason: `daily ${outreachType.replace(/_/g, ' ')}`,
    why: choice.why,
    at: now.toISOString(),
    outcome: ok ? 'sent' : 'failed',
  });
}
