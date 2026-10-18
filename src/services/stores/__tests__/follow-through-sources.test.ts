import type { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  commitments: [] as Array<{ id: string; data: Record<string, unknown> }>,
  summaries: [] as Array<{ id: string; data: Record<string, unknown> }>,
  forgotten: [] as string[] | null,
  failSummaries: false,
}));
vi.mock('../../superhuman/commitment-follow-up.js', async (orig) => ({
  ...(await orig<typeof import('../../superhuman/commitment-follow-up.js')>()),
  firestoreCommitmentStore: {
    active: async () => h.commitments,
    markFollowedUp: async () => undefined,
  },
}));
vi.mock('../../../memory/recall/forget.js', () => ({
  forgottenTopicsOrNull: async () => h.forgotten,
}));

const { createFollowUpSources } = await import('../follow-through-sources.js');

/** bogle_users/{uid}/reminders (where status, limit) and /summaries (newest first, limit). */
function remindersDb(reminders: Array<{ id: string; data: Record<string, unknown> }>): Firestore {
  const reminderQuery = {
    where: (_f: string, _op: string, v: unknown) => ({
      limit: () => ({
        get: async () => ({
          docs: reminders
            .filter((r) => r.data.status === v)
            .map((r) => ({ id: r.id, data: () => r.data })),
        }),
      }),
    }),
  };
  const summaryQuery = {
    orderBy: () => ({
      limit: (n: number) => ({
        get: async () => {
          if (h.failSummaries) throw new Error('summaries down');
          return { docs: h.summaries.slice(0, n).map((s) => ({ id: s.id, data: () => s.data })) };
        },
      }),
    }),
  };
  return {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => (name === 'summaries' ? summaryQuery : reminderQuery),
      }),
    }),
  } as unknown as Firestore;
}

const NOW = new Date('2026-10-12T22:00:00.000Z');
const DAY = 86_400_000;
const commitment = (id: string, statement: string) => ({
  id,
  data: {
    status: 'active',
    statement,
    createdAt: NOW.getTime() - DAY,
    followUpAfter: NOW.getTime() + DAY,
  },
});

beforeEach(() => {
  h.commitments = [];
  h.summaries = [];
  h.forgotten = [];
  h.failSummaries = false;
});

describe('follow-through sources', () => {
  it('maps pending reminders with their own zone, and skips ones with no message or time', async () => {
    const db = remindersDb([
      {
        id: 'r1',
        data: {
          status: 'pending',
          message: 'Call mom',
          scheduledFor: '2026-10-13T16:00:00.000Z',
          timezone: 'America/New_York',
        },
      },
      {
        id: 'r2',
        data: { status: 'pending', message: '', scheduledFor: '2026-10-13T16:00:00.000Z' },
      },
      {
        id: 'r3',
        data: { status: 'delivered', message: 'old', scheduledFor: '2026-10-01T16:00:00.000Z' },
      },
      {
        id: 'r4',
        data: {
          status: 'pending',
          message: 'Pay rent',
          scheduledFor: 'tomorrow',
          timezone: 'Mars/Base',
        },
      },
    ]);
    const items = await createFollowUpSources(db).itemsFor('u1', NOW);
    expect(items).toEqual([
      {
        kind: 'reminder',
        text: 'Call mom',
        dueAt: '2026-10-13T16:00:00.000Z',
        repeat: null,
        source: { store: 'reminders', ref: 'r1' },
        zone: 'America/New_York',
      },
    ]);
  });

  it('keeps real commitments and drops sign-offs, by the check-in’s own rules', async () => {
    h.commitments = [
      commitment('c1', 'I am going to apply for that job by Friday'),
      commitment('c2', 'I need to go'),
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => [i.kind, i.source.ref])).toEqual([['commitment', 'c1']]);
    expect(items[0].dueAt).toBe(new Date(NOW.getTime() + DAY).toISOString());
  });

  it('brings in threads from the last calls', async () => {
    h.summaries = [
      { id: 's1', data: { followUpItems: ['how the interview went', ' '], callerProvenance: 1 } },
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items).toEqual([
      {
        kind: 'thread',
        text: 'how the interview went',
        dueAt: null,
        repeat: null,
        source: { store: 'summaries', ref: 's1:0' },
      },
    ]);
  });

  it('leaves out anything about a topic they asked Ferni to forget', async () => {
    h.forgotten = ['ex wife'];
    h.commitments = [commitment('c1', 'I will call my ex wife about the house this week')];
    h.summaries = [
      {
        id: 's1',
        data: {
          followUpItems: ['the ex-wife and the house', 'the marathon training plan'],
          callerProvenance: 1,
        },
      },
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => i.text)).toEqual(['the marathon training plan']);
  });

  it('when the forget list cannot be read, imports reminders only', async () => {
    h.forgotten = null;
    h.commitments = [commitment('c1', 'I am going to apply for that job by Friday')];
    h.summaries = [
      { id: 's1', data: { followUpItems: ['how the interview went'], callerProvenance: 1 } },
    ];
    const db = remindersDb([
      {
        id: 'r1',
        data: { status: 'pending', message: 'Call mom', scheduledFor: '2026-10-13T16:00:00.000Z' },
      },
    ]);
    const items = await createFollowUpSources(db).itemsFor('u1', NOW);
    expect(items.map((i) => i.kind)).toEqual(['reminder']);
  });

  it('brings in only threads the caller raised: no provenance check, or raised by Ferni, stays out', async () => {
    h.summaries = [
      {
        id: 'checked',
        data: {
          callerProvenance: 1,
          followUpItems: ['the marathon training plan', 'the career offer'],
          assistantRaisedItems: ['the career offer'],
        },
      },
      // a summary written before the provenance check: its threads may be Ferni's
      { id: 'unchecked', data: { followUpItems: ['the job offer Ferni brought up'] } },
      {
        id: 'disputed',
        data: { callerProvenance: 1, followUpItems: ['the move'], disputedItems: ['the move'] },
      },
    ];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => [i.text, i.source.ref])).toEqual([
      ['the marathon training plan', 'checked:0'],
    ]);
    // the ref keeps the stored index, so a thread's id doesn't move when one before it goes
    h.summaries = [
      {
        id: 'checked',
        data: {
          callerProvenance: 1,
          followUpItems: ['the career offer', 'the marathon training plan'],
          assistantRaisedItems: ['the career offer'],
        },
      },
    ];
    const again = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(again.map((i) => i.source.ref)).toEqual(['checked:1']);
  });

  it('one source failing does not lose the others', async () => {
    h.failSummaries = true;
    h.commitments = [commitment('c1', 'I am going to apply for that job by Friday')];
    const items = await createFollowUpSources(remindersDb([])).itemsFor('u1', NOW);
    expect(items.map((i) => i.source.ref)).toEqual(['c1']);
  });
});
