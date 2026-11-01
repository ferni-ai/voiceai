/**
 * The words of Alex's morning brief: today's calendar, reminders due today and
 * what is still open, in one short text from a friend who keeps track.
 *
 * Pure, so the voice rules are tested here: no em dashes, no ellipses, no
 * emoji, under MAX_CHARS. Long lists end "and 2 more" rather than being cut
 * mid-word. Nothing at all today gives null, and no text goes.
 *
 * @module services/outreach/morning-brief/compose
 */

export const MAX_CHARS = 320;
/** How many of each list to try before shortening to fit. */
const FIRST_TRY = { today: 4, due: 3, open: 3 } as const;
const ITEM_CHARS = 40;

export interface BriefEvent {
  readonly title: string;
  readonly start: Date;
  readonly allDay: boolean;
  /** An invite from someone else not yet accepted: shown by time only, never by title. */
  readonly invite?: boolean;
}

export interface MorningBriefInput {
  /** The zone their day is read in; event times are shown in it. */
  readonly timeZone: string;
  readonly name?: string;
  readonly events: readonly BriefEvent[];
  /** Reminders due today, soonest first. */
  readonly reminders: readonly string[];
  readonly tasks: readonly string[];
  readonly commitments: readonly string[];
}

/** "I'm going to send Mindy the photos" reads as "send Mindy the photos". */
const FIRST_PERSON =
  /^(?:i(?:'m| am) (?:going to|gonna)|i(?:'ll| will)|i (?:need|have|want|promise) to|i should)\s+/i;

// Contact details never go out in a brief: a title or task holding a link, a domain,
// an email or a phone number could make a Ferni text carry someone else's phishing.
// NFKC folds full-width letters and dots first; each pattern is linear (no nested
// quantifiers) and runs on at most 200 chars, again after the length cut.
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/giu;
const EMAIL_LIKE = /\S+@\S+/gu;
const DOMAIN_LIKE = /[\p{L}\p{N}-]+[.。｡][\p{L}]{2,}\S*/gu;
// Any script's digits (NFKC leaves Arabic-Indic ones alone) and any dash, slash,
// underscore or backslash: cleanItem turns dashes into ", " after this runs, so
// "415–555–0132" has to go here or it reaches the brief as "415, 555, 0132".
const PHONE_LIKE = /\+?\p{Nd}[\p{Nd}\s()._/\\\-\u2010-\u2015\u2212\uFE58\uFE63]{6,}\p{Nd}/gu;

// Invisible and pictographic characters go first: removed after the scrub, they
// could join "evil.🙂com" back into a link.
const INVISIBLE = /[\p{Extended_Pictographic}\p{Cf}\u{FE00}-\u{FE0F}\u{20E3}]/gu;

function withoutContacts(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .slice(0, 200)
    .replace(URL_LIKE, ' ')
    .replace(EMAIL_LIKE, ' ')
    .replace(DOMAIN_LIKE, ' ')
    .replace(PHONE_LIKE, ' ');
}

/** One item, safe for the brief: no dashes, ellipses, emoji or contact details, at most ITEM_CHARS. */
export function cleanItem(raw: string): string {
  const s = withoutContacts(raw)
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/…|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(FIRST_PERSON, '')
    .replace(/[\s,;:.!?]+$/, '');
  if (s.length <= ITEM_CHARS) return withoutContacts(s).trim();
  const cut = s.slice(0, ITEM_CHARS + 1);
  const space = cut.lastIndexOf(' ');
  return withoutContacts(space > 10 ? cut.slice(0, space) : cut.slice(0, ITEM_CHARS))
    .trim()
    .replace(/[\s,;:]+$/, '');
}

/** "10am", "2:30pm" in the zone. */
function clock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const minute = get('minute');
  return `${get('hour')}${minute === '00' ? '' : `:${minute}`}${get('dayPeriod').toLowerCase()}`;
}

/**
 * The brief as an ordered list of segments: 'clock' is only an event time the brief wrote
 * itself; everything else, titles and stored items included, is 'text'. The brief sent and
 * the brief screened are two joins of the same segments (brief-job.ts briefToSend), so they
 * can differ only in those clock values.
 */
export interface BriefSegment {
  kind: 'clock' | 'text';
  value: string;
}

/** The segments joined; with `clockAs`, every clock segment reads as that instead. */
export function joinSegments(segments: readonly BriefSegment[], clockAs?: string): string {
  return segments.map((s) => (s.kind === 'clock' && clockAs !== undefined ? clockAs : s.value)).join(''); // prettier-ignore
}

const text = (value: string): BriefSegment => ({ kind: 'text', value });

/** One entry in a list: who it is (time-independent, for dedup) and how it reads. */
interface Item {
  key: string;
  segments: BriefSegment[];
}

/** "a, b and 2 more", or "a, b and c" when all fit. */
function joinList(items: readonly Item[], shown: number): BriefSegment[] {
  const head = items.slice(0, shown).map((i) => i.segments);
  const hidden = items.length - head.length;
  const out: BriefSegment[] = [];
  head.forEach((segments, k) => {
    if (k > 0) out.push(text(hidden === 0 && k === head.length - 1 ? ' and ' : ', '));
    out.push(...segments);
  });
  if (hidden > 0) out.push(text(` and ${hidden} more`));
  return out;
}

/** First of each key, in order; an entry with no words is dropped. */
const unique = (items: readonly Item[]): Item[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!joinSegments(i.segments) || seen.has(i.key)) return false;
    seen.add(i.key);
    return true;
  });
};

const textItem = (raw: string): Item => {
  const value = cleanItem(raw);
  return { key: value.toLowerCase(), segments: [text(value)] };
};

/** The brief's text, or null when there is nothing on today. */
export function composeMorningBrief(input: MorningBriefInput): string | null {
  const segments = composeMorningBriefSegments(input);
  return segments && joinSegments(segments);
}

/**
 * The brief as segments, or null when there is nothing on today. Dedup and shortening run
 * on the segments, keyed by what each entry is (an event's title and start, an item's
 * words), before anything is joined.
 */
export function composeMorningBriefSegments(input: MorningBriefInput): BriefSegment[] | null {
  const events = [...input.events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const eventItem = (e: (typeof events)[number]): Item => {
    const when = e.allDay ? 'all-day' : String(e.start.getTime());
    const at: BriefSegment = { kind: 'clock', value: clock(e.start, input.timeZone) };
    if (e.invite) {
      return { key: `invite|${when}`, segments: e.allDay ? [text('an invite')] : [text('an invite at '), at] }; // prettier-ignore
    }
    const title = cleanItem(e.title);
    const segments = !title ? [] : e.allDay ? [text(title)] : [at, text(` ${title}`)];
    return { key: `${title.toLowerCase()}|${when}`, segments };
  };
  const lists = {
    today: unique(events.map(eventItem)),
    due: unique(input.reminders.map(textItem)),
    open: unique([...input.tasks, ...input.commitments].map(textItem)),
  };
  if (!lists.today.length && !lists.due.length && !lists.open.length) return null;

  const hello = input.name ? `Morning ${input.name}, it's Alex.` : "Morning, it's Alex.";
  const close = lists.today.length
    ? 'Call me if you want to move anything.'
    : 'Call me if you want a hand with any of it.';
  const shown = {
    today: Math.min(lists.today.length, FIRST_TRY.today),
    due: Math.min(lists.due.length, FIRST_TRY.due),
    open: Math.min(lists.open.length, FIRST_TRY.open),
  };
  const section = (label: string, items: Item[], n: number): BriefSegment[] =>
    items.length ? [text(`${label}: `), ...joinList(items, n), text('.')] : [];
  const render = (): BriefSegment[] =>
    [
      [text(hello)],
      section('Today', lists.today, shown.today),
      section('Due', lists.due, shown.due),
      section('Still open', lists.open, shown.open),
      [text(close)],
    ]
      .filter((part) => part.length > 0)
      .flatMap((part, k) => (k === 0 ? part : [text(' '), ...part]));

  let segments = render();
  while (joinSegments(segments).length > MAX_CHARS) {
    const longest = (Object.keys(shown) as Array<keyof typeof shown>)
      .filter((k) => shown[k] > 1)
      .sort((a, b) => shown[b] - shown[a])[0];
    if (!longest) break;
    shown[longest]--;
    segments = render();
  }
  return segments;
}
