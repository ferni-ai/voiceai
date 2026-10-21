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
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/gu;

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

/** "a, b and 2 more", or "a, b and c" when all fit. */
function joinList(items: readonly string[], shown: number): string {
  const head = items.slice(0, shown);
  const hidden = items.length - head.length;
  if (hidden > 0) return `${head.join(', ')} and ${hidden} more`;
  if (head.length < 2) return head.join('');
  return `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`;
}

const unique = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.toLowerCase();
    if (!i || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** The brief's text, or null when there is nothing on today. */
export function composeMorningBrief(input: MorningBriefInput): string | null {
  const events = [...input.events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const lists = {
    today: unique(
      events.map((e) => {
        if (e.invite)
          return e.allDay ? 'an invite' : `an invite at ${clock(e.start, input.timeZone)}`;
        const title = cleanItem(e.title);
        return e.allDay || !title ? title : `${clock(e.start, input.timeZone)} ${title}`;
      })
    ),
    due: unique(input.reminders.map(cleanItem)),
    open: unique([...input.tasks, ...input.commitments].map(cleanItem)),
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
  const render = (): string =>
    [
      hello,
      lists.today.length ? `Today: ${joinList(lists.today, shown.today)}.` : '',
      lists.due.length ? `Due: ${joinList(lists.due, shown.due)}.` : '',
      lists.open.length ? `Still open: ${joinList(lists.open, shown.open)}.` : '',
      close,
    ]
      .filter(Boolean)
      .join(' ');

  let text = render();
  while (text.length > MAX_CHARS) {
    const longest = (Object.keys(shown) as Array<keyof typeof shown>)
      .filter((k) => shown[k] > 1)
      .sort((a, b) => shown[b] - shown[a])[0];
    if (!longest) break;
    shown[longest]--;
    text = render();
  }
  return text;
}
