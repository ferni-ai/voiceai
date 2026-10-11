/**
 * The proactive check-in run: for each user on the dogfood allowlist, find
 * what Ferni has a reason to reach out about (triggers.ts), send it, and log
 * it (outreach-log.ts). Cloud Scheduler runs it every minute with the
 * deliver-scheduled-actions job.
 *
 * The channel (a note in the app, a text or a call) comes from channel-policy.ts: the
 * user's opt-ins, verified phone, quiet hours, daily caps and back-off. The
 * words come from outreach-text.ts.
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
import type { WorldDueItem } from './more-triggers.js';
import { collectTriggers } from './triggers.js';
import { chooseChannel, type ChannelChoice } from './channel-policy.js';
import {
  alreadySent,
  lastTextOf,
  recentOutreach,
  writeOutreachLog,
  type OutreachLogEntry,
} from './outreach-log.js';
import type { CallOutcome } from './self-call.js';
import { writeOutreachText } from './outreach-text.js';
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

/** On the allowlist with the flag on: proactive check-ins handle this user. */
export function isProactiveChannelsUser(userId: string): boolean {
  return isProactiveChannelsOn() && proactiveChannelsUsers().includes(userId);
}

/** The delivery edges. Tests stub these; the SDKs live behind them. */
export interface ProactiveDeps {
  sendInApp: (userId: string, trigger: ProactiveTrigger) => Promise<boolean>;
  /** The phone number on their Firebase account (verified by SMS code), if any. */
  verifiedPhone: (userId: string) => Promise<string | undefined>;
  sendSms: (phone: string, text: string) => Promise<boolean>;
  /** What comes due today in their world; absent when the server has no world model. */
  worldDue?: (userId: string, timeZone?: string) => Promise<WorldDueItem[]>;
  /** Rings their verified phone (self-call.ts); absent or false canCall: no calls. */
  placeCall?: (userId: string, phone: string, trigger: ProactiveTrigger) => Promise<CallOutcome>;
  canCall?: () => boolean;
}

export interface UserTickResult {
  userId: string;
  /** held: a trigger is waiting (quiet hours, caps, snooze) and goes out on a later run. */
  status: 'sent' | 'idle' | 'held' | 'skipped' | 'dry_run' | 'error';
  channel?: ProactiveChannel;
  sourceId?: string;
  why?: string;
}

/** Their own time zone: the profile's, then the outreach setting's; undefined if neither is valid. */
export function timezoneOf(user: Record<string, unknown>): string | undefined {
  const prefs = (user.outreachPreferences ?? {}) as { timezone?: unknown };
  const tz = (user.contactInfo as { timezone?: unknown } | undefined)?.timezone ?? prefs.timezone;
  return typeof tz === 'string' && isValidTimezone(tz) ? tz : undefined;
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
  now: Date,
  deps: ProactiveDeps
): Promise<ProactiveTrigger | undefined> {
  const worldDue = deps.worldDue
    ? await deps.worldDue(userId, timezoneOf(user)).catch((error: unknown) => {
        log.warn({ error: String(error), userId }, 'World model not loaded');
        return [];
      })
    : [];
  const triggers = await collectTriggers(userId, {
    now,
    // Unknown time zone: never "evening", so time-of-day triggers wait.
    localHour: localHourOf(user, now) ?? 0,
    lastTalkedAt: lastTalkedAt(user),
    worldDue,
  });
  for (const t of triggers) {
    // Sequential on purpose: usually the first one is new.
    // eslint-disable-next-line no-await-in-loop
    if (!(await alreadySent(userId, t.sourceId))) return t;
  }
  return undefined;
}

interface Delivered {
  channel: ProactiveChannel;
  ok: boolean;
  fallbackFrom?: ProactiveChannel;
  /** How a call ended. */
  outcome?: CallOutcome;
}

/** Send on the chosen channel; a text that doesn't go out becomes a note in the app. */
async function deliver(
  userId: string,
  trigger: ProactiveTrigger,
  channel: ProactiveChannel,
  phone: string | undefined,
  deps: ProactiveDeps
): Promise<Delivered> {
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

/**
 * Ring them. Logged before dialing (ringing takes up to a minute and the next
 * run must not ring again). A missed call leaves the words as a note in the
 * app; a call that couldn't be placed goes out as a text instead.
 */
async function call(
  userId: string,
  trigger: ProactiveTrigger,
  phone: string,
  entry: OutreachLogEntry,
  deps: ProactiveDeps
): Promise<Delivered> {
  await writeOutreachLog(userId, { ...entry, channel: 'voice_call', outcome: 'sent' });
  const outcome = deps.placeCall
    ? await deps.placeCall(userId, phone, trigger).catch((): CallOutcome => 'failed')
    : 'failed';
  if (outcome === 'failed') {
    return { ...(await deliver(userId, trigger, 'sms', phone, deps)), fallbackFrom: 'voice_call' };
  }
  if (outcome !== 'answered') await deps.sendInApp(userId, trigger);
  return { channel: 'voice_call', ok: true, outcome };
}

/** Write it, send it on the chosen channel, log it. */
async function send(
  userId: string,
  trigger: ProactiveTrigger,
  choice: ChannelChoice & { channel: ProactiveChannel },
  ctx: { now: Date; recent: OutreachLogEntry[]; verifiedPhone?: string },
  deps: ProactiveDeps
): Promise<Delivered> {
  const written = await writeOutreachText({
    trigger,
    channel: choice.channel,
    lastText: lastTextOf(ctx.recent),
    rotation: ctx.recent.length,
  });
  const entry: OutreachLogEntry = {
    sourceId: trigger.sourceId,
    kind: trigger.kind,
    channel: choice.channel,
    reason: trigger.reason,
    why: choice.why,
    at: ctx.now.toISOString(),
    outcome: 'sent',
    text: written.text,
    textSource: written.source,
  };
  const toSend = { ...trigger, text: written.text };
  const phone = ctx.verifiedPhone;
  const sent =
    choice.channel === 'voice_call' && phone
      ? await call(userId, toSend, phone, entry, deps)
      : await deliver(userId, toSend, choice.channel, phone, deps);
  await writeOutreachLog(userId, {
    ...entry,
    channel: sent.channel,
    outcome: sent.outcome ?? (sent.ok ? 'sent' : 'failed'),
    ...(sent.outcome && { outcomeAt: new Date().toISOString() }),
    ...(sent.fallbackFrom && { fallbackFrom: sent.fallbackFrom }),
  });
  if (sent.ok) {
    await trigger.afterSend?.().catch((error: unknown) => {
      log.warn({ error: String(error), userId, sourceId: trigger.sourceId }, 'After-send failed');
    });
  }
  return sent;
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

  const trigger = await nextTrigger(userId, user, now, deps);
  if (!trigger) return { userId, status: 'idle' };
  const verifiedPhone = await deps.verifiedPhone(userId);
  const recent = await recentOutreach(userId, new Date(now.getTime() - HISTORY_MS));
  const canCall = deps.canCall?.() === true && deps.placeCall !== undefined;
  if (trigger.weight === 'meaningful' && !canCall) {
    log.info({ userId, sourceId: trigger.sourceId }, 'No SIP trunk here, so no call');
  }
  const choice = chooseChannel({
    trigger,
    now,
    prefs: user.outreachPreferences,
    timezone: timezoneOf(user),
    verifiedPhone,
    lastTalkedAt: lastTalkedAt(user),
    recent,
    canCall,
  });
  const base = { userId, sourceId: trigger.sourceId, why: choice.why };
  const { channel } = choice;
  if (!channel) return { ...base, status: choice.stop ? 'skipped' : 'held' };
  if (dryRun) return { ...base, channel, status: 'dry_run' };

  const sent = await send(
    userId,
    trigger,
    { ...choice, channel },
    { now, recent, verifiedPhone },
    deps
  );
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
