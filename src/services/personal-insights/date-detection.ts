/**
 * Important-date detection from extracted facts: birthdays, anniversaries,
 * surgeries, interviews, deadlines. Explicit dates ("March 3", "3/14",
 * "2026-10-09") and simple relative ones ("tomorrow", "next Tuesday", "in two
 * weeks", anchored to when the fact was learned).
 *
 * @module services/personal-insights/date-detection
 */

import { DAY_MS, isSelf, stableId } from './text-utils.js';
import type { DetectedDate, ImportantDateKind, SourceFact } from './types.js';

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
const MONTH_RE =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

const EVENT_WORDS = [
  'surgery',
  'operation',
  'procedure',
  'appointment',
  'checkup',
  'scan',
  'biopsy',
  'wedding',
  'interview',
  'exam',
  'test',
  'graduation',
  'recital',
  'move',
  'moving',
  'trip',
  'flight',
  'vacation',
  'launch',
  'presentation',
  'review',
  'party',
  'race',
  'marathon',
  'game',
  'concert',
  'due date',
  'funeral',
  'visit',
  'reunion',
  'first day',
];

export interface ParsedDate {
  readonly month: number; // 1-12
  readonly day: number;
  readonly year?: number;
  readonly relative: boolean;
}

function monthIndex(token: string): number {
  const t = token.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(t)) + 1;
}

function fromEpoch(ms: number): ParsedDate {
  const d = new Date(ms);
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    year: d.getUTCFullYear(),
    relative: true,
  };
}

/** First date expression in `text`, anchored to `anchorMs` for relative ones. */
export function parseDate(text: string, anchorMs: number): ParsedDate | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), relative: false };

  m = t.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (m)
    return valid({
      month: monthIndex(m[1]),
      day: Number(m[2]),
      year: m[3] ? Number(m[3]) : undefined,
      relative: false,
    });

  m = t.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`)
  );
  if (m)
    return valid({
      month: monthIndex(m[2]),
      day: Number(m[1]),
      year: m[3] ? Number(m[3]) : undefined,
      relative: false,
    });

  m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined;
    return valid({ month: Number(m[1]), day: Number(m[2]), year: y, relative: false });
  }

  if (/\btoday\b|\btonight\b/.test(t)) return fromEpoch(anchorMs);
  if (/\btomorrow\b/.test(t)) return fromEpoch(anchorMs + DAY_MS);
  if (/\bnext week\b/.test(t)) return fromEpoch(anchorMs + 7 * DAY_MS);
  if (/\bthis weekend\b|\bthe weekend\b/.test(t)) {
    const dow = new Date(anchorMs).getUTCDay();
    return fromEpoch(anchorMs + ((6 - dow + 7) % 7 || 7) * DAY_MS);
  }
  m = t.match(/\bin (\d+|a|an|one|two|three|four|five|six) (day|week)s?\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (NUMBER_WORDS[m[1]] ?? 1);
    return fromEpoch(anchorMs + n * (m[2] === 'week' ? 7 : 1) * DAY_MS);
  }
  m = t.match(
    /\b(?:next|this|on|every) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)s?\b/
  );
  if (m) {
    const target = WEEKDAYS.indexOf(m[1]);
    const dow = new Date(anchorMs).getUTCDay();
    return fromEpoch(anchorMs + ((target - dow + 7) % 7 || 7) * DAY_MS);
  }
  return null;
}

function valid(p: ParsedDate): ParsedDate | null {
  if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return null;
  return p;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Year of the next occurrence of month/day on or after (anchor - 7 days). */
function inferYear(p: ParsedDate, anchorMs: number): number {
  const anchor = new Date(anchorMs - 7 * DAY_MS);
  const y = anchor.getUTCFullYear();
  const candidate = Date.UTC(y, p.month - 1, p.day);
  return candidate >= Date.UTC(y, anchor.getUTCMonth(), anchor.getUTCDate()) ? y : y + 1;
}

function kindAndWord(fact: SourceFact): { kind: ImportantDateKind; word: string } | null {
  const hay = `${fact.predicate} ${fact.value} ${fact.text}`.toLowerCase().replace(/_/g, ' ');
  if (/\b(birthday|bday|b-day|born)\b/.test(hay)) return { kind: 'birthday', word: 'birthday' };
  if (/\banniversary\b/.test(hay)) return { kind: 'anniversary', word: 'anniversary' };
  if (/\b(gotcha day|adoption day|adopted)\b/.test(hay))
    return { kind: 'anniversary', word: 'gotcha day' };
  if (/\b(deadline|due by|due on|is due)\b/.test(hay))
    return { kind: 'deadline', word: 'deadline' };
  if (/\bdate night\b/.test(hay)) return { kind: 'event', word: 'date night' };
  const word = EVENT_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(hay));
  return word ? { kind: 'event', word } : null;
}

export interface DateOwner {
  readonly personId?: string;
  /** Display name used in titles ("Mom", "Linda"). */
  readonly name?: string;
}

/** Important dates a fact states, or [] when it states none. */
export function detectDatesInFact(
  fact: SourceFact,
  owner: DateOwner = {},
  nowMs?: number
): DetectedDate[] {
  const kw = kindAndWord(fact);
  if (!kw) return [];
  const hay = `${fact.value} ${fact.text}`;
  // A weekly ritual ("date night every Friday") is anchored to today: its next occurrence.
  const weekly = /\bevery (sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.test(hay);
  const parsed = parseDate(hay, weekly && nowMs ? Math.max(nowMs - DAY_MS, fact.at) : fact.at);
  if (!parsed) return [];

  const recurring = kw.kind === 'birthday' || kw.kind === 'anniversary';
  const self = isSelf(fact.subject) && !owner.personId;
  const ownerName = self ? 'Your' : owner.name ? `${owner.name}'s` : '';
  const word = kw.word;
  const withOwner = (label: string) =>
    self || !owner.name ? label : `${label} with ${owner.name}`;
  const title =
    kw.kind === 'anniversary' && word === 'anniversary'
      ? withOwner(self || !owner.name ? 'Your anniversary' : 'Anniversary')
      : word === 'date night'
        ? withOwner('Date night')
        : ownerName
          ? `${ownerName} ${word}`
          : word.charAt(0).toUpperCase() + word.slice(1);
  const date = recurring
    ? `--${pad(parsed.month)}-${pad(parsed.day)}`
    : `${parsed.year ?? inferYear(parsed, fact.at)}-${pad(parsed.month)}-${pad(parsed.day)}`;
  const ownerKey = owner.personId ?? (self ? 'self' : fact.subject.toLowerCase());
  const key = recurring ? `${ownerKey}|${kw.kind}` : `${ownerKey}|${word}|${date}`;

  return [
    {
      key: stableId('date', key),
      title,
      date,
      recurring,
      kind: kw.kind,
      personId: owner.personId,
      confidence: Math.max(0, Math.min(1, fact.confidence * (parsed.relative ? 0.6 : 1))),
      sourceConversationIds: [...fact.conversationIds],
    },
  ];
}

/** Days from `nowMs` to the next occurrence of a detected date; null if it is past. */
export function daysUntil(date: string, nowMs: number): number | null {
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const recurring = date.match(/^--(\d{2})-(\d{2})$/);
  if (recurring) {
    const [mm, dd] = [Number(recurring[1]), Number(recurring[2])];
    let next = Date.UTC(now.getUTCFullYear(), mm - 1, dd);
    if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, mm - 1, dd);
    return Math.round((next - today) / DAY_MS);
  }
  const once = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!once) return null;
  const at = Date.UTC(Number(once[1]), Number(once[2]) - 1, Number(once[3]));
  return at < today ? null : Math.round((at - today) / DAY_MS);
}
