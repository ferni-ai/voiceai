/**
 * The morning brief's commitments under COMMITMENT_SINGLE_WRITER: only rows
 * the after-call judge wrote, and none about a forgotten person, even one
 * named only in the person field. Flag off: as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; data: Record<string, unknown> }>,
  forgotten: ['mindy'] as string[] | null,
}));
vi.mock('../../../calendar/calendar-service.js', () => ({ getEventsForDay: async () => [] }));
vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
vi.mock('../../../../memory/recall/forget.js', () => ({
  forgottenTopicsOrNull: async () => h.forgotten,
}));
vi.mock('../../../superhuman/commitment-follow-up.js', async (orig) => ({
  ...(await orig<typeof import('../../../superhuman/commitment-follow-up.js')>()),
  firestoreCommitmentStore: { active: async () => h.rows, markFollowedUp: async () => undefined },
}));

const { readDay } = await import('../default-deps.js');

const NOW = new Date('2026-10-18T13:05:00Z');
const row = (id: string, data: Record<string, unknown>) => ({
  id,
  data: { status: 'active', createdAt: NOW.getTime() - 86_400_000, ...data },
});
const ROWS = [
  row('legacy', { statement: 'I need to call the bank about that charge' }),
  row('judged-kept', { statement: 'text Rosa back', source: 'after-call-llm', person: 'Rosa' }),
  row('judged-forgotten', { statement: 'call your sister tomorrow', source: 'after-call-llm', person: 'Mindy' }), // prettier-ignore
];

afterEach(() => {
  delete process.env.COMMITMENT_SINGLE_WRITER;
  h.forgotten = ['mindy'];
});

describe('morning brief commitments', () => {
  it('flag off: open commitments as the old rules keep them, judged or not (the brief names two)', async () => {
    h.rows = ROWS;
    const day = await readDay('u1', {}, 'America/Chicago', NOW);
    expect(day.commitments).toEqual([
      'I need to call the bank about that charge',
      'text Rosa back',
    ]);
    // A judged row says who it is about in its statement ("call your sister tomorrow (Mindy)"),
    // so even with the flag off the forget check sees a forgotten person.
    h.rows = [ROWS[2]];
    expect((await readDay('u1', {}, 'America/Chicago', NOW)).commitments).toEqual([]);
    h.forgotten = [];
    expect((await readDay('u1', {}, 'America/Chicago', NOW)).commitments).toEqual(['call your sister tomorrow (Mindy)']); // prettier-ignore
  });

  it('flag on: only judged rows, and none about a forgotten person in the person field', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    // The forgotten one first, so the brief's limit of two can't hide a leak.
    h.rows = [ROWS[2], ROWS[0], ROWS[1]];
    const day = await readDay('u1', {}, 'America/Chicago', NOW);
    expect(day.commitments).toEqual(['text Rosa back']);
  });

  it('flag on, forget list unreadable: none', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    h.rows = ROWS;
    h.forgotten = null;
    expect((await readDay('u1', {}, 'America/Chicago', NOW)).commitments).toEqual([]);
  });
});
