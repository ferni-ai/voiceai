/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN on the morning brief (readDay): reminders,
 * tasks and commitments stored from calls go into the owner's brief only if they
 * pass the content filter while the screen is on; off, they go in as before.
 * Calendar titles are the owner's own events and are not screened. All data is
 * fictional.
 */
import { describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';
import type { DayItems as DayItemsLike, MorningBriefDeps } from '../brief-job.js';
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
const { runMorningBriefs } = await import('../brief-job.js');

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

describe('the brief as sent: pieces of a number across items', () => {
  // Each half passes on its own; joined in the brief they make one phone number (fictional).
  const [HEAD, TAIL] = ['ask Dana about 212 555', '0198 for the account'];
  const event = (title: string, hour: number) => ({ title, start: new Date(Date.UTC(2026, 9, 19, hour + 4, 30)), allDay: false, invite: false }); // prettier-ignore
  async function sentBody(screen: string, day: Partial<DayItemsLike>): Promise<string> {
    const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
    const deps: MorningBriefDeps = {
      env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: OWNER, OWNER_OUTREACH_STORED_TEXT_SCREEN: screen }, // prettier-ignore
      cohortUsers: async () => [],
      userDoc: async () => ({ contactInfo: { timezone: 'America/New_York' }, name: 'Sam Tester' }),
      readDay: async () => ({ events: [], reminders: [], tasks: [], commitments: [], ...day }),
      claims: { claim: async () => true, release: async () => undefined },
      sendText,
      sendPush: vi.fn(async () => true),
    };
    await runMorningBriefs(deps, now);
    return String(sendText.mock.calls[0]?.[0].body);
  }

  it('across two tasks: on, the stored sections are dropped; off, sent as before', async () => {
    const day = { events: [event('Book club', 18)], tasks: [HEAD, TAIL] };
    const on = await sentBody('on', day);
    expect(on).toContain('Book club');
    expect(on).not.toContain('212');
    expect(await sentBody('off', day)).toContain(`${HEAD} and ${TAIL}`);
  });

  it("across two event titles (Ferni's own calendar): on, they go by time only", async () => {
    const day = { events: [event(HEAD, 9), event(TAIL, 11)], tasks: ['book flights'] };
    const on = await sentBody('on', day);
    expect(on).not.toContain('212');
    expect(on).toContain('an invite at 9:30am');
    expect(on).toContain('book flights');
    expect(await sentBody('off', day)).toContain(HEAD);
  });

  it('across the last title and the first task: on, the stored sections are dropped', async () => {
    const day = { events: [event('Book club', 9), event(HEAD, 11)], tasks: [TAIL, 'book flights'] };
    const on = await sentBody('on', day);
    expect(on).not.toContain('0198');
    expect(on).not.toContain('Still open');
    expect(await sentBody('off', day)).toContain(TAIL);
  });

  it('a busy day of ordinary titles and times is sent whole with the screen on', async () => {
    const day = {
      events: [event('Standup', 9), event('Dentist', 11), event('Lunch with Ana', 12), event('1:1 with Raj', 14), event('Gym', 17)], // prettier-ignore
      reminders: ['call the pharmacy'],
      tasks: ['renew the library card', 'book flights'],
    };
    expect(await sentBody('on', day)).toBe(await sentBody('off', day));
    expect(await sentBody('on', day)).toContain('9:30am Standup');
  });
});
