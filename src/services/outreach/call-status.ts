/**
 * Where a call Ferni was asked to place stands, for anything about to ask the
 * caller how it went.
 *
 * Owner call 2026-10-18: a call opened on "how did that phone call with your
 * mom go yesterday?". That call was still held by the call-hours guard
 * (deferred_calls) and had never rung, and Ferni then told the call as if it had
 * happened. The request "call my mom" sat with the caller's commitments, and
 * the check-in asked how it went (commitment-follow-up.ts, session priming).
 *
 * A statement that asks for a call to someone ("call my mom") is checked
 * against the user's recent on-behalf calls to that person:
 * - held (waiting for its hour): not happened; at most say when it is set;
 * - failed (no answer, voicemail, couldn't connect, dropped): say so, once;
 * - placed with no result yet: unknown; don't ask or guess;
 * - completed: may be asked about, so no note.
 * No on-behalf call to them: the statement is the caller's own, unchanged.
 * A failed read leaves everything unchanged.
 *
 * @module services/outreach/call-status
 */

import { createLogger } from '../../utils/safe-logger.js';
import { callCheckIns } from '../superhuman/commitment-follow-up.js';
import { spokenWhen } from './deferred-calls.js';

const log = createLogger({ module: 'CallStatus' });

export type FerniCallState = 'held' | 'failed' | 'unknown' | 'completed';
export interface FerniCall {
  state: FerniCallState;
  /** When a held call rings, in the recipient's time ("later today at 9:00 AM"). */
  when?: string;
  /** The contact's name on a call that has a result ("Rita" for "my mom"). */
  name?: string;
}

type Doc = Record<string, unknown>;

/** The user's recent deferred_calls and on_behalf_calls documents. */
export interface CallRecords {
  load(userId: string, since: Date): Promise<{ deferred: Doc[]; results: Doc[] }>;
}

export const firestoreCallRecords: CallRecords = {
  async load(userId, since) {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return { deferred: [], results: [] };
    const user = db.collection('bogle_users').doc(userId);
    const iso = since.toISOString();
    const [deferred, results] = await Promise.all([
      user.collection('deferred_calls').where('createdAt', '>=', iso).get(),
      user.collection('on_behalf_calls').where('capturedAt', '>=', iso).get(),
    ]);
    return {
      deferred: deferred.docs.map((d) => d.data()),
      results: results.docs.map((d) => d.data()),
    };
  },
};

/** How far back a call still answers for a request to call someone. */
const WINDOW_MS = 7 * 86_400_000;
/** A held call this late is dropped, not placed (deferred-calls.ts). */
const LATE_AFTER_MS = 12 * 60 * 60 * 1000;

const SAME: Readonly<Record<string, string>> = {
  ...Object.fromEntries('mother mum mama mommy'.split(' ').map((w) => [w, 'mom'])),
  ...Object.fromEntries('father papa daddy'.split(' ').map((w) => [w, 'dad'])),
  sis: 'sister',
  bro: 'brother',
  grandmother: 'grandma',
  grandfather: 'grandpa',
};
const wordsOf = (v: unknown): string[] =>
  typeof v === 'string' ? (v.toLowerCase().match(/[a-z]+/g) ?? []).map((w) => SAME[w] ?? w) : [];

const CALL_WHO =
  /\b(?:call|ring|phone)\s+(?:up\s+)?(?:my\s+|your\s+)?([a-z]+)|\bgive\s+(?:my\s+|your\s+)?([a-z]+)\s+a\s+(?:call|ring)\b/i;
const NOT_A_PERSON = new Set(
  'you me back it that this them him her us the a in out off again later soon tomorrow tonight today'.split(
    ' '
  )
);

/** One word for a person, as the records name them ("mother" is "mom"), or null for a pronoun. */
export function personWord(word: string): string | null {
  const who = word.toLowerCase();
  return NOT_A_PERSON.has(who) ? null : (SAME[who] ?? who);
}

/** The person a statement asks to call ("call my mom" is "mom"), or null. */
export function personToCall(statement: string): string | null {
  const m = CALL_WHO.exec(statement);
  const who = (m?.[1] ?? m?.[2])?.toLowerCase();
  return who && !NOT_A_PERSON.has(who) ? (SAME[who] ?? who) : null;
}

/** Whether a call record is to this person (a word as personWord names it). */
export const about = (doc: Doc, person: string): boolean => {
  const r = (doc.request ?? {}) as Record<string, unknown>;
  const c = (r.resolvedContact ?? {}) as Record<string, unknown>;
  return [r.contactQuery, r.contactName, c.name, c.relationship, c.notes]
    .flatMap(wordsOf)
    .includes(person);
};
const time = (v: unknown): number => new Date(String(v ?? '')).getTime() || 0;

/** The latest on-behalf call to this person, from the records; undefined when there is none. */
export function callStatusOf(
  person: string,
  records: { deferred: Doc[]; results: Doc[] },
  now: number
): FerniCall | undefined {
  const calls = records.deferred.filter((d) => d.kind === 'on_behalf' && about(d, person));
  const waiting = calls
    .filter((d) => (d.status === 'pending' || d.status === 'placing') && d.scheduledFor)
    .filter((d) => now - time(d.scheduledFor) <= LATE_AFTER_MS)
    .sort((a, b) => time(a.scheduledFor) - time(b.scheduledFor))[0];
  if (waiting) {
    const at = new Date(time(waiting.scheduledFor));
    const zone = typeof waiting.timezone === 'string' ? waiting.timezone : 'UTC';
    return { state: 'held', when: spokenWhen(at, zone, new Date(now)) };
  }
  const result = records.results
    .filter((d) => about(d, person))
    .sort((a, b) => time(b.capturedAt) - time(a.capturedAt))[0];
  if (result) {
    const status = (result.outcome as { status?: unknown } | undefined)?.status;
    const r = (result.request ?? {}) as Doc;
    const name =
      String(((r.resolvedContact ?? {}) as Doc).name ?? r.contactName ?? '') || undefined;
    return { state: status === 'completed' ? 'completed' : 'failed', name };
  }
  const last = calls.sort((a, b) => time(b.createdAt) - time(a.createdAt))[0];
  if (!last) return undefined;
  return { state: last.status === 'failed' || last.status === 'missed' ? 'failed' : 'unknown' };
}

/**
 * Each statement that asks for a call to someone Ferni was asked to call, with
 * where that call stands; completed calls are left out (they may be asked
 * about). One read, and only when a statement names a call. Never throws.
 */
export async function ferniCallsFor(
  userId: string,
  statements: readonly string[],
  now = Date.now(),
  records: CallRecords = firestoreCallRecords
): Promise<Map<string, FerniCall>> {
  const found = new Map<string, FerniCall>();
  const asked = statements.flatMap((s) => {
    const person = personToCall(s);
    return person ? [{ s, person }] : [];
  });
  if (asked.length === 0) return found;
  try {
    const loaded = await records.load(userId, new Date(now - WINDOW_MS));
    for (const { s, person } of asked) {
      const call = callStatusOf(person, loaded, now);
      if (call && call.state !== 'completed') found.set(s, call);
    }
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Call status not read');
  }
  return found;
}

/**
 * Where the latest call Ferni was asked to make to this person stands, completed
 * included; 'none' when there is no such call or the read failed (no result to
 * tell either way). One read. Never throws.
 */
export async function requestedCallStatus(
  userId: string,
  person: string,
  now = Date.now(),
  records: CallRecords = firestoreCallRecords
): Promise<FerniCall | 'none'> {
  try {
    const loaded = await records.load(userId, new Date(now - WINDOW_MS));
    return callStatusOf(person, loaded, now) ?? 'none';
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Requested call status not read');
    return 'none';
  }
}

/** What the model is told about a call it might otherwise ask how it went. */
export function callStatusNote(call: FerniCall): string {
  if (call.state === 'held') {
    return `Ferni was asked to make this call and it has not happened yet: it is set for ${call.when ?? 'later'} their time. Do not ask how it went or talk as if it happened; at most say when it is set.`;
  }
  if (call.state === 'failed') {
    return "Ferni's call here didn't get through. Say so honestly, once; do not ask how it went.";
  }
  return 'Ferni placed this call but has no word on how it went. Do not ask how it went or guess.';
}

/** The check-in line for each statement about a call that hasn't completed (commitment-follow-up.ts). */
export async function ferniCallNotes(
  userId: string,
  statements: readonly string[],
  now = Date.now(),
  records: CallRecords = firestoreCallRecords
): Promise<Map<string, string>> {
  const calls = await ferniCallsFor(userId, statements, now, records);
  return new Map([...calls].map(([statement, call]) => [statement, callStatusNote(call)]));
}

/** This call's commitment check-ins, each noting a call Ferni hasn't completed. */
export const checkInsWithCalls = (userId: string) =>
  callCheckIns(userId, undefined, undefined, ferniCallNotes);
