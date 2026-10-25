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
 * Exactly two dates, or two years with a slash, the second no earlier than the
 * first and at most five years on: "2026/2027", "2026-10-24–2026-10-30",
 * "10/24/2026 – 10/30/2026". A bare year joined by a dash ("2026-2027") or a
 * third part ("2026-2027-1234") is a number.
 */
const MONTH = '(?:0?[1-9]|1[0-2])';
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const FULL_DATE = `(?:(?:19|20)\\d{2}-${MONTH}-${DAY}|(?:19|20)\\d{2}/${MONTH}/${DAY}|${DAY}/${DAY}/(?:(?:19|20)\\d{2}|\\d{2}))`;
const DATE_RANGE = new RegExp(
  `^(?:(?<d1>${FULL_DATE})\\s*[-/]\\s*(?<d2>${FULL_DATE})|(?<y1>(?:19|20)\\d{2})\\s*/\\s*(?<y2>(?:19|20)\\d{2}))$`
);
const YEAR_IN = /(?:19|20)\d{2}|(?<=\/)\d{2}$/u;

function isDateRange(dashed: string): boolean {
  const g = DATE_RANGE.exec(dashed)?.groups;
  if (!g) return false;
  const year = (part: string | undefined): number => {
    const y = YEAR_IN.exec(part ?? '')?.[0] ?? '';
    return y.length === 2 ? 2000 + Number(y) : Number(y);
  };
  const from = year(g.d1 ?? g.y1);
  const to = year(g.d2 ?? g.y2);
  return to >= from && to - from <= 5;
}

/**
 * Starts only where a run of non-space starts (or right after an "@"): one
 * attempt per run keeps it linear, and the leftmost match is the same.
 */
const EMAIL_LIKE =
  /(?<![^\s@\uFF20\uFE6B])[^\s@\uFF20\uFE6B]+[@\uFF20\uFE6B][^\s@\uFF20\uFE6B]+[.\uFF0E\u3002\uFF61][^\s@\uFF20\uFE6B]+/gu;
/** "jane @ gmail.com": an "@" and a domain are never prose, spaced or not; "meet @ 5.30" has no domain. */
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
 * "jane at gmail.com". After a said "dot" the ending is any 2-6 letter word but a
 * few only prose puts there; after a written dot it is a listed one. Which form
 * matched is in the groups, for blankSaidEmail to judge.
 */
const LABEL = "[\\p{L}\\p{N}][\\p{L}\\p{N}_%+\\-'’]*";
const SAID_DOT = '(?:\\s+dot\\s+|\\s*[([]dot[)\\]]\\s*)';
const ANY_DOT = `(?:${SAID_DOT}|\\.)`;
const TLD =
  '(?:com|org|net|edu|gov|io|co|us|uk|ca|au|nz|ie|de|fr|es|nl|se|ch|jp|me|ai|app|dev|info|biz|tv|xyz|fm|ly|gg|online|tech)';
const SAID_TLD =
  '(?!(?:the|and|but|then|than|for|with|from|was|were|of|or|on|he|she|we|they|you|his|her|our|your|their|here|there|when|where|what|party|launch|office|map|page|line|time|day|days|night|period|dance|dress|dot|dots|zero|one|two|three|four|five|six|seven|eight|nine|oh)(?![\\p{L}\\p{N}]))\\p{L}{2,6}';
const NOT_A_DOMAIN = '(?!(?:the|a|an|this|that|my|your|our|his|her|their|its)\\b)';
const ENDING = `(?:${SAID_DOT}(?:${TLD}|${SAID_TLD})|\\.${TLD})`;
const SPELLED_EMAIL = new RegExp(
  `(?<![\\p{L}\\p{N}._%+\\-'’])(?<local>${LABEL}(?:${ANY_DOT}${LABEL}){0,6})` +
    `(?:\\s*[([]at[)\\]]\\s*${NOT_A_DOMAIN}(?<bracketed>(?:${LABEL}${ANY_DOT}){1,6}(?:${TLD}|${SAID_TLD}))` +
    `|\\s+at\\s+${NOT_A_DOMAIN}(?<said>(?:${LABEL}${ANY_DOT}){0,6}${LABEL}${SAID_DOT}(?:${TLD}|${SAID_TLD}))` +
    `|\\s+at\\s+${NOT_A_DOMAIN}(?<written>${LABEL}(?:\\.${LABEL}){0,5}\\.${TLD}))` +
    '(?![\\p{L}\\p{N}])',
  'giu'
);
/** What a blanked address was really the name of: "sales dot team" + " at acme dot com". */
const AT_MORE = new RegExp(
  `\\s+at\\s+${NOT_A_DOMAIN}(?:${LABEL}${ANY_DOT}){0,6}${LABEL}${ENDING}(?![\\p{L}\\p{N}])`,
  'iuy'
);

const LISTED_TLD = new RegExp(`${TLD}$`, 'iu');
/** "grandma dot dot dot later": a said "dot dot" with an unlisted ending is a pause, not a domain. */
const DOT_DOT = /\bdot\s+dot\b/iu;

const words = (list: string): Set<string> => new Set(list.trim().split(/\s+/u));
/** "he's", "mom's": a name with 's is a sentence, not an address. */
const CONTRACTION = /['’](?:s|m|re)$/u;
/** A pronoun or a little word is no one's address: "email her at ...", "or at acme dot com". */
const NOT_A_NAME = words(`
  i he she we they it them him her you and or but with to for from of on by as so
  the a an this that these those my your his our their its`);
/** A word that says where someone is, not who: "lunch at", "works at", "interns at". */
const PLACE_WORD = words(`
  look looking looked meet meeting met see seen be is am are was were been stay staying
  work works working worked live lives living shop shopping arrive arriving arrived
  stop stopping eat eating sign signed order ordered buy bought find found check go
  went get got here there out up in home sale lunch dinner breakfast brunch coffee tea
  drinks party interview event launch class demo meetup interns intern students
  student staff employees engineers people folks friends kids`);
/** A word before a one-word name that makes it a thing in a place: "bought shoes at ...", "met Sarah at ...". */
const PLACE_BEFORE = words(`
  bought buy booked book found find ordered order got grabbed shopped sold paid
  met meet meeting saw see seeing seen visit visited visiting
  the a an this that these those my your his our their its`);
/** A word before the name that sends something to it: "email kofi at acme.com". */
const CONTACT_VERB = words(`
  email emailed e-mail mail mailed write wrote message messaged text texted cc bcc
  reach contact ping send sent forward forwarded dm reply`);
/** Where people keep a mail account: "jane at gmail.com" is an address. */
const MAIL_HOSTS = words(`
  gmail googlemail yahoo ymail rocketmail hotmail outlook live msn icloud me mac aol
  proton protonmail pm fastmail hey gmx zoho yandex mail tutanota tuta comcast verizon att sbcglobal`);
const FIRST_LABEL = /^[\p{L}\p{N}_%+'’-]+/u;
const ONE_WORD = /^[\p{L}'’-]+$/u;
const WORDS_BEFORE =
  /([\p{L}'’-]+)\s+(?:([\p{L}'’-]+)\s+)?(?:([\p{L}'’-]+)\s+)?(?:([\p{L}'’-]+)\s+)?$/u;
const AT_TOKEN = /^\s*(?:[([]at[)\]]|at)\s*/iu;

/** The up to four words before `offset`, nearest first, lowercased. */
function wordsBefore(offset: number, whole: string): string[] {
  const m = WORDS_BEFORE.exec(whole.slice(Math.max(0, offset - 64), offset));
  return m
    ? m
        .slice(1)
        .filter(Boolean)
        .map((w) => w.toLowerCase())
        .reverse()
    : [];
}

/** "email kofi at ...", "send the deck to kofi at ...". */
function sentTo(before: readonly string[]): boolean {
  const [near = ''] = before;
  return (
    CONTACT_VERB.has(near) || (near === 'to' && before.slice(1).some((w) => CONTACT_VERB.has(w)))
  );
}

/**
 * null keeps the match as prose. Only a one-word name can be a word in a
 * sentence; a dotted or many-part one ("jo dot kim", "jo.kim") is an address.
 */
function blankSaidEmail(m: RegExpExecArray, whole: string): string | null {
  const g = m.groups ?? {};
  const local = g.local ?? '';
  if (g.bracketed !== undefined || !ONE_WORD.test(local)) return 'an email address';
  const name = local.toLowerCase();
  if (NOT_A_NAME.has(name)) return null;
  return inSentence(g, name, wordsBefore(m.index, whole)) ? null : 'an email address';
}

/** A one-word name in a sentence: a said pause, a place word, or a word before it saying so. */
function inSentence(g: Record<string, string>, name: string, before: readonly string[]): boolean {
  if (g.said !== undefined && DOT_DOT.test(g.said) && !LISTED_TLD.test(g.said)) return true;
  if (sentTo(before)) return false;
  // A written dot after "at" is a shop or a workplace only with a word saying so
  // ("bought shoes at zappos.com"), and never at a mail host.
  const host = FIRST_LABEL.exec(g.written ?? '')?.[0]?.toLowerCase() ?? '';
  if (g.written !== undefined && MAIL_HOSTS.has(host)) return false;
  return PLACE_WORD.has(name) || CONTRACTION.test(name) || PLACE_BEFORE.has(before[0] ?? '');
}

/**
 * Blanks each said address blankSaidEmail doesn't keep. A kept match hides
 * nothing: the search goes on from just after its "at", so in "email her at jo
 * dot me at gmail dot com" the kept "her at jo dot me" doesn't hide "jo dot me
 * at gmail dot com". A blanked one takes any " at <domain>" right after it, so
 * no part of a longer address is left showing.
 */
function blankSaidEmails(text: string): string {
  let out = '';
  let last = 0;
  SPELLED_EMAIL.lastIndex = 0;
  for (let m = SPELLED_EMAIL.exec(text); m; m = SPELLED_EMAIL.exec(text)) {
    const local = m.groups?.local ?? '';
    if (blankSaidEmail(m, text) === null) {
      const at = AT_TOKEN.exec(m[0].slice(local.length))?.[0].length ?? 1;
      SPELLED_EMAIL.lastIndex = m.index + local.length + at;
      continue;
    }
    let end = m.index + m[0].length;
    for (AT_MORE.lastIndex = end; AT_MORE.test(text); AT_MORE.lastIndex = end)
      end = AT_MORE.lastIndex;
    out += `${text.slice(last, m.index)}an email address`;
    last = end;
    SPELLED_EMAIL.lastIndex = end;
  }
  return out + text.slice(last);
}

const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

function blankPhone(m: string, core: string, ext: string, offset: number, whole: string): string {
  // A run that stays is handed back with what came after it checked on its own,
  // so a number written straight after a date ("...x415 555 0132") still goes.
  const kept = (): string => core + ext.replace(PHONE_LIKE, blankPhone);
  const unbracketed = core.replace(LEADING_OPEN, '');
  const dashed = unbracketed.replace(ANY_DASH, '-');
  if (DATE_ONLY.test(dashed) || DATE_SLASHED.test(unbracketed) || isDateRange(dashed))
    return kept();
  if (DATE_HOUR.test(dashed) && !ext && whole[offset + m.length] === ':') return m;
  // Any other run of 7+ digits goes, however long: two numbers side by side, or
  // a number next to a date, are blanked whole rather than shown.
  if (core.replace(/\P{Nd}/gu, '').length < 7) return kept();
  // "(415 555 0132)": the opening bracket belongs to the sentence, not the number.
  const keepOpen = LEADING_OPEN.test(core) && count(core, OPEN) > count(core, CLOSE);
  return keepOpen ? `${core[0]}a number` : 'a number';
}

/** "one, two, three" or "three, two, one": counting up from one, or down to one. */
function isCount(values: readonly number[]): boolean {
  const [first = 0, second = 0] = values;
  const step = second - first;
  const steady = values.every((v, i) => i === 0 || v - (values[i - 1] ?? v) === step);
  const fromOne = (step === 1 && first === 1) || (step === -1 && values.at(-1) === 1);
  return steady && fromOne;
}

function blankSpelled(m: string): string {
  const tokens = m.split(SPELLED_SPLIT).filter(Boolean);
  const said = tokens.flatMap((t) => DIGIT_VALUE.get(t.toLowerCase()) ?? []);
  if (said.length < 3) return m;
  // A year in a count isn't part of a number ("steps one, two, three, 2026"), but
  // "four five six 2026" is one, and so are seven said digits, counting or not.
  const counting = isCount(said);
  const digits = tokens.reduce(
    (n, t) => n + (DIGIT_VALUE.has(t.toLowerCase()) ? 1 : counting && YEAR.test(t) ? 0 : t.length),
    0
  );
  return digits >= 7 ? 'a number' : m;
}

/**
 * Phone-shaped runs are matched over the whole text first, and one is kept only
 * when all of it is a date, a two-date range or a date-time, so a date-shaped
 * run inside a longer number can never split that number and leave part of it
 * showing. Every pattern tries at most once per word (or run of non-space) and
 * repeats a bounded number of times, so a long text costs linear time.
 */
export function withoutContactDetails(text: string): string {
  return (
    blankSaidEmails(
      text.replace(EMAIL_LIKE, 'an email address').replace(SPACED_EMAIL, 'an email address')
    )
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
