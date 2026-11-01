/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN on the morning brief (readDay): reminders,
 * tasks and commitments stored from calls go into the owner's brief only if they
 * pass the content filter while the screen is on; off, they go in as before.
 * Calendar titles are the owner's own events and are not screened. All data is
 * fictional.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';
import fc from 'fast-check';
import type { MorningBriefDeps } from '../brief-job.js';
import type { MorningBriefInput } from '../compose.js';
import { pathFirestore } from '../../proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const PHISH = 'call 212 555 0198 about your bank account';
const now = new Date('2026-10-19T12:05:00Z'); // 08:05 in New York

// Ferni's own calendar: an event a call created there is the owner's by title (calendar-service.ts)
const ferniEvent = (title: string) => ({ id: title, title, startTime: new Date('2026-10-19T15:00:00Z'), endTime: new Date('2026-10-19T16:00:00Z'), isAllDay: false, status: 'confirmed', ownerResponse: 'organizer' }); // prettier-ignore
vi.mock('../../../calendar/calendar-service.js', () => ({
  getEventsForDay: async (_u: string, day: Date) =>
    day.toISOString().startsWith('2026-10-19') ? [ferniEvent(PHISH), ferniEvent('Book club')] : [],
}));
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => pathFirestore(docs) })); // prettier-ignore
vi.mock('../../../../memory/recall/forget.js', () => ({ forgottenTopicsOrNull: async () => [] }));
vi.mock('../../../superhuman/commitment-follow-up.js', () => ({
  firestoreCommitmentStore: {
    active: async () => [
      { id: 'c1', data: { statement: `I will ${PHISH}` } },
      { id: 'c2', data: { statement: 'I will stretch every morning' } },
    ],
  },
  toOpenCommitment: (id: string, data: { statement: string }) => ({
    id,
    statement: data.statement,
  }),
}));

const { readDay } = await import('../default-deps.js');
const { briefToSend, neutralizeTimes, runMorningBriefs } = await import('../brief-job.js');
const { composeMorningBrief } = await import('../compose.js');
const { blockedContent } =
  await import('../../../../tools/domains/proactive/outreach/owner-message-content.js');

const OWNER = 'owner-uid';
const user = {
  productivityData: {
    tasks: [
      { title: PHISH, status: 'pending' },
      { title: 'renew the library card', status: 'pending' },
    ],
  },
};
for (const [id, message] of [
  ['r1', PHISH],
  ['r2', 'pick up the dry cleaning'],
]) {
  docs.set(`bogle_users/${OWNER}/reminders/${id}`, {
    message,
    status: 'pending',
    scheduledFor: new Date(now.getTime() + 3_600_000).toISOString(),
    deliveryMethod: 'voice_message',
    deliveryAddress: '',
  });
}
const env = (screen: string) => ({ MORNING_BRIEF_COMMITMENTS: 'on', OWNER_OUTREACH_STORED_TEXT_SCREEN: screen }); // prettier-ignore

describe('readDay with the stored-text screen', () => {
  it('on: what carries a phone number is left out; ordinary items stay', async () => {
    const day = await readDay(OWNER, user, 'America/New_York', now, env('on'));
    // An event title from Ferni's own calendar that fails goes by time only
    expect(day.events.map((e) => [e.title, e.invite])).toEqual([[PHISH, true], ['Book club', false]]); // prettier-ignore
    expect(day.reminders).toEqual(['pick up the dry cleaning']);
    expect(day.tasks).toEqual(['renew the library card']);
    expect(day.commitments).toEqual(['I will stretch every morning']);
  });

  it('off: everything goes in as before', async () => {
    const day = await readDay(OWNER, user, 'America/New_York', now, env('off'));
    expect(day.events.map((e) => e.invite)).toEqual([false, false]);
    expect(day.reminders).toEqual([PHISH, 'pick up the dry cleaning']);
    expect(day.tasks).toEqual([PHISH, 'renew the library card']);
    expect(day.commitments).toEqual([`I will ${PHISH}`, 'I will stretch every morning']);
  });

  it('the live-call flag alone screens nothing here', async () => {
    const day = await readDay(OWNER, user, 'America/New_York', now, { UNVERIFIED_OWNER_MESSAGE_FILTER: 'on' }); // prettier-ignore
    expect(day.tasks).toContain(PHISH);
  });
});

describe('the brief as sent: one final gate on the exact text', () => {
  const ON = { OWNER_OUTREACH_STORED_TEXT_SCREEN: 'on' };
  const gatePasses = (text: string | null) => text === null || blockedContent(neutralizeTimes(text)) === null; // prettier-ignore
  const event = (title: string, hour: number) => ({ title, start: new Date(Date.UTC(2026, 9, 19, hour + 4, 30)), allDay: false, invite: false }); // prettier-ignore
  const brief = (day: Partial<MorningBriefInput>): MorningBriefInput => ({ timeZone: 'America/New_York', name: 'Sam', events: [], reminders: [], tasks: [], commitments: [], ...day }); // prettier-ignore
  // Each half passes on its own; joined they make one phone number (fictional).
  const [HEAD, TAIL] = ['ask Dana about 212 555', '0198 for the account'];

  it.each([
    ['across two tasks', { events: [event('Book club', 18)], tasks: [HEAD, TAIL] }],
    [
      'across two event titles',
      { events: [event(HEAD, 9), event(TAIL, 11)], tasks: ['book flights'] },
    ],
    [
      'across the last title and the first task',
      { events: [event('Book club', 9), event(HEAD, 11)], tasks: [TAIL] },
    ],
    ['across a reminder and a task', { reminders: [HEAD], tasks: [TAIL] }],
    [
      'a link in pieces across titles',
      { events: [event('see evil', 9), event('example dot', 10), event('com today', 11)] },
    ],
    ['across titles with nothing stored', { events: [event(HEAD, 9), event(TAIL, 10)] }],
  ])('%s: the text sent passes the gate, and the number never appears whole', (_name, day) => {
    const sent = briefToSend(brief(day), OWNER, ON);
    expect(gatePasses(sent)).toBe(true);
    expect(sent ?? '').not.toMatch(/212 555\D+0198/);
  });

  it('falls to a count of the day when every title and item is hostile', () => {
    const sent = briefToSend(brief({ events: [event(HEAD, 9), event(TAIL, 10)], tasks: [HEAD, TAIL] }), OWNER, ON); // prettier-ignore
    expect(gatePasses(sent)).toBe(true);
    expect(sent).not.toContain('212');
  });

  it('property: however a number or a link is split across titles and items, the text sent passes', () => {
    const secret = fc.constantFrom('ask about 212 555 0198 today', 'go to evil dot example dot com now', 'call 2125550198'); // prettier-ignore
    const split = secret.chain((s) =>
      fc.uniqueArray(fc.integer({ min: 1, max: s.length - 1 }), { maxLength: 3 }).map((cuts) => {
        const at = [0, ...cuts.sort((a, b) => a - b), s.length];
        return at
          .slice(1)
          .map((end, k) => s.slice(at[k], end).trim())
          .filter(Boolean);
      })
    );
    const placed = fc.tuple(split, fc.array(fc.constantFrom('title', 'reminder', 'task'), { minLength: 4, maxLength: 4 })); // prettier-ignore
    fc.assert(
      fc.property(placed, ([pieces, where]) => {
        const day = { events: [] as ReturnType<typeof event>[], reminders: [] as string[], tasks: [] as string[] }; // prettier-ignore
        pieces.forEach((p, k) => {
          if (where[k] === 'title') day.events.push(event(p, 9 + k));
          else (where[k] === 'reminder' ? day.reminders : day.tasks).push(p);
        });
        return gatePasses(briefToSend(brief(day), OWNER, ON));
      }),
      { seed: 3227, numRuns: 400 }
    );
  });

  it('a busy day of ordinary titles and times goes whole with the screen on', () => {
    const day = brief({
      events: [event('Standup', 9), event('Dentist', 11), event('Lunch with Ana', 12), event('1:1 with Raj', 14), event('Gym', 17)], // prettier-ignore
      reminders: ['call the pharmacy'],
      tasks: ['renew the library card', 'book flights'],
    });
    expect(briefToSend(day, OWNER, ON)).toBe(composeMorningBrief(day));
    expect(briefToSend(day, OWNER, ON)).toContain('9:30am Standup');
  });

  it('with the screen off, the brief is exactly as composed', () => {
    const day = brief({ events: [event(HEAD, 9), event(TAIL, 10)], tasks: [HEAD, TAIL] });
    expect(briefToSend(day, OWNER, {})).toBe(composeMorningBrief(day));
  });

  it('runMorningBriefs sends what briefToSend returns', async () => {
    const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
    const deps: MorningBriefDeps = {
      env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: OWNER, ...ON },
      cohortUsers: async () => [],
      userDoc: async () => ({ contactInfo: { timezone: 'America/New_York' }, name: 'Sam Tester' }),
      readDay: async () => ({ events: [event('Book club', 18)], reminders: [], tasks: [HEAD, TAIL], commitments: [] }), // prettier-ignore
      claims: { claim: async () => true, release: async () => undefined },
      sendText,
      sendPush: vi.fn(async () => true),
    };
    await runMorningBriefs(deps, now);
    const body = String(sendText.mock.calls[0]?.[0].body);
    expect(body).toContain('Book club');
    expect(body).not.toContain('212');
  });
});
