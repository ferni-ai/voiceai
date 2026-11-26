/**
 * What Ferni did for the owner over the last 30 days, in one list the model answers from
 * (RECALL_ACTIVITY): every call he was asked to make, newest first, then reminders, emailed
 * summaries and his own promises, with what is still open on top. Read by callStatus
 * (tools/domains/telephony/call-status-tool.ts) for the owner proven on the line only.
 *
 * The recall-ledger plan (docs/plans/2026-10-27-recall-ledger.md, lane 5) meant to read one
 * ledger; it was dropped in #3715 with no writer, so this reads the stores that hold the records
 * (activity-records.ts). Nightly recall eval 2026-11-24: "and the time before that?", "did my
 * reminder go out?", "why did you email me?" and "is anything still open?" scored 0 to 0.2.
 *
 * Pure: no I/O. Callee words come only as screened reported speech (caller-text.ts).
 *
 * @module services/outreach/activity-recall
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { CALLER_TEXT_GUARD, callerText, reportedFromCall } from './caller-text.js';
import type { CallHistoryEntry } from './call-recall.js';

export function recallActivityOn(env: Env = process.env): boolean {
  return flagOn('RECALL_ACTIVITY', env);
}

type Doc = Record<string, unknown>;

/** The owner's records over the window, as activity-records.ts reads them. */
export interface ActivityRecords {
  readonly calls: readonly CallHistoryEntry[];
  readonly reminders: readonly Doc[];
  readonly emails: readonly Doc[];
  readonly promises: readonly Doc[];
  /** The owner's zone, when a record names one. */
  readonly zone?: string;
  /** Stores that could not be read: said as unknown, never as "nothing". */
  readonly unread?: readonly string[];
}

/** One line of the list: open (still to happen or still owed) or past. */
interface Line {
  readonly at: number;
  readonly open: boolean;
  readonly text: string;
}

const WINDOW_MS = 30 * 86_400_000;
const MAX_LINES = 14;

/** A Firestore Timestamp, a Date, an ISO string or epoch ms, as epoch ms; 0 when none. */
function millis(v: unknown): number {
  if (v instanceof Date) return v.getTime() || 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') return Date.parse(v) || 0;
  const t = v as { toMillis?: () => number } | null;
  return typeof t?.toMillis === 'function' ? t.toMillis() : 0;
}

/** `zone` when Intl knows it, else undefined: a bad zone in a record must never throw here. */
export function validZone(zone: string | undefined): string | undefined {
  if (zone === undefined || zone === '') return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined; // RangeError: not an IANA zone
  }
}

function partOfDay(hour: number): string {
  if (hour < 5) return 'at night';
  if (hour < 12) return 'in the morning';
  if (hour < 17) return 'in the afternoon';
  if (hour < 21) return 'in the evening';
  return 'at night';
}

/** "Tuesday, November 24, in the morning (10:00 AM)" in `zone`. */
function whenSaid(at: number, zone: string): string {
  const d = new Date(at);
  const day = d.toLocaleDateString('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const hour = Number(
    d.toLocaleString('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' })
  );
  const clock = d.toLocaleTimeString('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day}, ${partOfDay(hour)} (${clock})`;
}

const who = (c: CallHistoryEntry): string =>
  c.relationship && c.relationship.toLowerCase() !== c.name.toLowerCase()
    ? `${c.name} (their ${c.relationship})`
    : c.name;

function callLine(c: CallHistoryEntry, zone: string): Line {
  const when = whenSaid(c.at, zone);
  const to = who(c);
  if (c.state === 'set')
    return {
      at: c.at,
      open: true,
      text: `A call to ${to} is set for ${when}, not placed yet (held for calling hours).`,
    };
  if (c.state === 'in_progress')
    return {
      at: c.at,
      open: true,
      text: `${when}: a call to ${to} went out; no word yet on how it went.`,
    };
  if (c.state === 'failed')
    return {
      at: c.at,
      open: false,
      text: `${when}: Ferni tried to call ${to}, but ${c.detail ?? "it didn't go through"}.`,
    };
  return {
    at: c.at,
    open: false,
    text: `${when}: Ferni called ${to}, and ${c.detail ?? 'it went through'}.`,
  };
}

const REMINDER_SENT = new Set(['delivered', 'completed', 'sent', 'in_app_unnotified']);

function reminderLine(d: Doc, zone: string): Line | null {
  const at = millis(d.scheduledFor);
  const what = callerText(String(d.message ?? d.text ?? ''), 120);
  if (!at || !what) return null;
  const status = String(d.status ?? (d.completed === true ? 'completed' : 'pending'));
  const when = whenSaid(at, zone);
  if (status === 'pending')
    return { at, open: true, text: `Reminder "${what}" is set for ${when}, not sent yet.` };
  if (status === 'cancelled')
    return { at, open: false, text: `Reminder "${what}" for ${when} was cancelled.` };
  if (status === 'failed')
    return { at, open: false, text: `${when}: reminder "${what}" failed to go out.` };
  if (!REMINDER_SENT.has(status)) return null;
  return { at, open: false, text: `${when}: reminder "${what}" went out.` };
}

function emailLine(d: Doc, zone: string): Line | null {
  if (d.channel !== 'email') return null;
  const at = millis(d.deliveredAt ?? d.sentAt ?? d.createdAt);
  if (!at) return null;
  const subject = callerText(String(d.subject ?? ''), 100);
  const why = callerText(String(d.reason ?? ''), 140);
  const what = subject ? `"${subject}"` : `a ${callerText(String(d.type ?? 'message'), 30)}`;
  const failed = d.status === 'failed';
  const head = `${whenSaid(at, zone)}: Ferni ${failed ? 'tried to email' : 'emailed'} the caller ${what}`;
  const tail = failed ? ', but it failed.' : why ? `, because ${why}.` : '; no record of why.';
  return { at, open: false, text: head + tail };
}

const PROMISE_OPEN = new Set(['open', 'surfaced']);

function promiseLine(d: Doc, zone: string): Line | null {
  if (d.owner !== 'ferni') return null;
  const what = callerText(String(d.text ?? ''), 140);
  const at = millis(d.createdAt);
  if (!what || !at) return null;
  const status = String(d.status ?? 'open');
  if (PROMISE_OPEN.has(status))
    return {
      at,
      open: true,
      text: `Ferni still owes this, promised ${whenSaid(at, zone)}: ${what}.`,
    };
  if (status === 'done')
    return { at, open: false, text: `${whenSaid(at, zone)}: Ferni promised to ${what}, and did.` };
  return null;
}

/**
 * The list the model is told: what's still open first (soonest first), then what happened
 * (newest first), each with weekday and date in the owner's zone; then any callee words as
 * reported speech. Empty records: say there is nothing, plainly.
 */
export function activityText(records: ActivityRecords, now: number): string {
  const zone = validZone(records.zone) ?? 'UTC';
  const lines = [
    ...records.calls.map((c) => callLine(c, zone)),
    ...records.reminders.map((d) => reminderLine(d, zone)),
    ...records.emails.map((d) => emailLine(d, zone)),
    ...records.promises.map((d) => promiseLine(d, zone)),
  ].filter((l): l is Line => l !== null && (l.open || now - l.at <= WINDOW_MS));
  const unreadStores = records.unread ?? [];
  const unread =
    unreadStores.length > 0
      ? `Couldn't read ${unreadStores.join(', ')} just now: for those, say you can't check right now; never say nothing happened.`
      : '';
  if (lines.length === 0 && unread) return unread;
  if (lines.length === 0)
    return 'Nothing else Ferni did for the caller in the last 30 days: no calls, reminders, emails or promises on record.';
  const open = lines.filter((l) => l.open).sort((a, b) => a.at - b.at);
  const past = lines.filter((l) => !l.open).sort((a, b) => b.at - a.at);
  const kept = [...open, ...past].slice(0, MAX_LINES);
  const out = [
    ...(unread ? [unread] : []),
    `Everything Ferni did for the caller in the last 30 days, from the records (times are the caller's, ${zone}). Answer from this, including "the time before that", "did my reminder go out", "why did you email me" and "what's still open". Anything not listed didn't happen: say so plainly, never guess.`,
    'Still open:',
    ...(kept.some((l) => l.open)
      ? kept.filter((l) => l.open).map((l) => `- ${l.text}`)
      : ['- nothing']),
    'Done, newest first:',
    ...(kept.some((l) => !l.open)
      ? kept.filter((l) => !l.open).map((l) => `- ${l.text}`)
      : ['- nothing']),
  ];
  const said = records.calls.filter((c) => c.said).slice(0, 3);
  if (said.length === 0) return out.join('\n');
  const reports = said.flatMap((c) =>
    reportedFromCall(c.name, [`(${whenSaid(c.at, zone)}) ${c.said}`])
  );
  return [...out, CALLER_TEXT_GUARD, ...reports].join('\n');
}
