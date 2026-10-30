/**
 * The owner hears about each call Ferni made for them once, the way a human
 * assistant would tell them: not two pushes and two emails (outreach audit
 * 2026-10-29, C).
 *
 * Once per call and channel: before a channel is used, its claim is set in a
 * transaction on the call's own doc, bogle_users/{uid}/on_behalf_calls/{callId}
 * as told.{channel}. That holds across processes, so the agent's report, the
 * Twilio status webhook and the voicemail screen can each capture the same call
 * and only the first tells. A send that fails or is held (quiet hours) gives its
 * claim back, so a later capture can still tell. A claim records how much the
 * telling carried:
 * - 0, status only (the Twilio webhook knows the line status, not the words);
 * - 1, the other person's words or a summary of them;
 * - 2, a crisis line.
 * A later capture that carries more claims again, so dedupe never costs the owner
 * their mom's words.
 *
 * A crisis line (caller-text.ts) anywhere in the result is pushed at once, led by
 * Ferni's crisis line, flag on or off, live or not, texted or not. It has its own
 * claim (told.crisis), so no dedupe or channel choice can drop it.
 *
 * With CALL_RESULT_ONE_CHANNEL on, one channel per result:
 * - the owner is live with Ferni: that's the channel, no push or text;
 * - not live and the result needs them (a callback, a message, a failed call,
 *   a crisis line): one text (CALL_RESULT_TEXT on and the guarded sender sent
 *   it), otherwise one push;
 * - not live and FYI only (a voicemail left, nothing asked): one push;
 * - the email always goes once, as the written record.
 * Off, each channel goes as before, once.
 *
 * @module services/outreach/call-result-once
 */

import { flagOn } from '../../config/env-flag.js';
import { carriesCrisis, crisisCallerLine } from './caller-text.js';
import { callResultDetails, type CallResultTold } from './call-result-text.js';
import type { StepOutcome } from './call-result-words.js';
import type { CallOutcome } from '../../tools/domains/telephony/types.js';
import { claimTold, releaseTold, type Claimed, type ToldChannel } from './call-result-claims.js';

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
// TELLING
// ============================================================================

/** One capture's claims: take a channel, or send through it and give it back if it didn't go. */
interface Claims {
  take: (channel: ToldChannel) => Promise<boolean>;
  /** Claim `channel` (and `also`, in one write) before `run`; give them back if it didn't go. */
  send: <T>(channel: ToldChannel, run: () => Promise<T>, went: (r: T) => boolean, also?: ToldChannel[]) => Promise<T | 'skipped'>; // prettier-ignore
}

function claimsFor(userId: string, callId: string, level: ToldLevel): Claims {
  const claim = async (channel: ToldChannel, also: ToldChannel[] = []): Promise<Claimed | null> =>
    claimTold(userId, callId, channel, channel === 'crisis' ? 2 : level, also);
  return {
    take: async (channel) => (await claim(channel)) !== null,
    send: async (channel, run, went, also) => {
      const claimed = await claim(channel, also);
      if (!claimed) return 'skipped';
      const result = await run();
      if (!went(result)) await releaseTold(userId, callId, claimed);
      return result;
    },
  };
}

const sent = (r: StepOutcome): boolean => r === 'sent';
const toldBy = (r: CallResultTold | null): boolean => r === 'texted' || r === 'live';

/** Ferni's crisis line, when the call carried one anywhere. */
function crisisLead(outcome: CallOutcome, contactName: string): string | undefined {
  return toldLevel(outcome) === 2 ? crisisCallerLine(contactName) : undefined;
}

/** The email's first line (Ferni's crisis line) and what they asked to pass on plus the summary. */
export function ownerEmailWords(
  contactName: string,
  outcome: CallOutcome
): { lead?: string; details?: string } {
  const lead = crisisLead(outcome, contactName);
  const details = callResultDetails(contactName, outcome);
  const rest = lead ? details?.split(lead).join(' ').replace(/\s+/g, ' ').trim() : details;
  return { lead, details: rest || undefined };
}

/** Tell the owner about one call: each channel once, and one of them with the flag on. */
export async function tellOwnerOnce(
  call: { userId: string; callId: string; outcome: CallOutcome; contactName: string },
  ports: TellPorts
): Promise<Told> {
  const level = toldLevel(call.outcome);
  const claims = claimsFor(call.userId, call.callId, level);
  // The first capture of a call (or one with more to say) is the one that tells live.
  const first = await claims.take('voice');
  const live = first ? await ports.live() : false;
  // A crisis line goes by push at once, whatever else happens. That push is this call's push:
  // its claim takes told.crisis and told.push together, before the send, so no capture
  // sends a second one, and a failed send gives both back for a later capture to retry.
  const lead = crisisLead(call.outcome, call.contactName);
  const alarm = lead ? await claims.send('crisis', async () => ports.push(lead), sent, ['push']) : null; // prettier-ignore
  if (!oneChannelOn()) return asBefore(live, alarm, claims, ports);
  const email = await keepRecords(claims, ports);
  // A later capture with no more to say: the first one already chose the channel. A crisis
  // goes on, so a text held for quiet hours (its claim given back) is sent by a later capture.
  const nudge = first || lead ? await oneChannel(call, live, alarm, claims, ports) : undefined;
  return { live, email, push: alarm ?? nudge?.push ?? 'skipped', text: nudge?.text ?? 'skipped' }; // prettier-ignore
}

/** The push, once. With a crisis line, the crisis push above was it: never a second one. */
async function pushOnce(
  claims: Claims,
  ports: TellPorts,
  alarm: StepOutcome | null
): Promise<StepOutcome> {
  // prettier-ignore
  return alarm ?? claims.send('push', async () => ports.push(), sent);
}

/** The written record (email), the callback event and While You Were Away; returns the email's. */
async function keepRecords(claims: Claims, ports: TellPorts): Promise<StepOutcome> {
  const email = await claims.send('email', async () => ports.email(), sent);
  if (await claims.take('calendar')) await ports.calendar();
  if (await claims.take('record')) await ports.record();
  return email;
}

/** Flag off, as before: push unless CALL_RESULT_TEXT texts them, the records, then the text. */
async function asBefore(
  live: boolean,
  alarm: StepOutcome | null,
  claims: Claims,
  ports: TellPorts
): Promise<Told> {
  const push = ports.textOn() ? 'skipped' : await pushOnce(claims, ports, alarm);
  const email = await keepRecords(claims, ports);
  const text = ports.textOn() ? await claims.send('text', async () => ports.text(live), toldBy) : 'skipped'; // prettier-ignore
  return { live, push: alarm ?? push, email, text };
}

/** Flag on: live is the channel; else one text when it needs them, else one push. */
async function oneChannel(
  call: { outcome: CallOutcome; contactName: string },
  live: boolean,
  alarm: StepOutcome | null,
  claims: Claims,
  ports: TellPorts
): Promise<Pick<Told, 'push' | 'text'>> {
  const lead = crisisLead(call.outcome, call.contactName);
  if (live && !lead) return { push: 'skipped', text: 'skipped' };
  // Not live, or a crisis line the live report may not carry: told as if not live.
  const wantsText = needsOwner(call.outcome) && ports.textOn();
  const text = wantsText ? await claims.send('text', async () => ports.text(false), toldBy) : 'skipped'; // prettier-ignore
  if (text === 'texted') return { push: 'skipped', text };
  return { push: await pushOnce(claims, ports, alarm), text };
}
