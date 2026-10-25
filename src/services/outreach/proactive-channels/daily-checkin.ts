/**
 * The daily outreach run (automated-scheduler.ts) for users on the proactive
 * dogfood allowlist: its channel comes from the same policy as the rest of
 * their check-ins, its words from the same writer, and it goes in the same
 * log, so one set of caps, quiet hours and back-off covers everything Ferni
 * sends them unprompted.
 *
 * A daily check-in has no specific reason behind it, so it is never worth a
 * text or a call: the policy keeps it in the app, holds it, or drops it.
 *
 * @module services/outreach/proactive-channels/daily-checkin
 */

import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import type { GeneratedContent } from '../llm-content-generator.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import { savedQuietHours } from '../quiet-hours.js';
import { chooseChannel, type ChannelChoice } from './channel-policy.js';
import {
  alreadySent,
  lastTextOf,
  recentOutreach,
  writeOutreachLog,
  type OutreachLogEntry,
} from './outreach-log.js';
import { writeOutreachText, type TextSource } from './outreach-text.js';
import { isProactiveChannelsUser, timezoneOf } from './proactive-tick.js';

const HISTORY_MS = 3 * 24 * 60 * 60 * 1000;
const REASON = 'a regular check-in';

const dailyId = (now: Date): string => `daily:${now.toISOString().slice(0, 10)}`;

export interface DailyCheckIn extends ChannelChoice {
  /** Today's words, written like every other check-in (never the last line again). */
  content: () => Promise<GeneratedContent>;
  /** Log what the run delivered. */
  done: (outreachType: string, ok: boolean) => Promise<void>;
}

function dailyCheckInFor(
  userId: string,
  now: Date,
  choice: ChannelChoice,
  recent: OutreachLogEntry[]
): DailyCheckIn {
  let written: { text: string; source: TextSource } | undefined;
  return {
    ...choice,
    async content() {
      written = await writeOutreachText({
        trigger: { kind: 'planned_checkin', reason: REASON, text: '' },
        channel: choice.channel ?? 'in_app',
        lastText: lastTextOf(recent),
        rotation: recent.length,
      });
      return { text: written.text, ssml: '', personaId: 'ferni', reason: REASON, confidence: 1 };
    },
    async done(outreachType, ok) {
      if (!choice.channel) return;
      await writeOutreachLog(userId, {
        sourceId: dailyId(now),
        kind: 'planned_checkin',
        channel: choice.channel,
        reason: `daily ${outreachType.replace(/_/g, ' ')}`,
        why: choice.why,
        at: now.toISOString(),
        outcome: ok ? 'sent' : 'failed',
        ...(written && { text: written.text, textSource: written.source }),
      });
    },
  };
}

/**
 * Today's daily check-in for an allowlisted user, or undefined when this user
 * isn't on the allowlist (the daily run then picks as it always has).
 */
export async function dailyCheckIn(userId: string, now: Date): Promise<DailyCheckIn | undefined> {
  if (!(await isProactiveChannelsUser(userId))) return undefined;
  const db = getFirestoreDb();
  const held = (why: string): DailyCheckIn =>
    dailyCheckInFor(userId, now, { channel: null, why }, []);
  if (!db) return held('Firestore not available');
  if (await alreadySent(userId, dailyId(now))) return held('already checked in today');
  const user = (await db.collection('bogle_users').doc(userId).get()).data() ?? {};
  const recent = await recentOutreach(userId, new Date(now.getTime() - HISTORY_MS));
  const savedQuiet = savedQuietHours(user);
  const choice = chooseChannel({
    trigger: { weight: 'light', timely: false },
    now,
    prefs: user.outreachPreferences,
    timezone: timezoneOf(user),
    ...(savedQuiet && { savedQuiet }),
    lastTalkedAt: lastTalkedAt(user),
    recent,
    canCall: false,
    // Never a text or call (no phone given), so no opt-out is read; both stay ruled out.
    optedOut: { sms: true, call: true },
  });
  return dailyCheckInFor(userId, now, choice, recent);
}
