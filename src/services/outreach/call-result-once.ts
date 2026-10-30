/**
 * The owner hears about each call Ferni made for them once, the way a human
 * assistant would tell them: not two pushes and two emails (outreach audit
 * 2026-10-29, C).
 *
 * Once per call and channel: before a channel is used, its claim is set in a
 * transaction on the call's own doc, bogle_users/{uid}/on_behalf_calls/{callId}
 * as told.{channel}. That holds across processes, so the agent's report, the
 * Twilio status webhook and the voicemail screen can each capture the same call
 * and only the first tells. A claim records how much the telling carried:
 * - 0, status only (the Twilio webhook knows the line status, not the words);
 * - 1, the other person's words or a summary of them;
 * - 2, a crisis line.
 * A later capture that carries more claims again, so dedupe never costs the owner
 * their mom's words, and never a crisis line (caller-text.ts).
 *
 * With CALL_RESULT_ONE_CHANNEL on, one channel per result:
 * - the owner is live with Ferni: that's the channel, no push or text;
 * - not live and the result needs them (a callback, a message, a failed call,
 *   a crisis line): one text (CALL_RESULT_TEXT on and the guarded sender sent
 *   it), otherwise one push;
 * - not live and FYI only (a voicemail left, nothing asked): one push;
 * - the email always goes once, as the written record;
 * - a crisis line is pushed even when live: the live report may not carry it.
 * Off, each channel goes as before, once.
 *
 * @module services/outreach/call-result-once
 */

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { carriesCrisis, crisisCallerLine } from './caller-text.js';
import type { CallResultTold } from './call-result-text.js';
import type { StepOutcome } from './call-result-words.js';
import type { CallOutcome } from '../../tools/domains/telephony/types.js';

const log = createLogger({ module: 'call-result-once' });

type ToldChannel = 'voice' | 'push' | 'text' | 'email' | 'calendar' | 'record';
/** 0 status only, 1 their words, 2 a crisis line. */
type ToldLevel = 0 | 1 | 2;

/** What one capture can do; each is called at most once per call and level. */
export interface TellPorts {
  /** Tell the live session; true when the owner is in it. */
  live: () => Promise<boolean> | boolean;
  /** `lead` goes in front of the push body (Ferni's crisis line). */
  push: (lead?: string) => Promise<StepOutcome>;
  email: () => Promise<StepOutcome>;
  calendar: () => Promise<void>;
  /** Keep it for While You Were Away. */
  record: () => Promise<void>;
  /** One guarded text; null when CALL_RESULT_TEXT is off. */
  text: (live: boolean) => Promise<CallResultTold | null>;
  textOn: () => boolean;
}

export interface Told {
  live: boolean;
  push: StepOutcome;
  email: StepOutcome;
  text: CallResultTold | null | 'skipped';
}

function oneChannelOn(env: Record<string, string | undefined> = process.env): boolean {
  return flagOn('CALL_RESULT_ONE_CHANNEL', env);
}

/** Every field the call produced, the other person's words included. */
function fieldsOf(outcome: CallOutcome): string[] {
  const { outcome: said, transcriptSummary, message, actionItems, callbackTime } = outcome;
  return [said, transcriptSummary, message, callbackTime, ...(actionItems ?? [])].filter(
    (t): t is string => typeof t === 'string' && t.trim() !== ''
  );
}

function toldLevel(outcome: CallOutcome): ToldLevel {
  if (fieldsOf(outcome).some(carriesCrisis)) return 2;
  const words = [outcome.transcriptSummary, outcome.message].some((t) => !!t?.trim());
  return words || (outcome.actionItems?.length ?? 0) > 0 ? 1 : 0;
}

/** A callback, a message to pass on, a failed call or a crisis line: the owner should act. */
function needsOwner(outcome: CallOutcome): boolean {
  return (
    toldLevel(outcome) === 2 ||
    outcome.callbackRequired === true ||
    !!outcome.message?.trim() ||
    outcome.status === 'failed'
  );
}

// ============================================================================
// CLAIMS
// ============================================================================

/** Used when Firestore is off or fails: holds within this process. */
const claimedHere = new Map<string, Partial<Record<ToldChannel, ToldLevel>>>();

function claimHere(key: string, channel: ToldChannel, level: ToldLevel): boolean {
  const told = claimedHere.get(key) ?? {};
  if ((told[channel] ?? -1) >= level) return false;
  claimedHere.set(key, { ...told, [channel]: level });
  return true;
}

/**
 * True when this capture may use `channel`: nobody has, or only with less to say.
 * The claim is set before the send, so a send is at most once per level.
 */
async function claimTold(
  userId: string,
  callId: string,
  channel: ToldChannel,
  level: ToldLevel
): Promise<boolean> {
  const key = `${userId}/${callId}`;
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return claimHere(key, channel, level);
    const ref = db.collection('bogle_users').doc(userId).collection('on_behalf_calls').doc(callId);
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const told: unknown = snap.exists ? snap.data()?.told : undefined;
      const before = typeof told === 'object' && told ? (told as Record<string, unknown>)[channel] : undefined; // prettier-ignore
      if (typeof before === 'number' && before >= level) return false;
      tx.set(ref, { told: { [channel]: level } }, { merge: true });
      return true;
    });
    if (claimed) claimHere(key, channel, level);
    return claimed;
  } catch (error) {
    log.warn({ callId, channel, error: String(error) }, 'Told claim not stored; held in process');
    return claimHere(key, channel, level);
  }
}

/** For tests: forget the in-process claims. */
export function resetToldClaimsForTests(): void {
  claimedHere.clear();
}

// ============================================================================
// TELLING
// ============================================================================

type Claim = (channel: ToldChannel) => Promise<boolean>;

/** Tell the owner about one call: each channel once, and one of them with the flag on. */
export async function tellOwnerOnce(
  call: { userId: string; callId: string; outcome: CallOutcome; contactName: string },
  ports: TellPorts
): Promise<Told> {
  const level = toldLevel(call.outcome);
  const claim: Claim = async (channel) => claimTold(call.userId, call.callId, channel, level);
  // The first capture of a call (or one with more to say) is the one that tells live.
  const first = await claim('voice');
  const live = first ? await ports.live() : false;
  if (!oneChannelOn()) return asBefore(live, claim, ports);
  const email = await keepRecords(claim, ports);
  // A later capture with no more to say: the first one already chose the channel.
  const nudge = first ? await oneChannel(call, live, level === 2, claim, ports) : undefined;
  return { live, email, push: nudge?.push ?? 'skipped', text: nudge?.text ?? 'skipped' };
}

/** The written record (email), the callback event and While You Were Away; returns the email's. */
async function keepRecords(claim: Claim, ports: TellPorts): Promise<StepOutcome> {
  const email = (await claim('email')) ? await ports.email() : 'skipped';
  if (await claim('calendar')) await ports.calendar();
  if (await claim('record')) await ports.record();
  return email;
}

/** Flag off, as before: push unless CALL_RESULT_TEXT texts them, the records, then the text. */
async function asBefore(live: boolean, claim: Claim, ports: TellPorts): Promise<Told> {
  const push = !ports.textOn() && (await claim('push')) ? await ports.push() : 'skipped';
  const email = await keepRecords(claim, ports);
  const text = ports.textOn() && (await claim('text')) ? await ports.text(live) : 'skipped';
  return { live, push, email, text };
}

/** Flag on: live is the channel; else one text when it needs them, else one push. */
async function oneChannel(
  call: { outcome: CallOutcome; contactName: string },
  live: boolean,
  crisis: boolean,
  claim: Claim,
  ports: TellPorts
): Promise<Pick<Told, 'push' | 'text'>> {
  if (live && !crisis) return { push: 'skipped', text: 'skipped' };
  // Not live, or a crisis line the live report may not carry: told as if not live.
  const wantsText = needsOwner(call.outcome) && ports.textOn() && (await claim('text'));
  const text = wantsText ? await ports.text(false) : 'skipped';
  if (text === 'texted' || !(await claim('push'))) return { push: 'skipped', text };
  const lead = crisis && !carriesCrisis(call.outcome.outcome) ? crisisCallerLine(call.contactName) : undefined; // prettier-ignore
  return { push: await ports.push(lead), text };
}
