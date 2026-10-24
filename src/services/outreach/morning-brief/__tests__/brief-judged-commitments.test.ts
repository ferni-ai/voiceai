/**
 * The morning brief's commitments under COMMITMENT_SINGLE_WRITER. Judged
 * commitments are call-only: since #2128 the span guard never calls an item
 * safe to send, so the writer stores every one `sensitive: true` and the brief
 * gets none, an ordinary plan included. The rows here are built by the real
 * writer (judgedCommitmentDocs). Flag off: legacy rows read as on main.
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
const { judgedCommitmentDocs } = await import('../../../superhuman/judged-commitments.js');
const { requestedFieldsFor } = await import('../../../superhuman/commitment-single-writer.js');

const NOW = new Date('2026-10-18T13:05:00Z');
/** The brief carries commitments only with MORNING_BRIEF_COMMITMENTS on (default-deps.ts). */
const ENV = { MORNING_BRIEF_COMMITMENTS: 'on' };
const row = (id: string, data: Record<string, unknown>) => ({
  id,
  data: { status: 'active', createdAt: NOW.getTime() - 86_400_000, ...data },
});
/** What the after-call writer stores for these sure, ordinary plans (no money, no credential). */
const judged = (...items: Array<{ statement: string; person?: string }>) =>
  judgedCommitmentDocs(
    items.map((i) => ({ ...i, quote: i.statement, isCommitment: true, sensitive: false, confidence: 0.95 })), // prettier-ignore
    { userId: 'u1', sessionId: 's1', now: NOW.getTime() - 86_400_000, timezone: 'America/Chicago' }
  ).map((data, i) => ({ id: `judged-${i}`, data }));
const LEGACY = row('legacy', { statement: 'I need to call the bank about that charge' });
const [ROSA, FORGOTTEN] = judged(
  { statement: 'text Rosa back', person: 'Rosa' },
  { statement: 'call your sister tomorrow', person: 'Mindy' }
);

afterEach(() => {
  delete process.env.COMMITMENT_SINGLE_WRITER;
  h.forgotten = ['mindy'];
});

describe('morning brief commitments', () => {
  it('the writer stores judged rows as it does in prod: sensitive, so call-only', () => {
    expect([ROSA.data, FORGOTTEN.data]).toMatchObject([
      { source: 'after-call-llm', sensitive: true, statement: 'text Rosa back' },
      { source: 'after-call-llm', sensitive: true, person: 'Mindy' },
    ]);
  });

  it('flag off: legacy rows as the old rules keep them; judged rows never reach the brief', async () => {
    h.rows = [LEGACY, ROSA, FORGOTTEN];
    const day = await readDay('u1', {}, 'America/Chicago', NOW, ENV);
    // The legacy line is cleaned up as every reader does (commitment-quality.ts).
    expect(day.commitments).toEqual(['call the bank about that charge']);
  });

  it('flag on: the brief gets none of the judged rows, the ordinary plan included', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    h.forgotten = [];
    h.rows = [ROSA, LEGACY, FORGOTTEN];
    expect((await readDay('u1', {}, 'America/Chicago', NOW, ENV)).commitments).toEqual([]);
  });

  it('flag on: a row the caller asked a tool for reads as on main, unless about a forgotten person', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    // As recordCommitment writes them mid-call with the flag on.
    const tag = await requestedFieldsFor('u1', { COMMITMENT_SINGLE_WRITER: 'on' });
    const asked = (id: string, statement: string, personInvolved?: string) =>
      row(id, { statement, personInvolved, ...tag });
    // The forgotten one first, so the brief's limit of two can't hide a leak.
    h.rows = [
      asked('asked-forgotten', 'I need to call my sister about the trip', 'Mindy'),
      asked('asked-deck', 'I need to send Jen the deck tomorrow'),
      LEGACY,
      ROSA,
    ];
    const day = await readDay('u1', {}, 'America/Chicago', NOW, ENV);
    expect(day.commitments).toEqual(['send Jen the deck tomorrow']);
  });

  it('flag on, forget list unreadable: none', async () => {
    process.env.COMMITMENT_SINGLE_WRITER = 'on';
    h.rows = [LEGACY, ROSA, FORGOTTEN];
    h.forgotten = null;
    expect((await readDay('u1', {}, 'America/Chicago', NOW, ENV)).commitments).toEqual([]);
  });
});
