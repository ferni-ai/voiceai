/**
 * The texts Ferni sent a member lately, for a call to know about.
 *
 * "Ferni texted me, then I rang, and he didn't know" (Seth, 2026-10-19).
 * Guarded texts (check-in, follow-up, reminder, morning brief, "text me
 * that") are recorded in feature_checkins by sendGuardedText, and their
 * replies under feature_checkins/{id}/replies. Nothing at call start read
 * them. This reads them the way the sender's own gap check does: by the
 * stored userId (recordUserId), filtered in memory, so no composite index.
 *
 * A text about a topic the caller asked Ferni to forget never reaches a call
 * ("forget the biopsy", then the next call asks whether they saw the biopsy
 * text). The check is the one recentContext uses (forgottenWithin: the shared
 * read within 300 ms, read beside the texts). It always applies (not gated on
 * FORGET_EVERY_READER, like recentContext), so there is no "nothing to check"
 * case: the read is a check, or it is unreadable and no text is told.
 *
 * @module services/outreach/recent-texts
 */
import { forgottenWithin, type ForgottenCheck } from '../../memory/recall/forget-every-reader.js';
import { createLogger } from '../../utils/safe-logger.js';
import { CHECKINS, checkinDb, type StoredCheckin, type TextKind } from './checkin-replies.js';
import { firestoreTextStore, recordUserId, redactNumbers, type TextStore } from './guarded-text.js';

const log = createLogger({ module: 'recent-texts' });

/**
 * The forgotten-topics read: a check to apply, or unreadable (failed, late or
 * threw), which drops every text. There is deliberately no third case.
 */
export type ForgetRead =
  { kind: 'check'; isForgotten: ForgottenCheck } | { kind: 'unreadable'; why: 'unread' | 'threw' };

/** forgottenWithin's answer as a ForgetRead: its null (late or failed) is unreadable. */
export function forgetReadOf(check: ForgottenCheck | null): ForgetRead {
  return check ? { kind: 'check', isForgotten: check } : { kind: 'unreadable', why: 'unread' };
}

/** At most this many texts reach a call. */
export const MAX_RECENT_TEXTS = 3;
const SNIPPET_CHARS = 100;

export interface RecentText {
  kind: TextKind;
  /** ISO time it was sent. */
  sentAt: string;
  /** The full body as sent. */
  body: string;
  /** What it was about, for a call (textSnippet). */
  snippet: string;
  replied: boolean;
}

export interface RecentTextsStore extends Pick<TextStore, 'forUser'> {
  /** True when the text has at least one reply on record. */
  hasReply: (checkinId: string) => Promise<boolean>;
  /** The caller's forgotten topics: a check, or unreadable when they can't be read in time. */
  forgottenFor: (userId: string) => Promise<ForgetRead>;
}

/**
 * The body cut to ~100 chars for Ferni to be told about, never to read out: no
 * numbers (a "text me that" can quote someone else's), and none of the em
 * dashes or ellipses the voice text rules ban (speech-markup-notes.ts).
 */
export function textSnippet(body: string): string {
  const clean = (redactNumbers(body) ?? '')
    .replace(/\[number\]/g, 'a number')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\u2026|\.{2,}/g, '.')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= SNIPPET_CHARS) return clean;
  const cut = clean.slice(0, SNIPPET_CHARS);
  const space = cut.lastIndexOf(' ');
  return (space > SNIPPET_CHARS / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '');
}

export const firestoreRecentTextsStore: RecentTextsStore = {
  forUser: firestoreTextStore.forUser,
  async hasReply(checkinId) {
    const replies = checkinDb().collection(CHECKINS).doc(checkinId).collection('replies');
    return !(await replies.limit(1).get()).empty;
  },
  forgottenFor: async (userId) => forgetReadOf(await forgottenWithin(userId, 'recent-texts')),
};

/** The store's read, with a throw as unreadable; never throws. */
async function readForgotten(userId: string, store: RecentTextsStore): Promise<ForgetRead> {
  try {
    return await store.forgottenFor(userId);
  } catch (error: unknown) {
    log.warn({ error: String(error) }, 'Forgotten topics not read; no text is told');
    return { kind: 'unreadable', why: 'threw' };
  }
}

/**
 * Texts sent to this member at or after `sinceMs` (epoch ms), newest first,
 * at most MAX_RECENT_TEXTS, each with whether it has a reply. Never a text
 * sent for them to someone else ('on-behalf'), never a failed send, never one
 * about a forgotten topic, and none when the forgotten topics can't be read.
 */
export async function recentTextsFor(
  userId: string,
  sinceMs: number,
  store: RecentTextsStore = firestoreRecentTextsStore,
  env: Record<string, string | undefined> = process.env
): Promise<RecentText[]> {
  const storedId = recordUserId(userId, env);
  if (!storedId) return [];
  // Beside the texts' read, so both fit the caller's one bound.
  const forgottenRead = readForgotten(userId, store);
  const candidates = (await store.forUser(storedId))
    .map((r): [StoredCheckin, number] => [r, Date.parse(r.sentAt)])
    .filter(([r, t]) => r.status === 'sent' && r.kind !== 'on-behalf' && t >= sinceMs);
  if (candidates.length === 0) return [];
  const forget = await forgottenRead;
  if (forget.kind === 'unreadable') return []; // fail closed
  const sent = candidates
    .filter(([r]) => !forget.isForgotten(r.question))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_RECENT_TEXTS)
    .map(([r]) => r);
  const replied = await Promise.all(sent.map(async (r) => store.hasReply(r.id)));
  return sent.map((r, i) => ({
    kind: r.kind ?? 'checkin',
    sentAt: r.sentAt,
    body: r.question,
    snippet: textSnippet(r.question),
    replied: replied[i] === true,
  }));
}
