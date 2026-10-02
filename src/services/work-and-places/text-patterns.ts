/**
 * Shared text helpers for work & places capture: sentence splitting, proper
 * names, third-person summaries, and spoken dates ("next Friday", "in March").
 *
 * The parsers are deliberately conservative: a proper name must be
 * capitalised, and generic words ("Home", "Monday") are never places or
 * employers. Missing something is fine (extraction facts cover it); storing
 * nonsense about someone's life is not.
 *
 * @module services/work-and-places/text-patterns
 */

import { parseSpokenDate } from '../important-dates/index.js';

/** Up to four capitalised words ("New York", "Acme Labs", "Café Lola"), optional "the". */
export const NAME = String.raw`((?:[A-Z][\p{L}&'’.-]*)(?:\s+(?:de|del|la|of|on|&)?\s*[A-Z][\p{L}&'’.-]*){0,3})`;
/** NAME, optionally followed by ", Region" ("Park Slope, Brooklyn"). */
export const PLACE = String.raw`(?:the\s+)?${NAME}(?:,\s+${NAME})?`;

const STOP_NAMES = new Set(
  [
    'i',
    'im',
    'the',
    'a',
    'my',
    'home',
    'work',
    'school',
    'church',
    'bed',
    'town',
    'today',
    'tomorrow',
    'tonight',
    'yesterday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
    'christmas',
    'thanksgiving',
    'easter',
    'ferni',
    'maya',
    'jordan',
    'alex',
    'peter',
    'nayan',
  ].map((w) => w.toLowerCase())
);

/** A captured proper name, cleaned; '' when it's a generic word. */
export function cleanName(raw: string | undefined): string {
  if (!raw) return '';
  const name = raw
    .replace(/[’']s$/, '')
    .replace(/[.,!?;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || STOP_NAMES.has(name.toLowerCase())) return '';
  const first = name.split(' ')[0].toLowerCase();
  if (STOP_NAMES.has(first) && name.split(' ').length === 1) return '';
  return name;
}

/** "Park Slope" + "Brooklyn" → "Park Slope, Brooklyn". */
export function joinPlace(a: string | undefined, b: string | undefined): string {
  const first = cleanName(a);
  const second = cleanName(b);
  if (!first) return '';
  return second ? `${first}, ${second}` : first;
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3 && s.length < 400);
}

/**
 * Turn a third-person summary into first person so the same parsers read it:
 * "The user works at Acme and their trip to Lisbon..." → "I works at Acme and my trip to Lisbon...".
 * (Parsers accept both "work" and "works".)
 */
export function firstPerson(summary: string): string {
  return summary
    .replace(/\b(?:[Tt]he user|[Tt]he caller|[Uu]ser)['’]s\b/g, 'my')
    .replace(/\b(?:[Tt]he user|[Tt]he caller|[Uu]ser)\b/g, 'I')
    .replace(/\b(?:[Tt]heir|[Hh]is|[Hh]er)\b/g, 'my')
    .replace(/\b(?:[Tt]hey|[Hh]e|[Ss]he)\b/g, 'I')
    .replace(/\bI (?:is|are)\b/g, "I'm")
    .replace(/\bI has\b/g, "I've");
}

/** Subject at the start of a first-person clause. */
export const SUBJ = String.raw`\b(?:I|[Ww]e)`;
/** "I'm", "I am", "we're", "I is" (after firstPerson). */
export const BE = String.raw`(?:['’]m|['’]re|\s+am|\s+are|\s+is)`;

export const ADDITIONAL_RE =
  /\b(also|as well|on the side|side (?:job|gig|hustle)|second job|part[- ]time|weekends?)\b/i;
export const NEGATION_RE =
  /\b(not|never|don['’]t|doesn['’]t|didn['’]t|no longer|won['’]t|isn['’]t)\b/i;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function monthString(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function dayString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * A date from a spoken phrase, as `YYYY-MM-DD` (a specific day) or `YYYY-MM`
 * (a month: "next month", "in March"). `direction` says whether the thing is
 * ahead (planned) or behind (done), which decides the year when none is said.
 */
export function dateFromPhrase(
  phrase: string,
  now: Date,
  direction: 'future' | 'past'
): string | undefined {
  const text = phrase.toLowerCase();
  const today = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  const y = today.year;
  const m0 = today.month - 1;
  if (/\bnext month\b/.test(text)) return monthString(y, m0 + 1);
  if (/\blast month\b/.test(text)) return monthString(y, m0 - 1);
  if (/\bthis month\b/.test(text)) return monthString(y, m0);
  if (/\bnext week(?:end)?\b/.test(text)) return dayString(new Date(now.getTime() + 7 * 864e5));
  if (/\blast week(?:end)?\b/.test(text)) {
    const d = new Date(now.getTime() - 7 * 864e5);
    return monthString(d.getUTCFullYear(), d.getUTCMonth());
  }

  // Weekdays / "tomorrow" / "in 3 days" only make sense ahead of us.
  const parsed = parseSpokenDate(text, today);
  if (parsed && (direction === 'future' || !parsed.relative)) {
    const { parts } = parsed;
    if (parsed.relative || parts.year !== undefined) {
      return `${parts.year ?? y}-${pad(parts.month)}-${pad(parts.day)}`;
    }
    const thisYear = `${y}-${pad(parts.month)}-${pad(parts.day)}`;
    const todayStr = dayString(now);
    if (direction === 'future')
      return thisYear >= todayStr ? thisYear : `${y + 1}${thisYear.slice(4)}`;
    return thisYear <= todayStr ? thisYear : `${y - 1}${thisYear.slice(4)}`;
  }

  const month =
    /\b(?:in|this|next|last|since|from|until)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/.exec(
      text
    );
  if (month) {
    const idx = MONTHS.indexOf(month[1]);
    if (month[2]) return monthString(Number(month[2]), idx);
    if (direction === 'future') return monthString(idx >= m0 ? y : y + 1, idx);
    return monthString(idx <= m0 ? y : y - 1, idx);
  }
  const year = /\b(?:in|since|from|until)\s+((?:19|20)\d{2})\b/.exec(text);
  if (year) return `${year[1]}-01`;
  return undefined;
}

/** "this month" as YYYY-MM. */
export function thisMonth(now: Date): string {
  return monthString(now.getUTCFullYear(), now.getUTCMonth());
}

/** First letter upper-case ("got promoted" → "Got promoted"). */
export function sentenceCase(text: string): string {
  const t = text.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** "with Sam", "with my sister" → ["Sam"], ["my sister"]. */
export function companionsIn(text: string): string[] {
  const out: string[] = [];
  const re =
    /\bwith\s+(my\s+(?:wife|husband|partner|girlfriend|boyfriend|fianc[ée]e?|family|kids|mom|dad|parents|sister|brother|friends?|best friend|team|son|daughter)|[A-Z][a-z]+(?:\s+and\s+[A-Z][a-z]+)?)\b/g;
  for (const m of text.matchAll(re)) {
    for (const part of m[1].split(/\s+and\s+/)) {
      const name = part.startsWith('my ') ? part : cleanName(part);
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out.slice(0, 4);
}
