/**
 * The proactive check-in run: for each user on the dogfood allowlist, find
 * what Ferni has a reason to reach out about (triggers.ts), send it, and log
 * it (outreach-log.ts). Cloud Scheduler runs it every minute with the
 * deliver-scheduled-actions job.
 *
 * This first step leaves a note in the app. Texts and calls, with the channel
 * rules and caps that decide between them, come next.
 *
 * Off unless PROACTIVE_CHANNELS=on, and then only for the user ids in
 * PROACTIVE_CHANNELS_USERS (comma separated). At most one check-in per user
 * per run; every trigger goes out once.
 *
 * @module services/outreach/proactive-channels/proactive-tick
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { consentFromPrefs } from '../outreach-consent.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import { isValidTimezone, localMinutes } from '../call-hours-guard.js';
import { collectTriggers } from './triggers.js';
import { alreadySent, writeOutreachLog } from './outreach-log.js';
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

/** The delivery edges. Tests stub these; the SDKs live behind them. */
export interface ProactiveDeps {
  sendInApp: (userId: string, trigger: ProactiveTrigger) => Promise<boolean>;
}

export interface UserTickResult {
  userId: string;
  status: 'sent' | 'idle' | 'skipped' | 'dry_run' | 'error';
  channel?: ProactiveChannel;
  sourceId?: string;
  why?: string;
}

/** The user's local hour, or undefined without a valid time zone on their profile. */
function localHourOf(user: Record<string, unknown>, now: Date): number | undefined {
  const prefs = (user.outreachPreferences ?? {}) as { timezone?: unknown };
  const tz = (user.contactInfo as { timezone?: unknown } | undefined)?.timezone ?? prefs.timezone;
  if (typeof tz !== 'string' || !isValidTimezone(tz)) return undefined;
  return Math.floor(localMinutes(now, tz) / 60);
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
  if (!consentFromPrefs(user.outreachPreferences).enabled) {
    return { userId, status: 'skipped', why: 'outreach off' };
  }

  const trigger = await nextTrigger(userId, user, now);
  if (!trigger) return { userId, status: 'idle' };
  const channel: ProactiveChannel = 'in_app';
  const why = 'in-app note (texts and calls not wired yet)';
  const base = { userId, channel, sourceId: trigger.sourceId, why };
  if (dryRun) return { ...base, status: 'dry_run' };

  const ok = await deps.sendInApp(userId, trigger);
  await writeOutreachLog(userId, {
    sourceId: trigger.sourceId,
    kind: trigger.kind,
    channel,
    reason: trigger.reason,
    why,
    at: now.toISOString(),
    outcome: ok ? 'sent' : 'failed',
  });
  log.info({ ...base, ok, kind: trigger.kind }, 'Proactive check-in sent');
  return { ...base, status: 'sent' };
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
