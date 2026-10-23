/**
 * The proactive check-in run: for each user on the dogfood allowlist, find
 * what Ferni has a reason to reach out about (triggers.ts), send it, and log
 * it (outreach-log.ts). Cloud Scheduler runs it every minute with the
 * deliver-scheduled-actions job.
 *
 * The channel (a note in the app, a text or a call) comes from channel-policy.ts: the
 * user's opt-ins, verified phone, quiet hours, daily caps and back-off. The
 * words come from outreach-text.ts. Before either, the verified phone's STOP
 * and do-not-call records are read (opt-outs.ts); if they can't be, nothing
 * goes out and the trigger waits for a later run.
 *
 * Off unless PROACTIVE_CHANNELS=on, and then only for the user ids in
 * PROACTIVE_CHANNELS_USERS (comma separated) and the people whose cohort flags
 * turn PROACTIVE_CHANNELS on (cohort-flags.ts usersWithFlag, COHORT_FLAGS=on),
 * so a person is added in Firestore, not in the public deploy config. At most
 * one check-in per user per run; every trigger goes out once.
 *
 * People whose cohort flags turn OUTREACH_PONDERED_NOTES on but not
 * PROACTIVE_CHANNELS get only those notes (pondered-triggers.ts): a note in
 * the app about something they said, never a text, a call or any other
 * trigger. The run is still off unless PROACTIVE_CHANNELS=on on the server.
 *
 * @module services/outreach/proactive-channels/proactive-tick
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { usersWithFlag } from '../../platform/cohort-flags.js';
import { getFirestoreDb } from '../../superhuman/firestore-utils.js';
import { lastTalkedAt } from '../outreach-cadence.js';
import { isValidTimezone, localMinutes } from '../call-hours-guard.js';
import type { WorldDueItem } from './more-triggers.js';
import { collectTriggers } from './triggers.js';
import { forgottenCheck } from '../../../memory/recall/forget-every-reader.js';
import { PONDERED_NOTES_FLAG, ponderedTriggers } from './pondered-triggers.js';
import { chooseChannel, type ChannelChoice, type PolicyInput } from './channel-policy.js';
import {
  alreadySent,
  claimOutreach,
  lastTextOf,
  writeOutreachLog,
  type OutreachLogEntry,
} from './outreach-log.js';
import type { CallOutcome } from './self-call.js';
import { writeOutreachText } from './outreach-text.js';
import { optedOutChannels, phoneOptOuts, type PhoneOptOuts } from './opt-outs.js';
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

/** Everyone proactive check-ins handle: the env allowlist, then cohort members. Empty while off. */
export async function proactiveUserIds(): Promise<string[]> {
  if (!isProactiveChannelsOn()) return [];
  return [
    ...new Set([...proactiveChannelsUsers(), ...(await usersWithFlag('PROACTIVE_CHANNELS'))]),
  ];
}

/**
 * People who get only pondered notes: OUTREACH_PONDERED_NOTES on through their
 * own cohort flags, and not already among `proactive`. Empty while the run is off.
 */
export async function ponderedNotesOnlyUserIds(proactive: readonly string[]): Promise<string[]> {
  if (!isProactiveChannelsOn()) return [];
  const handled = new Set(proactive);
  return (await usersWithFlag(PONDERED_NOTES_FLAG)).filter((u) => !handled.has(u));
}

const HISTORY_MS = 3 * 24 * 60 * 60 * 1000;

/** The flag is on and they're on the allowlist or in a cohort: proactive check-ins handle this user. */
export async function isProactiveChannelsUser(userId: string): Promise<boolean> {
  return (await proactiveUserIds()).includes(userId);
}

/** The delivery edges. Tests stub these; the SDKs live behind them. */
export interface ProactiveDeps {
  sendInApp: (userId: string, trigger: ProactiveTrigger) => Promise<boolean>;
  /** A number they proved is theirs (user-reach.ts resolveVerifiedPhone), if any. */
  verifiedPhone: (userId: string, user: Record<string, unknown>) => Promise<string | undefined>;
  /**
   * Texts trigger.text through the guarded sender, which resolves the verified
   * number itself; false when it didn't go (a STOP since the opt-out read, a text
   * moments ago, a send failure), and the words go to the app instead.
   */
  sendSms: (userId: string, trigger: ProactiveTrigger) => Promise<boolean>;
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

/** Everything but the pondered notes (triggers.ts), with what is due in their world. */
async function checkInTriggers(
  userId: string,
  user: Record<string, unknown>,
  now: Date,
  deps: ProactiveDeps
): Promise<ProactiveTrigger[]> {
  const worldDue = deps.worldDue
    ? await deps.worldDue(userId, timezoneOf(user)).catch((error: unknown) => {
        log.warn({ error: String(error), userId }, 'World model not loaded');
        return [];
      })
    : [];
  return collectTriggers(userId, {
    now,
    // Unknown time zone: never "evening", so time-of-day triggers wait.
    localHour: localHourOf(user, now) ?? 0,
    lastTalkedAt: lastTalkedAt(user),
    worldDue,
  });
}

/** The first trigger that hasn't gone out yet, in priority order; notesOnly: pondered notes only. */
async function nextTrigger(
  userId: string,
  user: Record<string, unknown>,
  now: Date,
  deps: ProactiveDeps,
  notesOnly: boolean
): Promise<ProactiveTrigger | undefined> {
  const triggers = [
    ...(notesOnly ? [] : await checkInTriggers(userId, user, now, deps)),
    // Pondered follow-ups backed by the caller's own words (OUTREACH_PONDERED_NOTES).
    // A failed read skips them this minute; the triggers above still go out.
    ...(await ponderedTriggers(userId, user, now, timezoneOf(user)).catch((error: unknown) => {
      log.warn({ error: String(error), userId }, 'Pondered follow-ups not read');
      return [];
    })),
  ];
  // FORGET_EVERY_READER: nothing about a topic they asked Ferni to forget, from any
  // source; topics that can't be read send nothing this run (the check fails closed).
  const forgotten = await forgottenCheck(userId, 'proactive-tick');
  for (const t of triggers) {
    if (forgotten && (forgotten(t.text) || forgotten(t.reason))) continue;
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
  /** A call that couldn't be placed: where its words went instead. */
  fallbackChannel?: ProactiveChannel;
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
    const sent = await deps.sendSms(userId, trigger).catch((error: unknown) => {
      log.warn({ error: String(error), userId }, 'Proactive text failed');
      return false;
    });
    if (sent) return { channel, ok: true };
    return { channel: 'in_app', ok: await deps.sendInApp(userId, trigger), fallbackFrom: channel };
  }
  return { channel: 'in_app', ok: await deps.sendInApp(userId, trigger) };
}

/**
 * Ring them (the claim already logged it, so an overlapping run can't ring
 * again). A missed call leaves the words as a note in the app. A call that
 * couldn't be placed goes out the way the policy would pick without calls:
 * a text only if texts are on and under their caps, else a note in the app.
 * It still counts as today's call.
 */
async function call(
  userId: string,
  trigger: ProactiveTrigger,
  phone: string,
  policy: PolicyInput,
  deps: ProactiveDeps
): Promise<Delivered> {
  const outcome = deps.placeCall
    ? await deps.placeCall(userId, phone, trigger).catch((): CallOutcome => 'failed')
    : 'failed';
  if (outcome === 'failed') {
    const instead = chooseChannel({ ...policy, canCall: false }).channel;
    const sent = await deliver(userId, trigger, instead === 'sms' ? 'sms' : 'in_app', phone, deps);
    return { channel: 'voice_call', ok: sent.ok, outcome, fallbackChannel: sent.channel };
  }
  if (outcome !== 'answered') await deps.sendInApp(userId, trigger);
  return { channel: 'voice_call', ok: true, outcome };
}

/** Write it, send it on the chosen channel, log it. */
async function send(
  userId: string,
  trigger: ProactiveTrigger,
  choice: ChannelChoice & { channel: ProactiveChannel },
  policy: PolicyInput,
  deps: ProactiveDeps
): Promise<Delivered> {
  const written = await writeOutreachText({
    trigger,
    channel: choice.channel,
    lastText: lastTextOf(policy.recent),
    rotation: policy.recent.length,
  });
  const toSend = { ...trigger, text: written.text };
  const phone = policy.verifiedPhone;
  const sent =
    choice.channel === 'voice_call' && phone
      ? await call(userId, toSend, phone, policy, deps)
      : await deliver(userId, toSend, choice.channel, phone, deps);
  await writeOutreachLog(userId, {
    ...claimFor(trigger, choice, policy),
    channel: sent.channel,
    outcome: sent.outcome ?? (sent.ok ? 'sent' : 'failed'),
    text: written.text,
    textSource: written.source,
    ...(sent.outcome && { outcomeAt: new Date().toISOString() }),
    ...(sent.fallbackFrom && { fallbackFrom: sent.fallbackFrom }),
    ...(sent.fallbackChannel && { fallbackChannel: sent.fallbackChannel }),
  });
  if (sent.ok) {
    await trigger.afterSend?.().catch((error: unknown) => {
      log.warn({ error: String(error), userId, sourceId: trigger.sourceId }, 'After-send failed');
    });
  }
  return sent;
}

function claimFor(
  trigger: ProactiveTrigger,
  choice: ChannelChoice,
  policy: Pick<PolicyInput, 'now' | 'optedOut'>
): OutreachLogEntry {
  const optedOut = optedOutChannels(policy.optedOut);
  return {
    sourceId: trigger.sourceId,
    kind: trigger.kind,
    channel: choice.channel ?? 'in_app',
    reason: trigger.reason,
    why: choice.why,
    at: policy.now.toISOString(),
    outcome: 'pending',
    ...(optedOut.length > 0 && { optedOut }),
  };
}

/** No verified phone: nothing to opt out of, and nothing is texted or rung. */
const NO_PHONE: PhoneOptOuts = { sms: false, call: false };

async function runForUser(
  userId: string,
  now: Date,
  deps: ProactiveDeps,
  { dryRun, notesOnly }: { dryRun: boolean; notesOnly: boolean }
): Promise<UserTickResult> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const user = (await db.collection('bogle_users').doc(userId).get()).data();
  if (!user) return { userId, status: 'skipped', why: 'no such user' };

  const trigger = await nextTrigger(userId, user, now, deps, notesOnly);
  if (!trigger) return { userId, status: 'idle' };
  // Notes only: no phone and no calls, so the policy can only pick a note in the app.
  const verifiedPhone = notesOnly ? undefined : await deps.verifiedPhone(userId, user);
  let optedOut = NO_PHONE;
  if (verifiedPhone) {
    try {
      optedOut = await phoneOptOuts(userId, user, verifiedPhone);
    } catch (error) {
      // Fail closed: an opt-out we can't read must not pass for none.
      log.warn({ error: String(error), userId }, 'Opt-outs not read; sending nothing');
      return { userId, sourceId: trigger.sourceId, status: 'held', why: 'opt-out list unreadable' };
    }
  }
  const canCall = !notesOnly && deps.canCall?.() === true && deps.placeCall !== undefined;
  if (trigger.weight === 'meaningful' && !canCall) {
    log.info({ userId, sourceId: trigger.sourceId }, 'No SIP trunk here, so no call');
  }
  const input = {
    trigger,
    now,
    prefs: user.outreachPreferences,
    timezone: timezoneOf(user),
    verifiedPhone,
    lastTalkedAt: lastTalkedAt(user),
    canCall,
    optedOut,
  };
  const since = new Date(now.getTime() - HISTORY_MS);
  const decided = await claimOutreach(userId, trigger.sourceId, since, (recent) => {
    const choice = chooseChannel({ ...input, recent });
    const claim = choice.channel && !dryRun ? claimFor(trigger, choice, input) : undefined;
    return { result: { choice, policy: { ...input, recent } }, claim };
  });
  if (decided === 'claimed') return { userId, status: 'idle', why: 'another run has it' };
  const { choice, policy } = decided;
  const base = { userId, sourceId: trigger.sourceId, why: choice.why };
  const { channel } = choice;
  if (!channel) return { ...base, status: choice.stop ? 'skipped' : 'held' };
  if (dryRun) return { ...base, channel, status: 'dry_run' };

  const sent = await send(userId, trigger, { ...choice, channel }, policy, deps);
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
  const proactive = await proactiveUserIds();
  const notesOnly = new Set(await ponderedNotesOnlyUserIds(proactive));
  const dryRun = opts.dryRun === true;
  for (const userId of [...proactive, ...notesOnly]) {
    try {
      // One user at a time keeps Firestore reads and sends paced.
      // eslint-disable-next-line no-await-in-loop
      users.push(await runForUser(userId, now, deps, { dryRun, notesOnly: notesOnly.has(userId) }));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Proactive check-in failed');
      users.push({ userId, status: 'error', why: String(error) });
    }
  }
  return { enabled: true, users };
}
