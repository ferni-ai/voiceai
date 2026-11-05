/**
 * With OWNER_OUTREACH_STORED_TEXT_SCREEN off, the brief is composed exactly as on main.
 * composeMorningBrief now builds segments (so the screen can read the same brief it
 * sends); joined, they must give main's text byte for byte, dedup included: main keeps
 * the first entry of each line as it reads, case aside.
 *
 * The seeded days are the independent verifier's (PR 3329): duplicate and
 * case-varied titles, events a few seconds apart in the same displayed minute,
 * invites, all-day events, empty titles. The hashes are of main's output for the
 * same days (main ac34e858c). Fictional data only.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { composeMorningBrief, type MorningBriefInput } from '../compose.js';

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = [
  'Lunch', 'lunch', 'LUNCH', 'Standup', '1:1 with Raj', 'Dentist', '', '   ', 'Book club',
  'an invite', 'Call Dana at 555-0142', 'see www.example.com/x', 'mail me a@example.com',
  "I'm going to send Mindy the photos", 'Pick up kids — school', 'Team sync... maybe',
  'A very long meeting title that keeps going and going well past the item limit for sure yes',
  'Gym', 'Flight UA123', 'Pay $50 to Sam', 'Mom’s b-day',
]; // prettier-ignore
const ITEMS = [
  'call mom at 5', 'Call mom at 5', 'pick up the prescription', 'water the plants',
  'I will stretch every morning', 'renew the library card', '',
  'call 212 555 0198 about your bank', 'send the deck — today', 'Buy milk...',
  'I need to book flights', 'Pay rent $1200', 'email sam@example.com',
  'check https://example.com/pay', 'finish the 10-page report', 'Text Raj when you land',
  'a very long reminder about something that runs on and on past the item character limit for the brief',
]; // prettier-ignore

type Event = MorningBriefInput['events'][number];

function days(seed: number, n: number, subMinute: boolean): MorningBriefInput[] {
  const r = rng(seed);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const out: MorningBriefInput[] = [];
  for (let k = 0; k < n; k++) {
    const events: Event[] = [];
    const count = Math.floor(r() * 8);
    for (let i = 0; i < count; i++) {
      const prev = events[events.length - 1];
      const hour = 12 + Math.floor(r() * 12); // draw order matters: hour, then minute
      const minute = [0, 15, 30, 45][Math.floor(r() * 4)];
      let start = new Date(Date.UTC(2026, 9, 19, hour, minute));
      if (prev && r() < 0.3) {
        const seconds = subMinute && r() < 0.5 ? 1000 * (1 + Math.floor(r() * 50)) : 0;
        start = new Date(prev.start.getTime() + seconds);
      }
      const title = prev && r() < 0.3 ? pick([prev.title, prev.title.toLowerCase()]) : pick(TITLES);
      const allDay = r() < 0.15; // then whether it is an invite
      const e: Event =
        r() < 0.15 ? { title, start, allDay, invite: true } : { title, start, allDay };
      events.push(e);
    }
    const list = (): string[] => Array.from({ length: Math.floor(r() * 6) }, () => pick(ITEMS));
    out.push({
      timeZone: pick(['America/New_York', 'America/Los_Angeles', 'UTC']),
      name: r() < 0.7 ? pick(['Sam', 'Ana']) : undefined,
      events,
      reminders: list(),
      tasks: list(),
      commitments: list(),
    });
  }
  return out;
}

const AT = new Date('2026-10-19T14:00:00Z');
const HAND: MorningBriefInput[] = [
  {
    timeZone: 'America/New_York',
    name: 'Sam',
    events: [
      { title: 'an invite', start: AT, allDay: true },
      { title: 'x', start: AT, allDay: true, invite: true },
    ],
    reminders: [],
    tasks: [],
    commitments: [],
  },
  { timeZone: 'America/New_York', events: [], reminders: [], tasks: [], commitments: [] },
  {
    timeZone: 'America/New_York',
    events: [{ title: '', start: AT, allDay: false }],
    reminders: [''],
    tasks: [],
    commitments: [],
  },
];

const sha = (briefs: (string | null)[]): string =>
  createHash('sha256').update(JSON.stringify(briefs)).digest('hex');

describe('morning brief, screen off: the same text as main', () => {
  it('an all-day "an invite" next to an all-day invite is listed once, as on main', () => {
    expect(composeMorningBrief(HAND[0])).toBe(
      "Morning Sam, it's Alex. Today: an invite. Call me if you want to move anything."
    );
  });

  it('same title a few seconds apart in one displayed minute is listed once', () => {
    const lunch = new Date('2026-10-19T16:45:00Z');
    const brief = composeMorningBrief({
      timeZone: 'America/New_York',
      events: [
        { title: 'LUNCH', start: lunch, allDay: false },
        { title: 'lunch', start: new Date(lunch.getTime() + 20_000), allDay: false },
      ],
      reminders: [],
      tasks: [],
      commitments: [],
    });
    expect(brief).toBe(
      "Morning, it's Alex. Today: 12:45pm LUNCH. Call me if you want to move anything."
    );
  });

  it('3,003 seeded whole-minute days match main byte for byte', () => {
    const briefs = [...HAND, ...days(3329, 3000, false)].map(composeMorningBrief);
    expect(briefs).toHaveLength(3003);
    expect(sha(briefs)).toBe('fbe380a3dc82d1cbe7c0c9a101b1cf176444a555003321573b110c3d918a1f27');
  });

  it('3,000 seeded sub-minute days match main byte for byte', () => {
    const briefs = days(9233, 3000, true).map(composeMorningBrief);
    expect(sha(briefs)).toBe('289ee139a5d6a76272286687ad36d30a5855a928cb76b39f7ec92a6d5121b45c');
  });
});
