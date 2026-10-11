/**
 * The proactive check-in run: for each user on the dogfood allowlist, find
 * what Ferni has a reason to reach out about (triggers.ts), send it, and log
 * it (outreach-log.ts). Cloud Scheduler runs it every minute with the
 * deliver-scheduled-actions job.
 *
 * The channel (a note in the app or a text) comes from channel-policy.ts: the
 * user's opt-ins, verified phone, quiet hours, daily caps and back-off.
 *
 * Off unless PROACTIVE_CHANNELS=on, and then only for the user ids in
 * PROACTIVE_CHANNELS_USERS (comma separated). At most one check-in per user
 * per run; every trigger goes out once.
 *
 * @module services/outreach/proactive-channels/proactive-tick
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import { isValidTimezone, localMinutes } from '../call-hours-guard.js';
import { collectTriggers } from './triggers.js';
import { chooseChannel } from './channel-policy.js';
import { alreadySent, recentOutreach, writeOutreachLog } from './outreach-log.js';
import type { ProactiveChannel, ProactiveTrigger } from './types.js';

const log = createLogger({ module: 'ProactiveChannels' });

export function isProactiveChannelsOn(): boolean {
  return process.env.PROACTIVE_CHANNELS === 'on';
}

export function proactiveChannelsUsers(): string[] {
  return (process.env.PROACTIVE_CHANNELS_USERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const HISTORY_MS = 3 * 24 * 60 * 60 * 1000;

/** The delivery edges. Tests stub these; the SDKs live behind them. */
export interface ProactiveDeps {
  sendInApp: (userId: string, trigger: ProactiveTrigger) => Promise<boolean>;
  /** The phone number on their Firebase account (verified by SMS code), if any. */
  verifiedPhone: (userId: string) => Promise<string | undefined>;
  sendSms: (phone: string, text: string) => Promise<boolean>;
}

export interface UserTickResult {
  userId: string;
  /** held: a trigger is waiting (quiet hours, caps, snooze) and goes out on a later run. */
  status: 'sent' | 'idle' | 'held' | 'skipped' | 'dry_run' | 'error';
  channel?: ProactiveChannel;
  sourceId?: string;
  why?: string;
}

/** Their own time zone: the outreach setting's, then the profile's (as quiet-hours.ts, #802). */
export function timezoneOf(user: Record<string, unknown>): string | undefined {
  const prefs = (user.outreachPreferences ?? {}) as { timezone?: unknown };
  const contact = (user.contactInfo ?? {}) as { timezone?: unknown };
  return [prefs.timezone, contact.timezone].find(
    (tz): tz is string => typeof tz === 'string' && isValidTimezone(tz)
  );
}

/** The user's local hour, or undefined without a valid time zone on their profile. */
function localHourOf(user: Record<string, unknown>, now: Date): number | undefined {
  const tz = timezoneOf(user);
  return tz === undefined ? undefined : Math.floor(localMinutes(now, tz) / 60);
}

/** The first trigger that hasn't gone out yet, in priority order. */
async function nextTrigger(
  userId: string,
  user: Record<string, unknown>,
  now: Date
): Promise<ProactiveTrigger | undefined> {
  const triggers = await collectTriggers(userId, {
    now,
    // Unknown time zone: never "evening", so time-of-day triggers wait.
    localHour: localHourOf(user, now) ?? 0,
    lastTalkedAt: lastTalkedAt(user),
  });
  for (const t of triggers) {
    // Sequential on purpose: usually the first one is new.
    // eslint-disable-next-line no-await-in-loop
    if (!(await alreadySent(userId, t.sourceId))) return t;
  }
  return undefined;
}

/** Send on the chosen channel; a text that doesn't go out becomes a note in the app. */
async function deliver(
  userId: string,
  trigger: ProactiveTrigger,
  channel: ProactiveChannel,
  phone: string | undefined,
  deps: ProactiveDeps
): Promise<{ channel: ProactiveChannel; ok: boolean; fallbackFrom?: ProactiveChannel }> {
  if (channel === 'sms' && phone) {
    const sent = await deps.sendSms(phone, trigger.text).catch((error: unknown) => {
      log.warn({ error: String(error), userId }, 'Proactive text failed');
      return false;
    });
    if (sent) return { channel, ok: true };
    return { channel: 'in_app', ok: await deps.sendInApp(userId, trigger), fallbackFrom: channel };
  }
  return { channel: 'in_app', ok: await deps.sendInApp(userId, trigger) };
}

async function runForUser(
  userId: string,
  now: Date,
  deps: ProactiveDeps,
  dryRun: boolean
): Promise<UserTickResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const user = (await db.collection('bogle_users').doc(userId).get()).data();
  if (!user) return { userId, status: 'skipped', why: 'no such user' };

  const trigger = await nextTrigger(userId, user, now);
  if (!trigger) return { userId, status: 'idle' };
  const verifiedPhone = await deps.verifiedPhone(userId);
  const choice = chooseChannel({
    trigger,
    now,
    prefs: user.outreachPreferences,
    timezone: timezoneOf(user),
    verifiedPhone,
    lastTalkedAt: lastTalkedAt(user),
    recent: await recentOutreach(userId, new Date(now.getTime() - HISTORY_MS)),
    canCall: false,
  });
  const base = { userId, sourceId: trigger.sourceId, why: choice.why };
  if (!choice.channel) return { ...base, status: choice.stop ? 'skipped' : 'held' };
  if (dryRun) return { ...base, channel: choice.channel, status: 'dry_run' };

  const sent = await deliver(userId, trigger, choice.channel, verifiedPhone, deps);
  await writeOutreachLog(userId, {
    sourceId: trigger.sourceId,
    kind: trigger.kind,
    channel: sent.channel,
    reason: trigger.reason,
    why: choice.why,
    at: now.toISOString(),
    outcome: sent.ok ? 'sent' : 'failed',
    ...(sent.fallbackFrom && { fallbackFrom: sent.fallbackFrom }),
  });
  log.info(
    { ...base, channel: sent.channel, ok: sent.ok, kind: trigger.kind },
    'Proactive check-in sent'
  );
  return { ...base, channel: sent.channel, status: 'sent' };
}

export interface ProactiveTickResult {
  enabled: boolean;
  users: UserTickResult[];
}

export async function runProactiveChannelsTick(
  deps: ProactiveDeps,
  opts: { now?: Date; dryRun?: boolean } = {}
): Promise<ProactiveTickResult> {
  if (!isProactiveChannelsOn()) return { enabled: false, users: [] };
  const now = opts.now ?? new Date();
  const users: UserTickResult[] = [];
  for (const userId of proactiveChannelsUsers()) {
    try {
      // One user at a time keeps Firestore reads and sends paced.
      // eslint-disable-next-line no-await-in-loop
      users.push(await runForUser(userId, now, deps, opts.dryRun === true));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Proactive check-in failed');
      users.push({ userId, status: 'error', why: String(error) });
    }
  }
  return { enabled: true, users };
}
