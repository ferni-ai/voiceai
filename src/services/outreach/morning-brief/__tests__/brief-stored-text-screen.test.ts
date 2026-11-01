/**
 * OWNER_OUTREACH_STORED_TEXT_SCREEN on the morning brief (readDay): reminders,
 * tasks and commitments stored from calls go into the owner's brief only if they
 * pass the content filter while the screen is on; off, they go in as before.
 * Calendar titles are the owner's own events and are not screened. All data is
 * fictional.
 */
import { describe, expect, it, vi } from 'vitest';
import { pathFirestore } from '../../proactive-channels/__tests__/path-firestore.js';

const docs = new Map<string, Record<string, unknown>>();
const PHISH = 'call 212 555 0198 about your bank account';
const now = new Date('2026-10-19T12:05:00Z'); // 08:05 in New York

vi.mock('../../../calendar/calendar-service.js', () => ({ getEventsForDay: async () => [] }));
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
    expect(day.reminders).toEqual(['pick up the dry cleaning']);
    expect(day.tasks).toEqual(['renew the library card']);
    expect(day.commitments).toEqual(['I will stretch every morning']);
  });

  it('off: everything goes in as before', async () => {
    const day = await readDay(OWNER, user, 'America/New_York', now, env('off'));
    expect(day.reminders).toEqual([PHISH, 'pick up the dry cleaning']);
    expect(day.tasks).toEqual([PHISH, 'renew the library card']);
    expect(day.commitments).toEqual([`I will ${PHISH}`, 'I will stretch every morning']);
  });

  it('the live-call flag alone screens nothing here', async () => {
    const day = await readDay(OWNER, user, 'America/New_York', now, { UNVERIFIED_OWNER_MESSAGE_FILTER: 'on' }); // prettier-ignore
    expect(day.tasks).toContain(PHISH);
  });
});
