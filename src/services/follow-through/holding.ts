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

/** Every dash a phone number might be written with: hyphen, en/em dash, minus, fullwidth. */
const DASHES = '\\-\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D';
const ANY_DASH = new RegExp(`[${DASHES}]`, 'gu');

/**
 * A run of digits with phone punctuation between them (7+ digits are blanked),
 * an extension after it included. Digits are any script's (`\p{Nd}`): a
 * fullwidth or Arabic-Indic number is still a number. The punctuation is any
 * dash, a slash, an underscore or a backslash too ("415/555/0132",
 * "415–555–0132"). A leading "(415)" goes with it, so no stray bracket is left.
 */
const PHONE_LIKE = new RegExp(
  `([+\\uFF0B(\\uFF08]{0,2}\\p{Nd}[\\p{Nd}\\s()._/\\\\${DASHES}\\uFF08\\uFF09\\uFF0E\\uFF0F]{5,}\\p{Nd})` +
    '((?:\\s*(?:x|ext[.:]?|extension)\\s*\\p{Nd}(?:[\\p{Nd}\\s().-]*\\p{Nd})?)?)',
  'giu'
);
const OPEN = /[(\uFF08]/gu;
const CLOSE = /[)\uFF09]/gu;
const LEADING_OPEN = /^[(\uFF08]/u;
/** A whole match that is only an ISO date (real month and day) is a date, not a number. */
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
/** ...or a date and an hour, when the text goes on ":mm" ("2026-10-22 8:30"). */
const DATE_HOUR = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]) \d{1,2}$/;
/** ...or a date with slashes, either way round: "11/05/2026", "2026/11/05". */
const DATE_SLASHED =
  /^(?:(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|[12]\d|3[01])\/(?:\d{2}|\d{4})|\d{4}\/(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01]))$/;

/**
 * Starts only where a run of non-space starts (or right after an "@"): one
 * attempt per run keeps it linear, and the leftmost match is the same.
 */
const EMAIL_LIKE =
  /(?<![^\s@\uFF20\uFE6B])[^\s@\uFF20\uFE6B]+[@\uFF20\uFE6B][^\s@\uFF20\uFE6B]+[.\uFF0E\u3002\uFF61][^\s@\uFF20\uFE6B]+/gu;
/** "jane @ gmail.com": a spaced "@" needs a lettered ending, so "meet @ 5.30" stays. */
const SPACED_EMAIL =
  /(?<!\S)[^\s@\uFF20\uFE6B]+(?:\s+[@\uFF20\uFE6B]\s*|[@\uFF20\uFE6B]\s+)[\p{L}\p{N}-]+(?:[.\uFF0E\u3002\uFF61][\p{L}\p{N}-]+)*[.\uFF0E\u3002\uFF61]\p{L}{2,}(?![\p{L}\p{N}])/gu;

const DIGIT_WORDS = 'zero one two three four five six seven eight nine'.split(' ');
/** A digit said out loud, by value; "oh" and "o" are zero. */
const DIGIT_VALUE = new Map<string, number>([
  ...DIGIT_WORDS.map((w, i) => [w, i] as [string, number]),
  ['oh', 0],
  ['o', 0],
]);
const DIGIT_WORD = [...DIGIT_VALUE.keys()].sort((a, b) => b.length - a.length).join('|');
const SPELLED_SEP = `[\\s,.;${DASHES}]+`;
/** Digits said as words, maybe mixed with numerals: "four one five; five five five; 0132". */
const SPELLED_NUMBER = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${DIGIT_WORD}|\\p{Nd}+)(?:${SPELLED_SEP}(?:${DIGIT_WORD}|\\p{Nd}+))+(?![\\p{L}\\p{N}])`,
  'giu'
);
const SPELLED_SPLIT = new RegExp(SPELLED_SEP, 'u');
const YEAR = /^(?:19|20)\d{2}$/;

/**
 * An address said out loud: "jo dot lee at example dot com", "jo (at) example.com",
 * "jane at gmail.com". The ending after a said "dot" is any short word but a few
 * that only prose puts there ("dot com party" still ends in "com"); a written dot
 * after a plain " at " takes a listed ending only. The domain can't be a word
 * like "the", the name can't be a word that leads into "at" in a sentence, and
 * the name can't follow "met", "the" and the like, so "meet at the dot com
 * party", "met Sarah at google dot com" and "the deal at example.com" stay prose.
 */
const LABEL = "[\\p{L}\\p{N}][\\p{L}\\p{N}_%+\\-'’]*";
const SAID_DOT = '(?:\\s+dot\\s+|\\s*[([]dot[)\\]]\\s*)';
const ANY_DOT = `(?:${SAID_DOT}|\\.)`;
const TLD = '(?:com|org|net|edu|gov|io|co|us|uk|ca|au|de|fr|me|ai|app|dev|info|biz|tv|xyz)';
const SAID_TLD =
  '(?!(?:the|and|but|then|than|for|with|from|was|were|of|or|on|he|she|we|they|you|his|her|our|your|their|here|there|when|where|what|party|launch|office|map|page|line|time|day|days)(?![\\p{L}\\p{N}]))\\p{L}{2,6}';
const NOT_A_DOMAIN = '(?!(?:the|a|an|this|that|my|your|our|his|her|their|its)\\b)';
const SPELLED_EMAIL = new RegExp(
  `(?<![\\p{L}\\p{N}._%+\\-'’])${LABEL}(?:${ANY_DOT}${LABEL}){0,6}` +
    `(?:\\s*[([]at[)\\]]\\s*${NOT_A_DOMAIN}(?:${LABEL}${ANY_DOT}){1,6}(?:${TLD}|${SAID_TLD})` +
    `|\\s+at\\s+${NOT_A_DOMAIN}(?:${LABEL}${ANY_DOT}){0,6}${LABEL}(?:${SAID_DOT}${SAID_TLD}|\\.${TLD}))` +
    '(?![\\p{L}\\p{N}])',
  'giu'
);

const PLAIN_AT = /^([\p{L}\p{N}_%+'’-]+)\s+at\s/iu;
/** "he's", "mom's": a name with 's is a sentence, not an address. */
const CONTRACTION = /['’](?:s|m|re)$/u;
const LEADS_INTO_AT = new Set(
  (
    'look looking looked meet meeting met see seen be is am are was were been stay staying ' +
    'work works working worked live lives living shop shopping arrive arriving arrived ' +
    'stop stopping eat eating sign signed order ordered buy bought find found check go ' +
    'went get got it them me us him her you here there out up in home sale ' +
    'i he she we they lunch dinner breakfast brunch coffee drinks party interview job ' +
    'jobs office event launch class call talk demo meetup'
  ).split(' ')
);
/** A word before the name that makes it someone or something in a sentence. */
const BEFORE_A_NAME = new Set(
  (
    'the a an this that these those my your his her our their its ' +
    'met meet meeting saw see seeing seen visit visited visiting with and'
  ).split(' ')
);
const LAST_WORD = /([\p{L}'’]+)\s+$/u;

function blankSaidEmail(m: string, offset: number, whole: string): string {
  const name = PLAIN_AT.exec(m)?.[1]?.toLowerCase();
  if (!name) return 'an email address';
  if (LEADS_INTO_AT.has(name) || CONTRACTION.test(name)) return m;
  const before = LAST_WORD.exec(whole.slice(Math.max(0, offset - 24), offset))?.[1];
  return before && BEFORE_A_NAME.has(before.toLowerCase()) ? m : 'an email address';
}

const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

function blankPhone(m: string, core: string, ext: string, offset: number, whole: string): string {
  // A run that stays is handed back with what came after it checked on its own,
  // so a number written straight after a date ("...x415 555 0132") still goes.
  const kept = (): string => core + ext.replace(PHONE_LIKE, blankPhone);
  const unbracketed = core.replace(LEADING_OPEN, '');
  const dashed = unbracketed.replace(ANY_DASH, '-');
  if (DATE_ONLY.test(dashed) || DATE_SLASHED.test(unbracketed)) return kept();
  if (DATE_HOUR.test(dashed) && !ext && whole[offset + m.length] === ':') return m;
  // Any other run of 7+ digits goes, however long: two numbers side by side, or
  // a number next to a date, are blanked whole rather than shown.
  if (core.replace(/\P{Nd}/gu, '').length < 7) return kept();
  // "(415 555 0132)": the opening bracket belongs to the sentence, not the number.
  const keepOpen = LEADING_OPEN.test(core) && count(core, OPEN) > count(core, CLOSE);
  return keepOpen ? `${core[0]}a number` : 'a number';
}

/** "one, two, three": each said digit one up (or one down) from the last. */
function isCount(values: readonly number[]): boolean {
  const [first = 0, second = 0] = values;
  const step = second - first;
  return (
    (step === 1 || step === -1) &&
    values.every((v, i) => i === 0 || v - (values[i - 1] ?? v) === step)
  );
}

function blankSpelled(m: string): string {
  const tokens = m.split(SPELLED_SPLIT).filter(Boolean);
  const said = tokens.flatMap((t) => DIGIT_VALUE.get(t.toLowerCase()) ?? []);
  if (said.length < 3) return m;
  // A count with a year after it ("steps one, two, three, 2026") isn't a number.
  const counting = isCount(said);
  const digits = tokens.reduce(
    (n, t) => n + (DIGIT_VALUE.has(t.toLowerCase()) ? 1 : counting && YEAR.test(t) ? 0 : t.length),
    0
  );
  return digits >= 7 ? 'a number' : m;
}

function blankWindow(text: string): string {
  return (
    text
      .replace(EMAIL_LIKE, 'an email address')
      .replace(SPACED_EMAIL, 'an email address')
      .replace(SPELLED_EMAIL, blankSaidEmail)
      // Said digits first, so "four one five 555 0132" goes whole, not as "four one five a number".
      .replace(SPELLED_NUMBER, blankSpelled)
      .replace(PHONE_LIKE, blankPhone)
  );
}

/**
 * The patterns run on at most WINDOW chars at a time, so a long text costs
 * linear time however it is built. A window ends between two ordinary words
 * (never "at", "dot", a digit word or anything with a digit), so no number or
 * address is ever cut in two; only a text with no such gap in its last half
 * window is cut hard.
 */
export const WINDOW = 2000;
const CONTACT_WORD = new RegExp(`^(?:at|dot|x|ext|extension|${DIGIT_WORD})$`, 'iu');
const WORD_BEFORE = /(\p{L}+)$/u;
const WORD_AFTER = /^(\p{L}+)(?![\p{N}@\uFF20\uFE6B])/u;

function windowEnd(text: string, from: number): number {
  const limit = from + WINDOW;
  for (let i = limit; i > from + WINDOW / 2; i--) {
    if (!/\s/u.test(text.charAt(i))) continue;
    const before = WORD_BEFORE.exec(text.slice(i - 24, i))?.[1];
    const after = WORD_AFTER.exec(text.slice(i + 1, i + 25))?.[1];
    if (before && after && !CONTACT_WORD.test(before) && !CONTACT_WORD.test(after)) return i;
  }
  return limit;
}

/**
 * Phone-shaped runs are matched over the whole window first, and one is kept
 * only when all of it is a date or a date-time, so a date-shaped run inside a
 * longer number can never split that number and leave part of it showing.
 */
export function withoutContactDetails(text: string): string {
  if (text.length <= WINDOW) return blankWindow(text);
  let out = '';
  let from = 0;
  while (text.length - from > WINDOW) {
    const end = windowEnd(text, from);
    out += blankWindow(text.slice(from, end));
    from = end;
  }
  return out + blankWindow(text.slice(from));
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
