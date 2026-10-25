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

/**
 * A run of digits with phone punctuation between them (7+ digits are blanked),
 * an extension after it included. Digits are any script's (`\p{Nd}`): a
 * fullwidth or Arabic-Indic number is still a number. A leading "(415)" goes
 * with it, so no stray bracket is left behind.
 */
const PHONE_LIKE =
  /([+\uFF0B(\uFF08]{0,2}\p{Nd}[\p{Nd}\s().\-\uFF08\uFF09\uFF0D\uFF0E]{5,}\p{Nd})((?:\s*(?:x|ext[.:]?|extension)\s*\p{Nd}(?:[\p{Nd}\s().-]*\p{Nd})?)?)/giu;
const OPEN = /[(\uFF08]/gu;
const CLOSE = /[)\uFF09]/gu;
const LEADING_OPEN = /^[(\uFF08]/u;
/** A whole match that is only an ISO date (real month and day) is a date, not a number. */
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
/** ...or a date and an hour, when the text goes on ":mm" ("2026-10-22 8:30"). */
const DATE_HOUR = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]) \d{1,2}$/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

const DIGIT_WORD = 'zero|oh|one|two|three|four|five|six|seven|eight|nine';
/** Digits said as words, maybe mixed with numerals: "four one five, five five five, 0132". */
const SPELLED_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${DIGIT_WORD}|\\p{Nd}+)(?:[\\s,.\\-]+(?:${DIGIT_WORD}|\\p{Nd}+))+(?![\\p{L}\\p{N}])`,
  'giu'
);
const IS_DIGIT_WORD = new RegExp(`^(?:${DIGIT_WORD})$`, 'iu');

/**
 * An address said out loud: "jo dot lee at example dot com", "jo (at) example.com".
 * A plain " at " needs a spoken dot too, the domain can't be a word like "the",
 * and the name before it can't be a word that leads into "at" in a sentence, so
 * "meet at the dot com party" and "look at example dot com" stay prose.
 */
const LABEL = '[\\p{L}\\p{N}][\\p{L}\\p{N}_%+\\-]*';
const SAID_DOT = '(?:\\s+dot\\s+|\\s*[([]dot[)\\]]\\s*)';
const ANY_DOT = `(?:${SAID_DOT}|\\.)`;
const TLD = '(?:com|org|net|edu|gov|io|co|us|uk|ca|au|de|fr|me|ai|app|dev|info|biz)';
const NOT_A_DOMAIN = '(?!(?:the|a|an|this|that|my|your|our|his|her|their|its)\\b)';
const SPELLED_EMAIL = new RegExp(
  `(?<![\\p{L}\\p{N}._%+\\-])${LABEL}(?:${ANY_DOT}${LABEL})*` +
    `(?:\\s*[([]at[)\\]]\\s*${NOT_A_DOMAIN}(?:${LABEL}${ANY_DOT})+${TLD}` +
    `|\\s+at\\s+${NOT_A_DOMAIN}(?:${LABEL}${ANY_DOT})*${LABEL}${SAID_DOT}${TLD})` +
    '(?![\\p{L}\\p{N}])',
  'giu'
);

const PLAIN_AT = /^([\p{L}\p{N}_%+-]+)\s+at\s/iu;
const LEADS_INTO_AT = new Set(
  (
    'look looking looked meet meeting met see seen be is am are was were been stay staying ' +
    'work works working worked live lives living shop shopping arrive arriving arrived ' +
    'stop stopping eat eating sign signed order ordered buy bought find found check go ' +
    'went get got it them me us him her you here there out up in home sale'
  ).split(' ')
);

function blankSaidEmail(m: string): string {
  const name = PLAIN_AT.exec(m)?.[1]?.toLowerCase();
  return name && LEADS_INTO_AT.has(name) ? m : 'an email address';
}

const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

function blankPhone(m: string, core: string, ext: string, offset: number, whole: string): string {
  // A run that stays is handed back with what came after it checked on its own,
  // so a number written straight after a date ("...x415 555 0132") still goes.
  const kept = (): string => core + ext.replace(PHONE_LIKE, blankPhone);
  const unbracketed = core.replace(LEADING_OPEN, '');
  if (DATE_ONLY.test(unbracketed)) return kept();
  if (DATE_HOUR.test(unbracketed) && !ext && whole[offset + m.length] === ':') return m;
  // Any other run of 7+ digits goes, however long: two numbers side by side, or
  // a number next to a date, are blanked whole rather than shown.
  if (core.replace(/\P{Nd}/gu, '').length < 7) return kept();
  // "(415 555 0132)": the opening bracket belongs to the sentence, not the number.
  const keepOpen = LEADING_OPEN.test(core) && count(core, OPEN) > count(core, CLOSE);
  return keepOpen ? `${core[0]}a number` : 'a number';
}

function blankSpelled(m: string): string {
  const tokens = m.split(/[\s,.-]+/u).filter(Boolean);
  const words = tokens.filter((t) => IS_DIGIT_WORD.test(t)).length;
  const digits = tokens.reduce((n, t) => n + (IS_DIGIT_WORD.test(t) ? 1 : t.length), 0);
  return words >= 3 && digits >= 7 ? 'a number' : m;
}

/**
 * Phone-shaped runs are matched over the whole text first, and one is kept only
 * when all of it is a date or a date-time, so a date-shaped run inside a longer
 * number can never split that number and leave part of it showing.
 */
export function withoutContactDetails(text: string): string {
  return (
    text
      .replace(EMAIL_LIKE, 'an email address')
      .replace(SPELLED_EMAIL, blankSaidEmail)
      // Said digits first, so "four one five 555 0132" goes whole, not as "four one five a number".
      .replace(SPELLED_NUMBER, blankSpelled)
      .replace(PHONE_LIKE, blankPhone)
  );
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
