/**
 * "Did you call my dad?": where the calls Ferni was asked to make to someone
 * stand, from the owner's own records over the last 30 days. Interim until the
 * recall ledger (lane 5 of docs/plans/2026-10-27-recall-ledger.md).
 *
 * Owner calls 2026-10-25 15:54 and 10-26 18:46, 21:46 UTC: Ferni denied a call
 * his mom had answered, and met "Did you call my dad?" with a fresh read-back.
 *
 * Sources: deferred_calls and on_behalf_calls under bogle_users/{uid}, whatever
 * `delivered` says, and read-backs waiting on the owner's yes. A callee's words
 * come back only as screened reported speech (caller-text.ts). Logs: ids, counts.
 *
 * @module services/outreach/call-recall
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { isUnverifiedUserId } from '../identity/unverified-user-id.js';
import {
  CALLER_TEXT_GUARD,
  callerText,
  reportedFromCall,
  screenedCallerText,
} from './caller-text.js';
import { about, firestoreCallRecords, personWord, type CallRecords } from './call-status.js';
import { spokenWhen } from './held-call-clocks.js';
import {
  setCallRecallPort,
  type CallQuery,
  type CallRecallPort,
  type RecalledCall,
  type SeenCall,
} from '../../tools/domains/telephony/index.js';

const log = createLogger({ module: 'CallRecall' });

const RECALL_WINDOW_MS = 30 * 86_400_000;
/** A call this recent (read back, placed, or answered) is told before a new one is read back. */
const RECENT_CALL_MS = 2 * 86_400_000;
/** A held call this late is dropped, not placed (deferred-calls.ts). */
const LATE_AFTER_MS = 12 * 60 * 60 * 1000;

function callStatusRecallOn(env: Env = process.env): boolean {
  return flagOn('CALL_STATUS_RECALL', env);
}

/** Only a verified member's own records: never an onbehalf:, anon:, phone: or device: id. */
export function mayRecall(userId: string | undefined): userId is string {
  return isMemberIdentity(userId) && !isUnverifiedUserId(userId);
}

type Doc = Record<string, unknown>;
const STOP = new Set('my our your his their dear old dr mr mrs ms call'.split(' '));
const lastTen = (v: unknown): string =>
  String(v ?? '')
    .replace(/\D/g, '')
    .slice(-10);
const time = (v: unknown): number => new Date(String(v ?? '')).getTime() || 0;

/** "my Dad Sam" → ["dad", "sam"]. */
export function queryWords(text: string): string[] {
  // "Lee's", "how's", "don't": the suffix goes, so a lone "s" or "t" never matches every name
  // with one ("how's the dentist thing" answered with "Dr. Lee's office", #3159 verify r2)
  const plain = text.toLowerCase().replace(/['’][a-z]{1,2}\b/g, '');
  const words = (plain.match(/[a-z]+/g) ?? []).filter((w) => w.length > 1);
  return [...new Set(words.flatMap((w) => (STOP.has(w) ? [] : [personWord(w) ?? []].flat())))];
}

function samePhone(phone: string | undefined, ...stored: unknown[]): boolean {
  const want = lastTen(phone);
  return want.length >= 7 && stored.some((p) => lastTen(p) === want);
}

function matches(doc: Doc, q: CallQuery): boolean {
  const r = (doc.request ?? {}) as Doc;
  const c = (r.resolvedContact ?? {}) as Doc;
  return samePhone(q.phone, c.phone, r.contactPhone) || q.words.some((w) => about(doc, w));
}

const nameOf = (doc: Doc): string => {
  const r = (doc.request ?? {}) as Doc;
  const c = (r.resolvedContact ?? {}) as Doc;
  return callerText(String(c.name || r.contactName || r.contactQuery || 'them'), 40);
};

const DEFERRED_FAILED: Readonly<Record<string, string>> = {
  failed: "the call couldn't be placed",
  missed: 'it was too late to place it once calling hours came round',
  'quiet-all-day': 'their quiet hours covered the whole day',
};
const HOW: Readonly<Record<string, string>> = {
  completed: 'they answered',
  voicemail: 'it went to voicemail',
  no_answer: 'nobody answered',
  busy: 'the line was busy',
};

function fromResult(doc: Doc): RecalledCall {
  const o = (doc.outcome ?? {}) as Doc;
  const [name, at, status] = [nameOf(doc), time(doc.capturedAt), String(o.status)];
  if (!HOW[status]) return { state: 'failed', name, at, detail: "the call didn't connect" };
  const left =
    status === 'voicemail' && o.voicemailLeft === true ? ' and Ferni left a message' : '';
  const words = status === 'completed' ? o.message || o.transcriptSummary || o.outcome : '';
  const said = screenedCallerText(String(words ?? ''), name, 240);
  return { state: 'done', name, at, detail: HOW[status] + left, said };
}

const awaitingAs =
  (q: CallQuery) =>
  (c: SeenCall): RecalledCall[] =>
    samePhone(q.phone, c.phone) || q.words.some((w) => queryWords(c.name).includes(w))
      ? [{ state: 'awaiting_yes', name: callerText(c.name.replace(/^call\s+/i, ''), 40), at: c.at }]
      : [];

/** Where the latest call to this person stands, from the records; undefined when there is none. */
export function recallFrom(
  q: CallQuery,
  input: { deferred: Doc[]; results: Doc[]; awaiting?: readonly SeenCall[] },
  now: number
): RecalledCall | undefined {
  const deferred = input.deferred.filter((d) => d.kind === 'on_behalf' && matches(d, q));
  const waiting = deferred
    .filter((d) => d.status === 'pending' && now - time(d.scheduledFor) <= LATE_AFTER_MS)
    .sort((a, b) => time(a.scheduledFor) - time(b.scheduledFor))[0];
  if (waiting) {
    const at = time(waiting.scheduledFor);
    const zone = typeof waiting.timezone === 'string' ? waiting.timezone : 'UTC';
    const detail = spokenWhen(new Date(at), zone, new Date(now));
    return { state: 'set', name: nameOf(waiting), at, detail };
  }
  const events: RecalledCall[] = input.results.filter((d) => matches(d, q)).map(fromResult);
  for (const d of deferred) {
    const at = time(d.placedAt ?? d.claimedAt ?? d.scheduledFor);
    if (d.status === 'placing' || d.status === 'placed')
      events.push({ state: 'in_progress', name: nameOf(d), at });
    const reason = DEFERRED_FAILED[String(d.status)];
    if (reason) events.push({ state: 'failed', name: nameOf(d), at, detail: reason });
  }
  events.push(...(input.awaiting ?? []).flatMap(awaitingAs(q)));
  // Newest first; at the same instant a result beats the "placed" it closes.
  const rank = (e: RecalledCall): number => (e.state === 'done' || e.state === 'failed' ? 1 : 0);
  return events
    .filter((e) => e.at > 0 && now - e.at <= RECALL_WINDOW_MS)
    .sort((a, b) => b.at - a.at || rank(b) - rank(a))[0];
}

/** One read of the owner's records, 30 days back. 'unread' when the read failed. Never throws. */
export async function recallCall(
  userId: string,
  q: CallQuery,
  awaiting: readonly SeenCall[] = [],
  now = Date.now(),
  records: CallRecords = firestoreCallRecords
): Promise<RecalledCall | undefined | 'unread'> {
  try {
    const loaded = await records.load(userId, new Date(now - RECALL_WINDOW_MS));
    const call = recallFrom(q, { ...loaded, awaiting }, now);
    const counts = { deferred: loaded.deferred.length, results: loaded.results.length };
    log.info(
      { userId, ...counts, awaiting: awaiting.length, state: call?.state ?? 'none' },
      'CALL_STATUS_RECALL'
    );
    return call;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'CALL_STATUS_RECALL: records not read');
    return 'unread';
  }
}

/** Whether a new read-back should wait for this status to be told first. */
export function blocksNewCall(call: RecalledCall, now: number): boolean {
  const told =
    call.state === 'awaiting_yes' || call.state === 'in_progress' || call.state === 'done';
  return told && now - call.at <= RECENT_CALL_MS;
}

function ago(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 2) return 'just now';
  if (min < 60) return `${min} minutes ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? 'about an hour ago' : `about ${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** What the model is told: the status in Ferni's words, then any callee words as reported speech. */
export function recallLine(
  call: RecalledCall | undefined | 'unread',
  who: string,
  now: number
): string {
  const person = callerText(who, 40) || 'them';
  if (call === 'unread')
    return "I couldn't read the call records just now. Say you can't check right now; don't guess, and don't read a new call back as if none happened.";
  if (!call)
    return `No call to ${person} in the last 30 days: Ferni hasn't called them. Say "not yet" plainly; offer to call only if the caller wants it.`;
  const { name } = call;
  const when = ago(call.at, now);
  if (call.state === 'awaiting_yes')
    return `Not called: Ferni read back a call to ${name} ${when} and never got the caller's yes, so nothing was dialed. Say that plainly; read a call back only if they want it now.`;
  if (call.state === 'set')
    return `Not called yet: the call to ${name} is set for ${call.detail ?? 'later'} their time, because of calling hours. Say that; don't offer a new call.`;
  if (call.state === 'in_progress')
    return `The call to ${name} went out ${when}, and there's no word yet on how it went. Say it's under way; don't offer a new call or guess how it went.`;
  if (call.state === 'failed')
    return `Ferni tried to call ${name} ${when}, but ${call.detail ?? "it didn't go through"}. Say so honestly, once.`;
  const head = `Ferni called ${name} ${when}, and ${call.detail ?? 'it went through'}. Answer from this; don't offer a new call unless the caller asks for one.`;
  if (!call.said) return head;
  return [head, CALLER_TEXT_GUARD, ...reportedFromCall(name, [call.said])].join('\n');
}

/** The records side of callStatus (tools/domains/telephony/call-status-tool.ts). */
const callRecallAdapter: CallRecallPort = {
  enabled: () => callStatusRecallOn(),
  mayRecall,
  queryWords,
  recall: (userId, q, awaiting, now) => recallCall(userId, q, awaiting, now),
  line: recallLine,
  blocksNewCall,
  windowMs: RECALL_WINDOW_MS,
};

/** Install the adapter; safe to call on every call. */
export function installCallRecallPort(): void {
  setCallRecallPort(callRecallAdapter);
}
