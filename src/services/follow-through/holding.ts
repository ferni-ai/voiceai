/**
 * What Ferni's holding for a person: their open follow-ups as the app shows
 * them (GET /api/follow-through/upcoming, the iOS widget and Live Activity).
 *
 * A friend who said "I'll remind you" can tell you what they're still
 * holding, soonest first, and owns up to the ones that slipped. So the list
 * keeps a follow-up that is past due but not yet stale and flags it
 * `slipped`, and drops what rightMoment would expire, since that is gone in
 * every way but the next job run.
 *
 * The view model is its own type, mapped field by field, never a spread of
 * the stored row: the source can move (one messages ledger, say) without the
 * app changing, and no internal field (an action's contactId, closedReason,
 * the source ref) can ride along. Something Ferni would do on the person's
 * behalf, a call or a text to someone, shows as a plain phrase and never
 * names who it is for; phone numbers and email addresses in any item's text
 * are blanked.
 *
 * Pure: the caller passes `now` and what the person asked Ferni to forget.
 *
 * @module services/follow-through/holding
 */

import { isClosed, type FollowUp, type FollowUpKind } from './follow-up.js';
import { rightMoment } from './right-moment.js';

export const MAX_HELD = 20;

export type HeldKind = 'reminder' | 'commitment' | 'promise' | 'thread' | 'date' | 'dose';
export type HeldSource = 'reminder' | 'commitment' | 'thread' | 'on-behalf' | 'other';

/** One thing Ferni's holding, as the app sees it. */
export interface HeldItem {
  readonly id: string;
  readonly kind: HeldKind;
  readonly text: string;
  /** UTC ISO instant, or null for "the next good moment". */
  readonly dueAt: string | null;
  /** The person's IANA zone, for showing dueAt in their time. */
  readonly zone: string;
  readonly status: 'open' | 'surfaced';
  /** Past due and still held: Ferni didn't get to it in time. */
  readonly slipped: boolean;
  readonly source: HeldSource;
}

export interface HoldingView {
  readonly items: HeldItem[];
  /** When this was read (UTC ISO). */
  readonly asOf: string;
}

const KIND: Record<FollowUpKind, HeldKind> = {
  reminder: 'reminder',
  commitment: 'commitment',
  promise: 'promise',
  thread: 'thread',
  date: 'date',
  dose: 'dose',
};

const SOURCE: Readonly<Record<string, HeldSource>> = {
  reminders: 'reminder',
  commitments: 'commitment',
  summaries: 'thread',
  outreach_confirm: 'on-behalf',
};

/** 7 to 15 digits with phone punctuation between them. */
const PHONE_LIKE = /\+?\d[\d\s().-]{5,}\d/g;
/** A whole match that is only an ISO date (real month and day) is a date, not a number. */
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
/** ...or a date and an hour, when the text goes on ":mm" ("2026-10-22 8:30"). */
const DATE_HOUR = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]) \d{1,2}$/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/**
 * Phone-shaped runs are matched over the whole text first, and one is kept only
 * when all of it is a date or a date-time, so a date-shaped run inside a longer
 * number can never split that number and leave part of it showing.
 */
function withoutContactDetails(text: string): string {
  return text
    .replace(EMAIL_LIKE, 'an email address')
    .replace(PHONE_LIKE, (m: string, offset: number, whole: string) => {
      const digits = m.replace(/\D/g, '').length;
      if (digits < 7 || digits > 15) return m;
      if (DATE_ONLY.test(m)) return m;
      if (DATE_HOUR.test(m) && whole[offset + m.length] === ':') return m;
      return 'a number';
    });
}

/**
 * An on-behalf item names someone else; the app says what it is, not who. A
 * row that lost its action (actionOf drops one with no tool) still names no one.
 */
function onBehalfPhrase(tool: string | undefined): string {
  if (!tool) return 'Something you asked me to do for you';
  return /call/i.test(tool) ? 'A call you asked me to make' : 'A message you asked me to send';
}

/** The stored follow-up as the app's item. */
export function toHeldItem(f: FollowUp, now: Date): HeldItem {
  const pastDue = f.dueAt !== null && Date.parse(f.dueAt) <= now.getTime();
  const onBehalf = f.action !== undefined || f.source.store === 'outreach_confirm';
  return {
    id: f.id,
    kind: KIND[f.kind],
    text: onBehalf ? onBehalfPhrase(f.action?.tool) : withoutContactDetails(f.text),
    dueAt: f.dueAt,
    zone: f.zone,
    status: f.status === 'surfaced' ? 'surfaced' : 'open',
    slipped: pastDue,
    source: onBehalf ? 'on-behalf' : (SOURCE[f.source.store] ?? 'other'),
  };
}

/** dueAt ascending, undated last; ties by age then id, so the order is stable. */
function soonestFirst(a: FollowUp, b: FollowUp): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  }
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * What Ferni's holding for `userId`: their still-live follow-ups, minus any
 * about a topic they asked Ferni to forget, soonest first, at most MAX_HELD.
 */
export function whatFerniHolds(
  userId: string,
  followUps: readonly FollowUp[],
  forgotten: (text: string) => boolean,
  now: Date
): HoldingView {
  const items = followUps
    .filter((f) => f.userId === userId && !isClosed(f))
    .filter((f) => rightMoment(f, now) !== 'expire')
    .filter((f) => !forgotten(f.text))
    .sort(soonestFirst)
    .slice(0, MAX_HELD)
    .map((f) => toHeldItem(f, now));
  return { items, asOf: now.toISOString() };
}
